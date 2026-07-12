import * as React from "react";
import type { ChatState } from "@/hooks/use-chat";
import { collectAppState } from "@/lib/app-state";
import { frontendLog } from "@/lib/frontend-log";
import { applyServerUpdates, stateSnapshot } from "@/lib/state-store";

/**
 * The realtime voice collaborator (decisions.md D5): a toggled live
 * conversation with OpenAI's realtime model, audio flowing browser ⇄ OpenAI
 * directly over WebRTC. The server only mints the ephemeral credential
 * (POST /api/voice/session) — it also fixed the session's model, voice,
 * instructions, and tool schemas at mint time, so this hook's job is
 * plumbing: microphone in, remote audio out, and tool calls arriving on the
 * data channel.
 *
 * Tool calls route by the mint response's `frontendTools` list: those
 * execute right here against the live app (screenshot, state read/write —
 * writes take the same D3 store path as a user click); every other name
 * bridges to the back end over the chat websocket (chat.callVoiceTool).
 * Finished utterances on both sides are folded into the shared chat
 * transcript (chat.sendVoiceTranscript), so voice and typed chat read as
 * one conversation.
 */

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "tool"
  | "error";

export interface VoiceState {
  status: VoiceStatus;
  /** A live session exists (listening/speaking/tool) or is being opened. */
  active: boolean;
  /** Why the last session ended abnormally; null after a clean stop. */
  error: string | null;
  /** Open a session if none is live, else close the live one. */
  toggle: () => void;
}

/** Where the browser sends its SDP offer, per the current Realtime docs. */
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/**
 * An open mic bills per minute, so a forgotten session must close itself:
 * this long with no speech, no model output, and no tool activity ends it.
 */
const IDLE_CLOSE_MS = 2 * 60_000;

/** The subset of chat the session needs; read via a getter so the session
 * always sees the current render's callbacks. */
type ChatBridge = Pick<ChatState, "callVoiceTool" | "sendVoiceTranscript">;

interface VoiceSessionHooks {
  chat(): ChatBridge;
  onStatus(status: VoiceStatus): void;
  /** Fired exactly once when the session is gone; error set if abnormal. */
  onEnd(error?: string): void;
}

/** A function_call item from a completed model response. */
interface FunctionCallItem {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

/**
 * One live WebRTC session. Lifecycle: start() → (live, events flowing) →
 * stop()/idle-timeout/failure → end(), which tears everything down and
 * fires onEnd exactly once — every exit path funnels through it, so the
 * owning hook can treat onEnd as the single source of session death.
 */
class VoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private ended = false;
  /** Tool calls in flight; status shows "tool" while nonzero. */
  private runningTools = 0;
  /** True while the model's audio is playing (barge-in clears it). */
  private modelSpeaking = false;
  /** Tool names to execute locally, from the mint response. */
  private frontendTools: string[] = [];
  private readonly hooks: VoiceSessionHooks;

  constructor(hooks: VoiceSessionHooks) {
    this.hooks = hooks;
  }

  /**
   * Mint credentials, open the mic, and complete the WebRTC handshake.
   * Any failure (including a user toggle-off mid-connect, which end()s the
   * session under us) cleans up through end() with a speakable message.
   */
  async start(): Promise<void> {
    this.hooks.onStatus("connecting");
    frontendLog("voice:start");
    try {
      const minted = await fetch("/api/voice/session", { method: "POST" });
      const session = (await minted.json().catch(() => null)) as {
        value?: string;
        frontendTools?: string[];
        error?: string;
      } | null;
      if (!minted.ok || !session?.value) {
        throw new Error(
          session?.error ?? `voice session request failed (${minted.status})`
        );
      }
      this.frontendTools = session.frontendTools ?? [];

      // The mic prompt can sit open indefinitely; a denial is a normal,
      // explainable outcome — not a crash.
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error("microphone access was denied or unavailable");
      }
      if (this.ended) {
        for (const track of mic.getTracks()) track.stop();
        return;
      }
      this.mic = mic;

      const pc = new RTCPeerConnection();
      this.pc = pc;
      this.audio = document.createElement("audio");
      this.audio.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audio) this.audio.srcObject = e.streams[0];
      };
      pc.addTrack(mic.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => this.onServerEvent(String(e.data));
      dc.onopen = () => {
        frontendLog("voice:connected");
        this.refreshStatus();
        this.bumpIdleTimer();
      };
      // The remote side closing the channel (secret expiry, network drop)
      // ends the session — a mic staying hot with no model is the worst
      // failure mode.
      dc.onclose = () => this.end();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!answer.ok) {
        throw new Error(`realtime connection refused (${answer.status})`);
      }
      const sdp = await answer.text();
      if (this.ended) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (err) {
      this.end(err instanceof Error ? err.message : String(err));
    }
  }

  /** User-initiated close; also the idle-timeout path. */
  stop(): void {
    this.end();
  }

  /** Tear down every resource and report the outcome — exactly once. */
  private end(error?: string): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.idleTimer);
    if (this.dc) this.dc.onclose = null;
    this.dc?.close();
    this.pc?.close();
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    if (this.audio) this.audio.srcObject = null;
    frontendLog("voice:end", { error });
    this.hooks.onEnd(error);
  }

  /** Route one data-channel event from the model. */
  private onServerEvent(raw: string): void {
    let event: { type?: string } & Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    switch (event.type) {
      // The user spoke: any playing audio was interrupted (barge-in is
      // handled by the API); this also proves the session isn't idle.
      case "input_audio_buffer.speech_started":
        this.modelSpeaking = false;
        this.refreshStatus();
        this.bumpIdleTimer();
        return;

      case "output_audio_buffer.started":
        this.modelSpeaking = true;
        this.refreshStatus();
        this.bumpIdleTimer();
        return;

      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.modelSpeaking = false;
        this.refreshStatus();
        this.bumpIdleTimer();
        return;

      // Finished transcriptions feed the shared chat transcript (voice
      // row 8): what the user said, then what the model said back.
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = event.transcript;
        if (typeof transcript === "string" && transcript.trim()) {
          this.hooks.chat().sendVoiceTranscript("user", transcript);
        }
        return;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const transcript = event.transcript;
        if (typeof transcript === "string" && transcript.trim()) {
          this.hooks.chat().sendVoiceTranscript("assistant", transcript);
        }
        return;
      }

      // A completed response may carry function calls to execute.
      case "response.done": {
        this.bumpIdleTimer();
        const response = event.response as
          | { output?: Array<Record<string, unknown>> }
          | undefined;
        const calls = (response?.output ?? []).filter(
          (item): item is FunctionCallItem & Record<string, unknown> =>
            item.type === "function_call" &&
            typeof item.name === "string" &&
            typeof item.call_id === "string"
        );
        if (calls.length > 0) void this.runToolCalls(calls);
        return;
      }

      case "error":
        frontendLog("voice:model-error", { error: event.error });
        return;
    }
  }

  /**
   * Execute the response's tool calls in order, answer each with a
   * function_call_output, then ask for the follow-up response. A failed
   * tool answers with {error} instead of breaking the loop — the model
   * must always get exactly one output per call_id, or the conversation
   * wedges waiting for it.
   */
  private async runToolCalls(calls: FunctionCallItem[]): Promise<void> {
    this.runningTools += calls.length;
    this.refreshStatus();
    try {
      for (const call of calls) {
        let output: string;
        try {
          const args = call.arguments
            ? (JSON.parse(call.arguments) as Record<string, unknown>)
            : {};
          output = await this.runTool(call.name, args);
        } catch (err) {
          output = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }
        frontendLog("voice:tool-done", { name: call.name });
        this.sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output,
          },
        });
      }
      this.sendClientEvent({ type: "response.create" });
    } finally {
      this.runningTools -= calls.length;
      this.refreshStatus();
      this.bumpIdleTimer();
    }
  }

  /**
   * One tool call: front-end tools run against the live app right here;
   * anything else bridges to the back end's registry executor. Returns the
   * output string for the model; throws message text the model can act on.
   */
  private async runTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    if (!this.frontendTools.includes(name)) {
      return this.hooks.chat().callVoiceTool(name, args);
    }
    switch (name) {
      case "get_app_state": {
        const { state } = await collectAppState({ screenshot: false });
        return JSON.stringify(state);
      }
      case "set_app_state": {
        const updates = args.updates;
        if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
          throw new Error("updates must be an object of key → value");
        }
        const applied = applyServerUpdates(
          updates as Record<string, unknown>
        );
        return JSON.stringify({ applied, store: stateSnapshot() });
      }
      case "take_screenshot": {
        const { screenshot } = await collectAppState({ screenshot: true });
        if (!screenshot) {
          throw new Error("could not capture the main panel right now");
        }
        // Realtime image input rides the conversation, not the function
        // result: attach the capture as a user-role image item, and let
        // the function output point the model at it.
        this.sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_image", image_url: screenshot }],
          },
        });
        return "Screenshot attached to the conversation as an image.";
      }
      default:
        throw new Error(`front-end tool "${name}" is not implemented`);
    }
  }

  private sendClientEvent(payload: Record<string, unknown>): void {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(payload));
    }
  }

  /** Status priority: tool work > model audio > waiting for the user. */
  private refreshStatus(): void {
    if (this.ended) return;
    this.hooks.onStatus(
      this.runningTools > 0
        ? "tool"
        : this.modelSpeaking
          ? "speaking"
          : "listening"
    );
  }

  /** Restart the idle clock; called on every sign of a live conversation. */
  private bumpIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      frontendLog("voice:idle-close");
      this.end();
    }, IDLE_CLOSE_MS);
  }
}

/**
 * Owns at most one live VoiceSession. `toggle` opens or closes it; the
 * session reports status transitions and its (single) end through the
 * hook's state, so the mic button and status strip render from one source.
 */
export function useVoice(chat: ChatState): VoiceState {
  const [status, setStatus] = React.useState<VoiceStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const sessionRef = React.useRef<VoiceSession | null>(null);
  // The session reads chat through this ref, so callbacks stay current
  // across renders without re-creating the session.
  const chatRef = React.useRef(chat);
  chatRef.current = chat;

  // Unmount must never leave a hot mic behind.
  React.useEffect(() => () => sessionRef.current?.stop(), []);

  const toggle = React.useCallback(() => {
    const live = sessionRef.current;
    if (live) {
      live.stop();
      return;
    }
    setError(null);
    const session = new VoiceSession({
      chat: () => chatRef.current,
      onStatus: setStatus,
      onEnd: (endError) => {
        sessionRef.current = null;
        setError(endError ?? null);
        setStatus(endError ? "error" : "idle");
      },
    });
    sessionRef.current = session;
    void session.start();
  }, []);

  return {
    status,
    error,
    active: status !== "idle" && status !== "error",
    toggle,
  };
}

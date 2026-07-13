import * as React from "react";
import type { ChatState } from "@/hooks/use-chat";
import { collectAppState } from "@/lib/app-state";
import { frontendLog } from "@/lib/frontend-log";
import { indicate, type IndicateTarget } from "@/lib/indicate";
import {
  applyServerUpdates,
  stateSnapshot,
  useStoreValue,
} from "@/lib/state-store";

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

export interface MicDevice {
  deviceId: string;
  label: string;
}

export interface VoiceState {
  status: VoiceStatus;
  /** A live session exists (listening/speaking/tool) or is being opened. */
  active: boolean;
  /** Why the last session ended abnormally; null after a clean stop. */
  error: string | null;
  /**
   * A live-session problem worth telling the user about while the session
   * stays up — currently "your mic is capturing silence" (wrong input
   * device, OS-level permission, routing tools). Cleared once speech is
   * actually heard.
   */
  warning: string | null;
  /**
   * Live capture level from the local mic, 0..1, updated a few times per
   * second while a session is up (0 when idle). The debugging surface for
   * "is the mic hearing me at all": if this never moves while you talk,
   * the model can't hear you either.
   */
  inputLevel: number;
  /** Label of the device actually being captured (null when idle). */
  micLabel: string | null;
  /** Every available input device, for the picker (labels need an active
   * or previously granted mic permission to be non-empty). */
  inputDevices: MicDevice[];
  /** The picked deviceId ("" = browser default). */
  inputDevice: string;
  /**
   * Names of the voice model's tool calls currently executing (empty when
   * none; status is "tool" while non-empty). Lets the UI say *what* is
   * running — e.g. a long ask_artifact_agent delegation shows live progress
   * instead of a bare "working" dot.
   */
  runningTools: string[];
  /**
   * Choose the capture device. Applies immediately to a live session
   * (replaceTrack — the call stays up) and to every later session.
   */
  setInputDevice: (deviceId: string) => void;
  /** Open a session if none is live, else close the live one. */
  toggle: () => void;
}

/** Where the browser sends its SDP offer, per the current Realtime docs. */
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/**
 * The typing loop heard while a bridged tool call runs — audibly, the
 * assistant working at its computer (served from client/public/sounds).
 */
const KEYBOARD_LOOP_URL = "/sounds/tool-call-loop.mp3";

/**
 * An open mic bills per minute, so a forgotten session must close itself:
 * this long with no speech, no model output, and no tool activity ends it.
 */
const IDLE_CLOSE_MS = 2 * 60_000;

/**
 * WebRTC data channels refuse messages beyond ~256KB (seen live as
 * "snapshot send was too large for the channel"), and the main-view capture
 * is a full-pixel-ratio JPEG data URL that regularly exceeds that. Budget
 * for the data URL itself: data URLs are pure ASCII, so chars ≈ bytes, and
 * 200KB leaves comfortable headroom for the JSON event envelope around it.
 */
const SNAPSHOT_MAX_CHARS = 200_000;
/** First-pass downscale bound for the voice path (longest edge, px). */
const SNAPSHOT_MAX_EDGE = 1024;
/** First-pass JPEG re-encode quality for the voice path. */
const SNAPSHOT_QUALITY = 0.6;

/**
 * Re-encode a captured data URL so it fits a data-channel message: downscale
 * to SNAPSHOT_MAX_EDGE on the longest side and recompress, then keep
 * shrinking (smaller edge, lower quality) until it fits SNAPSHOT_MAX_CHARS.
 * Each pass cuts the pixel area roughly in half, so a handful of passes
 * always lands under the budget for real screen content; the throw is a
 * teaching error for the model in the pathological case.
 */
async function shrinkSnapshotForDataChannel(dataUrl: string): Promise<string> {
  if (dataUrl.length <= SNAPSHOT_MAX_CHARS) return dataUrl;
  const image = await decodeDataUrl(dataUrl);
  let edge = SNAPSHOT_MAX_EDGE;
  let quality = SNAPSHOT_QUALITY;
  for (let pass = 0; pass < 6; pass++) {
    const out = reencodeImage(image, edge, quality);
    if (out.length <= SNAPSHOT_MAX_CHARS) return out;
    edge = Math.round(edge * 0.7);
    quality = Math.max(0.4, quality - 0.05);
  }
  throw new Error("the screenshot could not be compressed enough to send");
}

/** Decode a data URL back into a drawable image element. */
function decodeDataUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("could not decode the screenshot for re-encoding"));
    image.src = url;
  });
}

/** Draw the image at ≤ maxEdge on its longest side, return a JPEG data URL. */
function reencodeImage(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number
): string {
  const scale = Math.min(
    1,
    maxEdge / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** The subset of chat the session needs; read via a getter so the session
 * always sees the current render's callbacks. */
type ChatBridge = Pick<ChatState, "callVoiceTool" | "sendVoiceTranscript">;

interface VoiceSessionHooks {
  chat(): ChatBridge;
  /** deviceId to capture from at session start ("" = browser default). */
  preferredDevice(): string;
  onStatus(status: VoiceStatus): void;
  /** A mid-session problem to surface (null clears it). */
  onWarning(message: string | null): void;
  /** Live local capture level, 0..1 (a few times per second). */
  onLevel(level: number): void;
  /** Label of the device currently being captured. */
  onMicLabel(label: string | null): void;
  /** Names of tool calls currently executing (empty when none). */
  onTools(names: string[]): void;
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
  private silenceTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The keyboard-typing loop that plays while a bridged tool call runs
   * (see runTool). Lazily created, shared across calls; `bridgedCalls`
   * counts overlapping calls so the loop stops only when the last one
   * finishes.
   */
  private keyboardLoop: HTMLAudioElement | null = null;
  private bridgedCalls = 0;
  /** Local level meter: WebAudio analyser over the current mic stream. */
  private meterCtx: AudioContext | null = null;
  private meterTimer: ReturnType<typeof setInterval> | undefined;
  private ended = false;
  /** Names of tool calls in flight; status shows "tool" while non-empty. */
  private runningTools: string[] = [];
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
      const mic = await this.acquireMic(this.hooks.preferredDevice());
      if (this.ended) {
        for (const track of mic.getTracks()) track.stop();
        return;
      }
      this.adoptMicStream(mic);

      const pc = new RTCPeerConnection();
      this.pc = pc;
      // Debug handle: WebRTC internals (RTP stats, track states) are
      // otherwise unreachable from devtools because everything lives in
      // this closure. `await __voicePc.getStats()` answers "is audio
      // actually flowing" in one line.
      (window as unknown as Record<string, unknown>).__voicePc = pc;
      pc.onconnectionstatechange = () => {
        frontendLog("voice:pc-state", { state: pc.connectionState });
      };
      // The playback element lives in the DOM (hidden) for the session's
      // lifetime: detached elements are subject to GC and stricter autoplay
      // treatment, either of which silences the model with no error.
      this.audio = document.createElement("audio");
      this.audio.autoplay = true;
      this.audio.style.display = "none";
      document.body.appendChild(this.audio);
      pc.ontrack = (e) => {
        if (!this.audio) return;
        this.audio.srcObject = e.streams[0];
        // Autoplay can still be refused (policy, output device) — surface
        // it instead of a silent session.
        this.audio.play().catch((err: unknown) => {
          frontendLog("voice:audio-blocked", { error: String(err) });
        });
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
      // The remote side closing the channel (secret expiry, media timeout,
      // network drop) ends the session — a mic staying hot with no model is
      // the worst failure mode — and the user must hear about it: observed
      // in the wild when the mic streams silence (OpenAI drops the call
      // after ~45s of no audio).
      dc.onclose = () =>
        this.end("the voice connection was closed by the server");

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
      this.startSilenceWatchdog(pc);
    } catch (err) {
      this.end(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Detect the "hot mic, silent stream" failure: browser permission granted
   * (getUserMedia resolved, recording indicator on) but the track delivers
   * digital silence — wrong input device (clamshell laptop, virtual routing
   * device), OS-level permission, or a muted interface. A real room never
   * measures ~zero total energy after several seconds, so a near-zero
   * reading is a config problem worth telling the user about, not quiet.
   * The warning clears when speech is actually heard (speech_started) and
   * the check re-arms on a device switch so a fix is confirmed or re-flagged.
   */
  private startSilenceWatchdog(pc: RTCPeerConnection): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(async () => {
      if (this.ended) return;
      let energy: number | undefined;
      try {
        const stats = await pc.getStats();
        stats.forEach((report: Record<string, unknown>) => {
          if (report.type === "media-source" && report.kind === "audio") {
            energy =
              typeof report.totalAudioEnergy === "number"
                ? report.totalAudioEnergy
                : undefined;
          }
        });
      } catch {
        return; // stats unavailable — nothing trustworthy to report
      }
      if (energy !== undefined && energy < 1e-6) {
        frontendLog("voice:mic-silent", { totalAudioEnergy: energy });
        this.hooks.onWarning(
          "This mic is capturing pure silence — I can't hear you. Watch the level bar while you talk and try another input device from the picker."
        );
      }
    }, 6_000);
  }

  /** getUserMedia for the chosen device, with a user-explainable failure. */
  private async acquireMic(deviceId: string): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      throw new Error(
        deviceId
          ? "could not open the selected microphone"
          : "microphone access was denied or unavailable"
      );
    }
  }

  /**
   * Make `stream` the session's capture source: remember it, report its
   * device label, and point the level meter at it. The stream is not yet
   * attached to the peer connection — start() adds the track, and
   * setInputDevice replaces it.
   */
  private adoptMicStream(stream: MediaStream): void {
    this.mic = stream;
    const label = stream.getTracks()[0]?.label ?? null;
    this.hooks.onMicLabel(label);
    frontendLog("voice:mic-device", { label });
    this.attachMeter(stream);
  }

  /**
   * Switch the live capture device without dropping the call: open the new
   * device, swap it into the RTP sender (replaceTrack — no renegotiation),
   * then release the old one. Re-arms the silence watchdog so the picker
   * doubles as a mic tester: pick a device, watch the level bar, get
   * re-warned within seconds if it is silent too. No-op after end().
   */
  async setInputDevice(deviceId: string): Promise<void> {
    if (this.ended || !this.pc) return;
    let stream: MediaStream;
    try {
      stream = await this.acquireMic(deviceId);
    } catch (err) {
      this.hooks.onWarning(err instanceof Error ? err.message : String(err));
      return;
    }
    if (this.ended) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "audio");
    await sender?.replaceTrack(stream.getTracks()[0]);
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    this.hooks.onWarning(null);
    this.adoptMicStream(stream);
    this.startSilenceWatchdog(this.pc);
  }

  /**
   * Live input-level meter over the local mic — the "can it hear me at
   * all" debugging surface. WebAudio analyser, peak amplitude sampled a
   * few times per second, reported through onLevel for the UI to draw.
   */
  private attachMeter(stream: MediaStream): void {
    this.detachMeter();
    try {
      const ctx = new AudioContext();
      this.meterCtx = ctx;
      // Capturing pages may still get a suspended context; resuming is
      // best-effort — a dead meter must never kill the session.
      void ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      this.meterTimer = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const value of samples) {
          peak = Math.max(peak, Math.abs(value - 128) / 128);
        }
        this.hooks.onLevel(peak);
      }, 150);
    } catch (err) {
      frontendLog("voice:meter-failed", { error: String(err) });
    }
  }

  private detachMeter(): void {
    clearInterval(this.meterTimer);
    void this.meterCtx?.close().catch(() => {});
    this.meterCtx = null;
  }

  /** User-initiated close; also the idle-timeout path. */
  stop(): void {
    this.end();
  }

  /** Start (or keep) the typing loop; one more bridged call is in flight. */
  private startKeyboardLoop(): void {
    this.bridgedCalls += 1;
    if (this.ended) return;
    if (!this.keyboardLoop) {
      this.keyboardLoop = new Audio(KEYBOARD_LOOP_URL);
      this.keyboardLoop.loop = true;
      // Background texture under the conversation, not a foreground sound.
      this.keyboardLoop.volume = 0.35;
    }
    if (this.keyboardLoop.paused) {
      this.keyboardLoop.play().catch((err: unknown) => {
        frontendLog("voice:keyboard-loop-blocked", { error: String(err) });
      });
    }
  }

  /** One bridged call finished; silence the loop when it was the last. */
  private stopKeyboardLoop(): void {
    this.bridgedCalls = Math.max(0, this.bridgedCalls - 1);
    if (this.bridgedCalls > 0 || !this.keyboardLoop) return;
    this.keyboardLoop.pause();
    this.keyboardLoop.currentTime = 0;
  }

  /** Tear down every resource and report the outcome — exactly once. */
  private end(error?: string): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.idleTimer);
    clearTimeout(this.silenceTimer);
    this.detachMeter();
    this.hooks.onLevel(0);
    this.hooks.onMicLabel(null);
    if (this.dc) this.dc.onclose = null;
    this.dc?.close();
    this.pc?.close();
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio.remove();
    }
    // A dead session must not keep typing: in-flight bridged calls resolve
    // into a closed dc, so nothing else would stop the loop.
    this.keyboardLoop?.pause();
    this.keyboardLoop = null;
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
    // Every non-delta event type goes to the event log: the session's whole
    // life is diagnosable from the JSONL alone (deltas are dozens per
    // second and carry no lifecycle information).
    if (typeof event.type === "string" && !event.type.endsWith(".delta")) {
      frontendLog("voice:event", { type: event.type });
    }
    switch (event.type) {
      // The user spoke: any playing audio was interrupted (barge-in is
      // handled by the API); this also proves the session isn't idle —
      // and that the mic audibly works, so any silence warning is stale.
      case "input_audio_buffer.speech_started":
        this.modelSpeaking = false;
        this.hooks.onWarning(null);
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
        console.error("[voice]", event.error);
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
    this.runningTools = [...this.runningTools, ...calls.map((c) => c.name)];
    this.hooks.onTools(this.runningTools);
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
      // Remove exactly this batch's names (another batch may be in flight).
      const remaining = [...this.runningTools];
      for (const call of calls) {
        const at = remaining.indexOf(call.name);
        if (at !== -1) remaining.splice(at, 1);
      }
      this.runningTools = remaining;
      this.hooks.onTools(this.runningTools);
      this.refreshStatus();
      this.bumpIdleTimer();
    }
  }

  /**
   * One tool call: front-end tools run against the live app right here;
   * anything else bridges to the back end's registry executor. Returns the
   * output string for the model; throws message text the model can act on.
   *
   * Bridged calls run under the keyboard-typing loop: audibly, the
   * assistant is working at the computer — looking something up, editing a
   * file — which is exactly the persona (its tools are its own hands, never
   * a handoff to something else).
   */
  private async runTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    if (!this.frontendTools.includes(name)) {
      this.startKeyboardLoop();
      try {
        return await this.hooks.chat().callVoiceTool(name, args);
      } finally {
        this.stopKeyboardLoop();
      }
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
      case "expand_artifact": {
        const file = args.file;
        if (typeof file !== "string" || !file.trim()) {
          throw new Error("pass `file`: the .oui wiki path to expand");
        }
        if (!file.toLowerCase().endsWith(".oui")) {
          throw new Error(`only .oui artifacts expand — "${file}" is not one`);
        }
        const url = file.startsWith("/") ? file : `/docs/${file}`;
        applyServerUpdates({ "app/expanded-artifact": url });
        return JSON.stringify({ expanded: url });
      }
      case "minimize_artifact": {
        applyServerUpdates({ "app/expanded-artifact": null });
        return JSON.stringify({ minimized: true });
      }
      case "indicate": {
        const result = indicate(args as IndicateTarget);
        if (!result.ok) throw new Error(result.detail);
        return JSON.stringify(result);
      }
      case "take_screenshot": {
        const { screenshot } = await collectAppState({ screenshot: true });
        if (!screenshot) {
          throw new Error("could not capture the main panel right now");
        }
        // The raw capture regularly exceeds the data channel's ~256KB
        // message limit — re-encode it down to the voice-path budget first.
        const image = await shrinkSnapshotForDataChannel(screenshot);
        // Realtime image input rides the conversation, not the function
        // result: attach the capture as a user-role image item, and let
        // the function output point the model at it.
        const event = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_image", image_url: image }],
          },
        };
        // The channel message is the JSON envelope; data URLs are ASCII, so
        // its length is its byte size — logged for future size diagnosis.
        frontendLog("voice:screenshot", {
          messageBytes: JSON.stringify(event).length,
          capturedChars: screenshot.length,
          sentChars: image.length,
        });
        this.sendClientEvent(event);
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
      this.runningTools.length > 0
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
  const [warning, setWarning] = React.useState<string | null>(null);
  const [inputLevel, setInputLevel] = React.useState(0);
  const [micLabel, setMicLabel] = React.useState<string | null>(null);
  const [runningTools, setRunningTools] = React.useState<string[]>([]);
  const [inputDevices, setInputDevices] = React.useState<MicDevice[]>([]);
  // The picked device lives in the D3 store: visible in state snapshots and
  // settable like any other app state ("" = browser default).
  const [inputDevice, setStoredDevice] = useStoreValue("app/voice-mic", "");
  const sessionRef = React.useRef<VoiceSession | null>(null);
  // The session reads chat and the picked device through refs, so callbacks
  // stay current across renders without re-creating the session.
  const chatRef = React.useRef(chat);
  chatRef.current = chat;
  const deviceRef = React.useRef(inputDevice);
  deviceRef.current = inputDevice;

  // Unmount must never leave a hot mic behind.
  React.useEffect(() => () => sessionRef.current?.stop(), []);

  // The input-device inventory, refreshed when hardware comes and goes.
  // Labels are only populated once mic permission has been granted; the
  // picker degrades to "Default microphone" alone until then.
  React.useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (disposed) return;
        setInputDevices(
          devices
            .filter((d) => d.kind === "audioinput" && d.deviceId)
            .map((d) => ({ deviceId: d.deviceId, label: d.label || "Microphone" }))
        );
      } catch {
        // No device API (insecure context) — the picker just stays empty.
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => {
      disposed = true;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }, []);

  const setInputDevice = React.useCallback(
    (deviceId: string) => {
      setStoredDevice(deviceId);
      // A live session switches in place (replaceTrack keeps the call up);
      // otherwise the choice simply applies to the next session.
      void sessionRef.current?.setInputDevice(deviceId);
    },
    [setStoredDevice]
  );

  const toggle = React.useCallback(() => {
    const live = sessionRef.current;
    if (live) {
      live.stop();
      return;
    }
    setError(null);
    setWarning(null);
    const session = new VoiceSession({
      chat: () => chatRef.current,
      preferredDevice: () => deviceRef.current,
      onStatus: setStatus,
      onWarning: setWarning,
      onLevel: setInputLevel,
      onMicLabel: setMicLabel,
      onTools: setRunningTools,
      onEnd: (endError) => {
        sessionRef.current = null;
        setError(endError ?? null);
        setWarning(null);
        setRunningTools([]);
        setStatus(endError ? "error" : "idle");
      },
    });
    sessionRef.current = session;
    void session.start();
  }, []);

  return {
    status,
    error,
    warning,
    inputLevel,
    micLabel,
    inputDevices,
    inputDevice,
    runningTools,
    setInputDevice,
    active: status !== "idle" && status !== "error",
    toggle,
  };
}

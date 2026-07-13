import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { WebSocket } from "ws";
import type { ClaudeSession, ClaudeStreamEvent } from "./claude.js";
import type { JsonlLogger } from "./logger.js";
import { extractSpecSoFar } from "./partial-json.js";
import type {
  ArtifactEditCommand,
  ArtifactSaveCommand,
  ClientMessage,
  FeedbackEnvelope,
  ServerEvent,
  VoiceToolCommand,
} from "./protocol.js";
import { executeVoiceTool } from "./voice-tools.js";
import {
  editArtifactSpec,
  ensureTrailingNewline,
  wikiDocPath,
} from "./wiki-service.js";

/** The `ui` MCP tool as the model sees it (mcp__<server>__<tool>). */
const UI_TOOL_NAME = "mcp__ui__ui";

/**
 * The pre-warm turn's message: the cheapest possible turn that still drives
 * the CLI through full session init and one API round trip (which also
 * writes the prompt cache for the real first ask). Phrased so the model
 * spends no thinking, calls no tools, and emits two tokens.
 */
const WARMUP_PROMPT =
  'Session warm-up ping (not from the user). Reply with only "ok" — ' +
  "no tools, no other text.";

/**
 * Longest a voice delegation waits for the Claude session's final answer.
 * On expiry the voice model gets a "still working" message rather than an
 * error — the work itself continues and lands in the panel/wiki as usual.
 */
const DELEGATION_TIMEOUT_MS = 5 * 60_000;

/**
 * Model each ask_artifact_agent mode selects (perf-eval calibrated: Sonnet 5
 * matched Opus 4.8 on speed and cost in the model sweep, while Haiku added
 * 6.6–8.2s of thinking per delegated turn — eval/agent-timing-report.md).
 *
 * Always full model ids, never CLI aliases: ClaudeSession restarts whenever
 * the requested model string differs from the active one, so an alias like
 * "opus" reads as a switch away from "claude-opus-4-8" and forces a spurious
 * respawn (plus a fresh prompt-cache write) on every delegation. With exact
 * ids, `smart` on the production default is a same-model no-op — no respawn.
 * VOICE_SMART_MODEL / VOICE_FAST_MODEL overrides must also be full ids.
 */
function delegationModel(mode: "fast" | "smart"): string {
  return mode === "smart"
    ? process.env.VOICE_SMART_MODEL || "claude-opus-4-8"
    : process.env.VOICE_FAST_MODEL || "claude-opus-4-8";
}

// Both modes intentionally share the production default: any model switch
// respawns the CLI, and the agent-timing-fixed runs measured the respawn
// path at 6.5–8.3s vs 4.4–5.5s for no-switch on the same job, with ~15K
// extra uncached prompt tokens per API call — AND a startup race in which
// the respawned CLI sometimes registers zero MCP tools, so the delegated
// turn runs without ui/vault/wiki access entirely (events_fast_2 in
// eval/results/agent-timing-fixed: init reports no mcp__* tools; the model
// then wrote to the sandbox and reported it couldn't reach the wiki). Until
// a genuinely faster same-process tier exists (e.g. a fast-mode CLI flag),
// "fast" ≠ a smaller model. Overrides via VOICE_FAST/SMART_MODEL re-enable
// switching — they inherit the respawn cost and the MCP race.

/**
 * Prepended to every delegated request: the agent-timing eval caught
 * delegated "create a wiki file" jobs writing via the sandbox Write tool —
 * the file lands in the CLI's working directory, not the wiki, while the
 * reply still claims success (eval/agent-timing-report.md, correctness
 * section). Typed chat turns don't get this — the user is watching and the
 * production prompt already covers wiki habits; delegated jobs are fire-and-
 * forget, so wrong placement surfaces as "where's my file?".
 */
const DELEGATION_PREAMBLE =
  "[Delegated task] If this task creates or edits wiki content, use the " +
  "wiki/vault tools (mcp__wiki__create_file, mcp__vault__edit, " +
  "mcp__ui__edit_artifact) — files written with the sandbox Write tool do " +
  "NOT land in the wiki. Before reporting success, confirm the file shows " +
  "up in mcp__wiki__list_files.\n\n";

/**
 * Chat service: bridges websocket clients and the Claude CLI session.
 *
 * Incoming "chat" commands are forwarded to the LLM (starting or resuming a
 * session as needed). Every event the LLM streams back is translated into a
 * namespaced "chat:*" event and broadcast to all connected clients.
 */
export class ChatService {
  private readonly clients = new Set<WebSocket>();
  private wasResumed = false;
  /**
   * In-flight ui tool calls, keyed by content-block index: raw accumulated
   * JSON of the tool input, and how much decoded spec was already forwarded.
   */
  private readonly uiBlocks = new Map<number, { raw: string; sent: number }>();
  /**
   * In-flight state exchanges (state:request / state:update), keyed by id:
   * the requester awaiting a state:response and its timeout. Entries are
   * created by forwardToFrontEnd and consumed by the state:response case.
   */
  private readonly pendingState = new Map<
    string,
    { requester: WebSocket; timer: NodeJS.Timeout }
  >();
  /**
   * True while the pre-warm turn is in flight: its conversation events are
   * swallowed (it is not part of the user's chat). Because the CLI processes
   * turns serially, everything from the warm send until the next "result"
   * event belongs to the warm turn — a user message sent meanwhile just
   * queues, and its events arrive after the flag clears.
   */
  private warmupActive = false;
  private warmupStartedAt = 0;
  /**
   * One entry per CLI turn sent but not yet answered, in send order. The
   * CLI processes turns strictly serially, so the head entry always owns
   * the next "result" event — that pairing is what lets a voice delegation
   * await *its* answer while typed turns interleave freely. Entries are
   * null for turns nobody awaits (typed chat, warm-up).
   */
  private readonly turnResolvers: Array<{
    resolve: (finalText: string) => void;
    reject: (err: Error) => void;
  } | null> = [];
  /** Callbacks fired when turnResolvers drains (see whenIdle). */
  private idleWaiters: Array<() => void> = [];
  /**
   * Serializes voice delegations: each waits for the previous one to finish
   * before choosing its model, so two delegations can't race the
   * model-switch decision.
   */
  private delegationChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly claude: ClaudeSession,
    private readonly logger: JsonlLogger,
    /** Wiki root; artifact:save writes .oui files here. */
    private readonly wikiDir: string,
    /** Pre-warm the CLI on first client connect (default on; WARMUP=0 off). */
    private readonly warmupEnabled: boolean = true
  ) {
    claude.on("event", (event: ClaudeStreamEvent) => {
      this.logger.log("claude", event);
      this.onClaudeEvent(event);
    });
    claude.on("started", ({ resumed }: { resumed: boolean }) => {
      this.wasResumed = resumed;
      this.logger.log("server", { type: "claude:started", resumed });
      this.broadcast({
        type: "chat:status",
        status: "starting",
        detail: resumed
          ? `resuming session ${claude.sessionId}`
          : "starting a new session",
      });
    });
    claude.on("exit", (code: number | null) => {
      // A CLI death ends any in-flight warm turn — clear the flag so real
      // conversation events are never swallowed by a stale warm-up.
      this.warmupActive = false;
      // A dead CLI can never answer queued turns: fail every awaited one
      // loudly (voice delegations turn this into a spoken error) and let
      // idle waiters proceed — the session is trivially idle now.
      for (const resolver of this.turnResolvers.splice(0)) {
        resolver?.reject(
          new Error(`claude exited (code ${code ?? "unknown"}) mid-turn`)
        );
      }
      this.notifyIfIdle();
      this.logger.log("server", { type: "claude:exit", code });
      this.broadcast({
        type: "chat:status",
        status: "exited",
        detail: `claude exited (code ${code ?? "unknown"})`,
      });
    });
    claude.on("error", (err: Error) => {
      this.logger.log("server", { type: "claude:error", message: err.message });
      this.broadcast({ type: "chat:error", message: err.message });
    });
    claude.on("stderr", (text: string) => {
      // stderr is noisy; surface it to server logs only.
      this.logger.log("server", { type: "claude:stderr", text });
      console.error("[claude]", text.trimEnd());
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    this.logger.log("server", { type: "ws:connect", clients: this.clients.size });
    ws.on("close", () => {
      this.clients.delete(ws);
      this.logger.log("server", {
        type: "ws:disconnect",
        clients: this.clients.size,
      });
    });
    ws.on("message", (raw) => this.onClientMessage(ws, raw.toString()));
    this.sendTo(ws, {
      type: "chat:status",
      status: "connected",
      sessionId: this.claude.sessionId ?? undefined,
      detail: this.claude.sessionId
        ? `back end ready, known session ${this.claude.sessionId}`
        : "back end ready",
    });
    this.maybeWarmUp();
  }

  /**
   * Pre-warm the CLI while the user is still typing their first message:
   * spawn it and run one minimal turn, so the real first ask skips CLI boot,
   * session init, and the cold prompt-cache write (~1–2s + a cache read
   * instead of a write). Runs at most once per CLI process — skipped when
   * the CLI is already up (including a warm turn already in flight, since
   * sending marks the session running). When resuming a persisted session,
   * the ping lands in that session's history; it is invisible in the UI.
   */
  private maybeWarmUp(): void {
    if (!this.warmupEnabled || this.claude.running) return;
    this.warmupActive = true;
    this.warmupStartedAt = Date.now();
    this.logger.log("server", { type: "warmup:start" });
    try {
      this.sendTurn(WARMUP_PROMPT);
      this.broadcast({
        type: "chat:status",
        status: "warming",
        detail: "pre-warming the session",
      });
    } catch (err) {
      // A failed warm-up must not degrade into swallowed real turns; the
      // first user message will start the CLI the ordinary (cold) way.
      this.warmupActive = false;
      this.logger.log("server", { type: "warmup:error", message: String(err) });
    }
  }

  private onClientMessage(ws: WebSocket, raw: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.logger.log("server", { type: "ws:bad-message", raw: raw.slice(0, 500) });
      this.sendTo(ws, { type: "chat:error", message: "invalid JSON message" });
      return;
    }

    // Frontend log batches are recorded entry by entry, not echoed back.
    if (message.type === "log") {
      for (const entry of message.entries ?? []) {
        this.logger.log("frontend", {
          type: entry.type,
          clientTs: entry.ts,
          data: entry.data,
        });
      }
      return;
    }

    this.logger.log("client", redactDataUrls(message));

    switch (message.type) {
      case "state:request": {
        this.forwardToFrontEnd(ws, message.id, {
          type: "state:request",
          id: message.id,
          screenshot: message.screenshot === true,
        });
        return;
      }
      case "state:update": {
        if (!message.updates || typeof message.updates !== "object") {
          this.sendTo(ws, {
            type: "state:response",
            id: message.id,
            error: "updates must be an object of key → value",
          });
          return;
        }
        this.forwardToFrontEnd(ws, message.id, {
          type: "state:update",
          id: message.id,
          updates: message.updates,
        });
        return;
      }
      case "state:response": {
        const pending = this.pendingState.get(message.id);
        if (!pending) return; // late or duplicate answer
        clearTimeout(pending.timer);
        this.pendingState.delete(message.id);
        this.sendTo(pending.requester, {
          type: "state:response",
          id: message.id,
          state: message.state,
          screenshot: message.screenshot,
          error: message.error,
        });
        return;
      }
      case "chat": {
        const text = message.text?.trim() ?? "";
        // The D6 envelope's field wins; `image` is the pre-envelope alias
        // old clients may still send.
        const screenshotUrl = message.screenshot ?? message.image;
        const image = parseImageDataUrl(screenshotUrl);
        if (screenshotUrl && !image) {
          this.sendTo(ws, {
            type: "chat:error",
            message: "screenshot must be a base64 image/* data URL",
          });
          return;
        }
        if (!text && !image) {
          this.sendTo(ws, { type: "chat:error", message: "empty chat text" });
          return;
        }
        // Echo the user's turn — with the envelope's adornments — to
        // everyone so all clients share one view.
        this.broadcast({
          type: "chat:message",
          id: message.id,
          role: "user",
          text,
          image: screenshotUrl,
          statementRef: message.statementRef,
          stateSnapshot: message.stateSnapshot,
        });
        try {
          this.sendTurn(withEnvelopeContext(text, message), image ?? undefined);
          this.broadcast({ type: "chat:status", status: "thinking" });
        } catch (err) {
          this.broadcast({ type: "chat:error", message: String(err) });
        }
        return;
      }
      case "artifact:save": {
        void this.saveArtifact(ws, message);
        return;
      }
      case "artifact:edit": {
        void this.editArtifact(ws, message);
        return;
      }
      case "voice:tool": {
        void this.runVoiceTool(ws, message);
        return;
      }
      case "voice:transcript": {
        // One finished voice utterance: fold it into the shared transcript
        // (every client) so voice and typed chat read as one conversation;
        // the JSONL log already recorded the raw command above (D5 row 8).
        // The envelope's stateSnapshot rides along so rows can render the
        // D6 state chip.
        const text = message.text?.trim();
        if (!text) return;
        this.broadcast({
          type: "chat:message",
          role: message.role === "assistant" ? "assistant" : "user",
          text,
          stateSnapshot: message.stateSnapshot,
          via: "voice",
        });
        return;
      }
      default:
        this.sendTo(ws, {
          type: "chat:error",
          message: `unknown message type: ${(message as { type?: string }).type}`,
        });
    }
  }

  /**
   * Write the authoring panel's artifact into the wiki as <name>.oui (J4).
   * The answer goes only to the requester; other clients learn about the new
   * file through the wiki watcher's wiki:changed broadcast.
   */
  private async saveArtifact(
    ws: WebSocket,
    message: ArtifactSaveCommand
  ): Promise<void> {
    const answer = (result: { url?: string; error?: string }) => {
      this.logger.log("server", {
        type: "artifact:saved",
        id: message.id,
        ...result,
      });
      this.sendTo(ws, { type: "artifact:saved", id: message.id, ...result });
    };

    const named = artifactFileName(message.name);
    if ("error" in named) {
      answer({ error: named.error });
      return;
    }
    const fileName = named.fileName;
    if (typeof message.spec !== "string" || !message.spec.trim()) {
      answer({ error: "nothing to save — the artifact is empty" });
      return;
    }
    const filePath = path.join(this.wikiDir, fileName);
    if (!message.overwrite && existsSync(filePath)) {
      answer({ error: `"${fileName}" already exists in the wiki` });
      return;
    }
    try {
      await writeFile(filePath, ensureTrailingNewline(message.spec), "utf8");
      answer({ url: `/docs/${fileName}` });
    } catch (err) {
      answer({ error: `could not write ${fileName}: ${String(err)}` });
    }
  }

  /**
   * Apply an edit patch to an existing wiki .oui file (the LLM's
   * edit_artifact tool): merge by statement name — same semantics as the
   * panel's edit mode — and write the merged program back. Answers only the
   * requester; viewers of the file pick up the change through the wiki
   * watcher's wiki:changed broadcast. The file must already exist (creating
   * artifacts stays with artifact:save), so a typo'd path errors instead of
   * silently spawning a new file.
   */
  private async editArtifact(
    ws: WebSocket,
    message: ArtifactEditCommand
  ): Promise<void> {
    const answer = (result: { url?: string; error?: string }) => {
      this.logger.log("server", {
        type: "artifact:edited",
        id: message.id,
        ...result,
      });
      this.sendTo(ws, { type: "artifact:edited", id: message.id, ...result });
    };

    const rel = wikiOuiPath(message.file);
    if (!rel) {
      answer({
        error:
          "invalid file — pass a wiki-relative .oui path (or its /docs/<path> URL) with no traversal",
      });
      return;
    }
    if (typeof message.spec !== "string" || !message.spec.trim()) {
      answer({ error: "empty spec — send the changed statements" });
      return;
    }
    const filePath = path.join(this.wikiDir, rel);
    if (!existsSync(filePath)) {
      answer({
        error: `"${rel}" does not exist in the wiki — check list_files; new artifacts are created by the user saving from the panel`,
      });
      return;
    }
    try {
      await editArtifactSpec(this.wikiDir, rel, message.spec);
      answer({ url: `/docs/${rel}` });
    } catch (err) {
      answer({ error: `could not edit ${rel}: ${String(err)}` });
    }
  }

  /**
   * Execute one server-side tool call from the browser's voice session.
   * The result answers only the requester (which forwards it to the voice
   * model), while a chat:tool marker pair is broadcast to every client so
   * the shared transcript shows what voice touched (D5 row 8). Errors are
   * teaching text for the model, never a dropped reply.
   */
  private async runVoiceTool(
    ws: WebSocket,
    message: VoiceToolCommand
  ): Promise<void> {
    this.broadcast({
      type: "chat:tool",
      phase: "use",
      name: `voice:${message.name}`,
      detail: summarizeToolInput(message.args),
    });
    let result: { result: string } | { error: string };
    try {
      result = {
        result: await executeVoiceTool(message.name, message.args, {
          wikiDir: this.wikiDir,
          delegate: (request, mode) => this.delegate(request, mode),
        }),
      };
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }
    this.logger.log("server", {
      type: "voice:tool-result",
      id: message.id,
      name: message.name,
      ...result,
    });
    this.broadcast({
      type: "chat:tool",
      phase: "result",
      isError: "error" in result,
    });
    this.sendTo(ws, { type: "voice:tool-result", id: message.id, ...result });
  }

  /**
   * ask_artifact_agent: run one delegated turn on the Claude session and
   * resolve with its final response text. Waits for every in-flight turn to
   * finish first — the fast/smart model switch respawns the CLI, which must
   * never kill a typed turn mid-generation — then sends with the mode's
   * model. The turn's streamed events broadcast normally, so every client
   * watches the work happen in the panel/chat like any other turn.
   */
  private delegate(request: string, mode: "fast" | "smart"): Promise<string> {
    const run = this.delegationChain.then(async () => {
      await this.whenIdle();
      return await new Promise<string>((resolve, reject) => {
        // On timeout the delegation "succeeds" with a still-working note:
        // the CLI turn keeps running and its output still lands in the
        // panel, so the voice model should reassure, not apologize.
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          resolve(
            "The work is taking longer than expected but is still running — its results will appear in the app when done."
          );
        }, DELEGATION_TIMEOUT_MS);
        const settle = (outcome: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          outcome();
        };
        this.sendTurn(DELEGATION_PREAMBLE + request, undefined, {
          model: delegationModel(mode),
          resolver: {
            resolve: (finalText) => settle(() => resolve(finalText)),
            reject: (err) => settle(() => reject(err)),
          },
        });
        this.broadcast({ type: "chat:status", status: "thinking" });
      });
    });
    // The chain must survive a failed delegation, or every later one would
    // inherit the rejection.
    this.delegationChain = run.catch(() => {});
    return run;
  }

  /**
   * Send one turn to the CLI, registering it for serial result pairing
   * (see turnResolvers). A model switch is only allowed when no turn is in
   * flight — with turns outstanding the CLI must not restart, so the turn
   * runs on whatever model is active (delegations guarantee idleness via
   * whenIdle; typed turns never ask for a model and simply follow along).
   */
  private sendTurn(
    text: string,
    image?: { mediaType: string; data: string },
    options?: {
      model?: string;
      resolver?: { resolve: (finalText: string) => void; reject: (err: Error) => void };
    }
  ): void {
    this.claude.send(text, image, {
      model: options?.model,
      allowRestart: this.turnResolvers.length === 0,
    });
    this.turnResolvers.push(options?.resolver ?? null);
  }

  /** Resolves once no CLI turn is in flight (immediately when idle now). */
  private whenIdle(): Promise<void> {
    if (this.turnResolvers.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private notifyIfIdle(): void {
    if (this.turnResolvers.length > 0) return;
    for (const waiter of this.idleWaiters.splice(0)) waiter();
  }

  /**
   * Forward a state exchange (state:request / state:update) to browser
   * clients (everyone but the requester — the requester is the MCP tool's
   * own short-lived connection). The reply routes back through pendingState:
   * the first state:response carrying the same id wins, later ones are
   * dropped. Times out after 10s so the MCP tool never hangs.
   */
  private forwardToFrontEnd(
    requester: WebSocket,
    id: string,
    event: ServerEvent
  ): void {
    const browsers = [...this.clients].filter(
      (c) => c !== requester && c.readyState === c.OPEN
    );
    if (browsers.length === 0) {
      this.sendTo(requester, {
        type: "state:response",
        id,
        error: "no front-end client is connected",
      });
      return;
    }
    const timer = setTimeout(() => {
      this.pendingState.delete(id);
      this.sendTo(requester, {
        type: "state:response",
        id,
        error: "front end did not respond within 10s",
      });
    }, 10_000);
    this.pendingState.set(id, { requester, timer });
    const payload = JSON.stringify(event);
    for (const browser of browsers) browser.send(payload);
  }

  /** Publish a server-originated event to every client (e.g. wiki:changed). */
  publish(event: ServerEvent): void {
    this.logger.log("server", event);
    this.broadcast(event);
  }

  /** Translate one raw Claude CLI stream event into chat:* events. */
  private onClaudeEvent(event: ClaudeStreamEvent): void {
    // Every "result" closes exactly one turn, in send order (the CLI is
    // strictly serial), so the head resolver — when a delegation is
    // awaiting this turn — gets the final text before any broadcasting.
    if (event.type === "result") {
      const resolver = this.turnResolvers.shift();
      resolver?.resolve(typeof event.result === "string" ? event.result : "");
      this.notifyIfIdle();
    }
    // Warm-turn traffic is lifecycle, not conversation. While the warm turn
    // runs, only "system" events pass through (so clients still get the
    // session-started status); its message/tool/ui events are swallowed, and
    // its closing "result" becomes the "ready" signal. Everything is still
    // in the JSONL log — suppression only affects client broadcasts.
    if (this.warmupActive) {
      if (event.type === "result") {
        this.warmupActive = false;
        this.logger.log("server", {
          type: "warmup:done",
          durationMs: Date.now() - this.warmupStartedAt,
          costUsd:
            typeof event.total_cost_usd === "number"
              ? event.total_cost_usd
              : undefined,
        });
        this.broadcast({
          type: "chat:status",
          status: "ready",
          detail: "session pre-warmed",
        });
        return;
      }
      if (event.type !== "system") return;
    }
    switch (event.type) {
      case "system": {
        if (event.subtype === "init") {
          this.broadcast({
            type: "chat:status",
            status: this.wasResumed ? "session-resumed" : "session",
            sessionId: event.session_id,
            model: typeof event.model === "string" ? event.model : undefined,
          });
        }
        return;
      }

      case "stream_event": {
        const streamed = event.event as
          | {
              type?: string;
              index?: number;
              content_block?: { type?: string; name?: string };
              delta?: { type?: string; text?: string; partial_json?: string };
            }
          | undefined;
        if (
          streamed?.type === "content_block_delta" &&
          streamed.delta?.type === "text_delta" &&
          streamed.delta.text
        ) {
          this.broadcast({ type: "chat:delta", text: streamed.delta.text });
          return;
        }

        // Announce every tool call the moment the model starts writing it —
        // the name is known at block start, seconds before the finished call
        // (with its input) arrives in the assistant message. The agent-timing
        // eval measured 3–10s client-visible silent gaps whose first
        // available cover signal was exactly this block start.
        if (
          streamed?.type === "content_block_start" &&
          streamed.content_block?.type === "tool_use" &&
          streamed.content_block.name
        ) {
          this.broadcast({
            type: "chat:tool",
            phase: "start",
            name: streamed.content_block.name,
          });
        }

        // Thinking heartbeat: the block's text is withheld at the API level,
        // but its start is a live "reasoning…" signal for clients to show
        // during otherwise-silent stretches (agent-timing eval §b).
        if (
          streamed?.type === "content_block_start" &&
          streamed.content_block?.type === "thinking"
        ) {
          this.broadcast({ type: "chat:status", status: "reasoning" });
          return;
        }

        // Follow ui tool calls token by token so the front end can render
        // the panel incrementally while the model writes the spec.
        if (
          streamed?.type === "content_block_start" &&
          streamed.content_block?.type === "tool_use" &&
          streamed.content_block.name === UI_TOOL_NAME &&
          streamed.index !== undefined
        ) {
          this.uiBlocks.set(streamed.index, { raw: "", sent: 0 });
          this.broadcast({ type: "ui:start" });
          return;
        }
        if (
          streamed?.type === "content_block_delta" &&
          streamed.delta?.type === "input_json_delta" &&
          streamed.index !== undefined
        ) {
          const block = this.uiBlocks.get(streamed.index);
          if (!block) return;
          block.raw += streamed.delta.partial_json ?? "";
          const spec = extractSpecSoFar(block.raw);
          if (spec.length > block.sent) {
            this.broadcast({ type: "ui:delta", text: spec.slice(block.sent) });
            block.sent = spec.length;
          }
          return;
        }
        // The tool call finished streaming; drop its tracking entry. No
        // event is sent here — the authoritative full spec follows in the
        // "assistant" message and is broadcast as ui:spec there.
        if (
          streamed?.type === "content_block_stop" &&
          streamed.index !== undefined
        ) {
          this.uiBlocks.delete(streamed.index);
        }
        return;
      }

      case "assistant": {
        const message = event.message as
          | { content?: Array<Record<string, unknown>> }
          | undefined;
        for (const block of message?.content ?? []) {
          if (block.type === "text" && typeof block.text === "string") {
            this.broadcast({
              type: "chat:message",
              role: "assistant",
              text: block.text,
            });
          } else if (block.type === "tool_use") {
            // The finished tool call carries the authoritative full spec —
            // it supersedes whatever was assembled from streamed deltas.
            const input = block.input as
              | { spec?: string; name?: string }
              | undefined;
            if (block.name === UI_TOOL_NAME && typeof input?.spec === "string") {
              this.broadcast({
                type: "ui:spec",
                spec: input.spec,
                name: typeof input.name === "string" ? input.name : undefined,
              });
            }
            this.broadcast({
              type: "chat:tool",
              phase: "use",
              name: typeof block.name === "string" ? block.name : "tool",
              detail: summarizeToolInput(block.input),
            });
          }
        }
        return;
      }

      case "user": {
        // Tool results come back as synthetic user turns.
        const message = event.message as
          | { content?: Array<Record<string, unknown>> }
          | undefined;
        for (const block of message?.content ?? []) {
          if (block.type === "tool_result") {
            this.broadcast({
              type: "chat:tool",
              phase: "result",
              isError: block.is_error === true,
            });
          }
        }
        return;
      }

      case "result": {
        this.broadcast({
          type: "chat:response",
          text: typeof event.result === "string" ? event.result : "",
          sessionId: event.session_id,
          durationMs:
            typeof event.duration_ms === "number" ? event.duration_ms : undefined,
          costUsd:
            typeof event.total_cost_usd === "number"
              ? event.total_cost_usd
              : undefined,
          numTurns:
            typeof event.num_turns === "number" ? event.num_turns : undefined,
          isError: event.is_error === true,
        });
        return;
      }
    }
  }

  private broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  private sendTo(ws: WebSocket, event: ServerEvent): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  }
}

/**
 * Normalize a user-entered artifact name into a safe wiki filename, or an
 * error saying which rule the name broke. A valid name is a single path
 * segment (no separators, no traversal, no leading dot) of ASCII letters,
 * digits, underscores, spaces, dots, and dashes, ending in .oui.
 *
 * The character set must stay in sync with wiki-service's `wikiDocPath` —
 * loosening it here would create files the edit/read tools refuse to address.
 */
export function artifactFileName(
  name: unknown
): { fileName: string } | { error: string } {
  const invalid = (why: string) => ({
    error: `invalid artifact name — ${why}`,
  });
  if (typeof name !== "string" || !name.trim()) {
    return invalid("the name is empty; type a name like 'my-dashboard'");
  }
  const base = name.trim().replace(/\.oui$/i, "").trim();
  if (!base) {
    return invalid("the name is empty; type a name like 'my-dashboard'");
  }
  if (/[/\\]/.test(base)) {
    return invalid(
      "slashes are not allowed (artifacts save as a single file in the wiki, not into folders)"
    );
  }
  if (base.startsWith(".")) {
    return invalid("the name can't start with a dot");
  }
  if (base.endsWith(".")) {
    return invalid("the name can't end with a dot");
  }
  if (!/^[\w]/.test(base)) {
    return invalid(`it can't start with "${base[0]}"; begin with a letter or digit`);
  }
  const unsupported = [...new Set(base.replace(/[\w .-]/g, ""))];
  if (unsupported.length > 0) {
    const listed = unsupported.map((c) => `"${c}"`).join(" ");
    return invalid(
      `${listed} ${unsupported.length === 1 ? "is" : "are"} not allowed; use letters, digits, spaces, dots, dashes, or underscores`
    );
  }
  return { fileName: `${base}.oui` };
}

/**
 * Normalize an edit target into a safe wiki-relative .oui path, or null if
 * it can't be one. Path safety (traversal, hidden files, /docs/ URL form)
 * is the wiki service's shared rule; this adds only the .oui requirement —
 * unlike artifactFileName the extension must already be there.
 */
export function wikiOuiPath(file: unknown): string | null {
  const rel = wikiDocPath(file);
  return rel !== null && rel.toLowerCase().endsWith(".oui") ? rel : null;
}

/**
 * Replace data-URL payloads (chat images, state screenshots) with their size
 * before logging — they are megabytes of base64 that would bloat the JSONL.
 * Every other message passes through unchanged.
 */
function redactDataUrls(message: ClientMessage): ClientMessage {
  const oversized =
    (message.type === "chat" && (message.image || message.screenshot)) ||
    (message.type === "state:response" && message.screenshot);
  if (!oversized) return message;
  return {
    ...message,
    ...("image" in message && message.image
      ? { image: `<data url, ${message.image.length} chars>` }
      : {}),
    ...("screenshot" in message && message.screenshot
      ? { screenshot: `<data url, ${message.screenshot.length} chars>` }
      : {}),
  };
}

/**
 * Prefix a user turn with the D6 envelope's locating context: what the
 * feedback points at (statementRef) and the D3 store at capture time
 * (stateSnapshot). The block is capture-time context, not user words, so it
 * is fenced and labeled; a bare typed turn with no context passes through
 * unchanged. This is the single formatting point for envelope context —
 * every channel that reaches the LLM goes through it.
 */
export function withEnvelopeContext(
  text: string,
  envelope: FeedbackEnvelope
): string {
  const lines: string[] = [];
  if (envelope.statementRef) {
    lines.push(`regarding statement: ${envelope.statementRef}`);
  }
  if (envelope.stateSnapshot && Object.keys(envelope.stateSnapshot).length > 0) {
    lines.push(
      `state store at capture: ${JSON.stringify(envelope.stateSnapshot)}`
    );
  }
  if (lines.length === 0) return text;
  const block = `<feedback-context>\n${lines.join("\n")}\n</feedback-context>`;
  return text ? `${block}\n\n${text}` : block;
}

/** Split a data URL into the media type + base64 payload the API expects. */
function parseImageDataUrl(
  url: string | undefined
): { mediaType: string; data: string } | null {
  if (!url) return null;
  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(url);
  return match ? { mediaType: match[1], data: match[2] } : null;
}

/** One-line JSON preview of a tool call's input for the chat transcript. */
function summarizeToolInput(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const text = JSON.stringify(input);
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

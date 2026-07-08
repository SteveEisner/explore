import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mergeStatements } from "@openuidev/lang-core";
import type { WebSocket } from "ws";
import type { ClaudeSession, ClaudeStreamEvent } from "./claude.js";
import type { JsonlLogger } from "./logger.js";
import { extractSpecSoFar } from "./partial-json.js";
import type {
  ArtifactEditCommand,
  ArtifactSaveCommand,
  ClientMessage,
  ServerEvent,
} from "./protocol.js";

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
      this.claude.send(WARMUP_PROMPT);
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

    this.logger.log(
      "client",
      redactDataUrls(message) as unknown as Record<string, unknown>
    );

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
        const image = parseImageDataUrl(message.image);
        if (message.image && !image) {
          this.sendTo(ws, {
            type: "chat:error",
            message: "image must be a base64 image/* data URL",
          });
          return;
        }
        if (!text && !image) {
          this.sendTo(ws, { type: "chat:error", message: "empty chat text" });
          return;
        }
        // Echo the user's turn to everyone so all clients share one view.
        this.broadcast({
          type: "chat:message",
          id: message.id,
          role: "user",
          text,
          image: message.image,
        });
        try {
          this.claude.send(text, image ?? undefined);
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

    const fileName = artifactFileName(message.name);
    if (!fileName) {
      answer({
        error:
          "invalid artifact name — use letters, digits, spaces, dots, dashes, or underscores",
      });
      return;
    }
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
      const existing = await readFile(filePath, "utf8");
      const merged = mergeStatements(existing, message.spec);
      await writeFile(filePath, ensureTrailingNewline(merged), "utf8");
      answer({ url: `/docs/${rel}` });
    } catch (err) {
      answer({ error: `could not edit ${rel}: ${String(err)}` });
    }
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
    this.logger.log("server", event as unknown as Record<string, unknown>);
    this.broadcast(event);
  }

  /** Translate one raw Claude CLI stream event into chat:* events. */
  private onClaudeEvent(event: ClaudeStreamEvent): void {
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
 * Normalize a user-entered artifact name into a safe wiki filename, or null
 * if it can't be one: a single path segment (no separators, no traversal, no
 * leading dot) of word characters, spaces, dots, and dashes, ending in .oui.
 */
export function artifactFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const base = name.trim().replace(/\.oui$/i, "").trim();
  if (!/^[\w][\w .-]*$/.test(base) || base.endsWith(".")) return null;
  return `${base}.oui`;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Normalize an edit target into a safe wiki-relative .oui path, or null if
 * it can't be one. Accepts the /docs/<path> URL form the model sees
 * elsewhere. Unlike artifactFileName (single segment, extension appended),
 * edits may target nested files but every segment must be a plain name —
 * no traversal, no absolute paths, no hidden files, and the .oui extension
 * must already be there.
 */
export function wikiOuiPath(file: unknown): string | null {
  if (typeof file !== "string") return null;
  const rel = file.trim().replace(/^\/docs\//, "");
  if (!rel.toLowerCase().endsWith(".oui")) return null;
  // Leading \w rules out "." / ".." / hidden segments; the trailing-dot
  // check rules out Windows-style "name." tricks ("x.oui" still passes —
  // it ends in "i").
  const plainSegment = /^[\w][\w .-]*$/;
  const segments = rel.split("/");
  if (!segments.every((s) => plainSegment.test(s) && !s.endsWith("."))) {
    return null;
  }
  return rel;
}

/**
 * Replace data-URL payloads (chat images, state screenshots) with their size
 * before logging — they are megabytes of base64 that would bloat the JSONL.
 * Every other message passes through unchanged.
 */
function redactDataUrls(message: ClientMessage): ClientMessage {
  const oversized =
    (message.type === "chat" && message.image) ||
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

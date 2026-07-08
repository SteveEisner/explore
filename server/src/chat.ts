import type { WebSocket } from "ws";
import type { ClaudeSession, ClaudeStreamEvent } from "./claude.js";
import type { JsonlLogger } from "./logger.js";
import { extractSpecSoFar } from "./partial-json.js";
import type { ClientMessage, ServerEvent } from "./protocol.js";

/** The `ui` MCP tool as the model sees it (mcp__<server>__<tool>). */
const UI_TOOL_NAME = "mcp__ui__ui";

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

  constructor(
    private readonly claude: ClaudeSession,
    private readonly logger: JsonlLogger
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

    this.logger.log("client", message as unknown as Record<string, unknown>);

    switch (message.type) {
      case "chat": {
        const text = message.text?.trim();
        if (!text) {
          this.sendTo(ws, { type: "chat:error", message: "empty chat text" });
          return;
        }
        // Echo the user's turn to everyone so all clients share one view.
        this.broadcast({
          type: "chat:message",
          id: message.id,
          role: "user",
          text,
        });
        try {
          this.claude.send(text);
          this.broadcast({ type: "chat:status", status: "thinking" });
        } catch (err) {
          this.broadcast({ type: "chat:error", message: String(err) });
        }
        return;
      }
      default:
        this.sendTo(ws, {
          type: "chat:error",
          message: `unknown message type: ${(message as { type?: string }).type}`,
        });
    }
  }

  /** Translate one raw Claude CLI stream event into chat:* events. */
  private onClaudeEvent(event: ClaudeStreamEvent): void {
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
            const input = block.input as { spec?: string } | undefined;
            if (block.name === UI_TOOL_NAME && typeof input?.spec === "string") {
              this.broadcast({ type: "ui:spec", spec: input.spec });
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

function summarizeToolInput(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const text = JSON.stringify(input);
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

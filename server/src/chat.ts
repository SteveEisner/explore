import type { WebSocket } from "ws";
import type { ClaudeSession, ClaudeStreamEvent } from "./claude.js";
import type { ClientMessage, ServerEvent } from "./protocol.js";

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

  constructor(private readonly claude: ClaudeSession) {
    claude.on("event", (event: ClaudeStreamEvent) =>
      this.onClaudeEvent(event)
    );
    claude.on("started", ({ resumed }: { resumed: boolean }) => {
      this.wasResumed = resumed;
      this.broadcast({
        type: "chat:status",
        status: "starting",
        detail: resumed
          ? `resuming session ${claude.sessionId}`
          : "starting a new session",
      });
    });
    claude.on("exit", (code: number | null) =>
      this.broadcast({
        type: "chat:status",
        status: "exited",
        detail: `claude exited (code ${code ?? "unknown"})`,
      })
    );
    claude.on("error", (err: Error) =>
      this.broadcast({ type: "chat:error", message: err.message })
    );
    claude.on("stderr", (text: string) => {
      // stderr is noisy; surface it to server logs only.
      console.error("[claude]", text.trimEnd());
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
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
      this.sendTo(ws, { type: "chat:error", message: "invalid JSON message" });
      return;
    }

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
          | { type?: string; delta?: { type?: string; text?: string } }
          | undefined;
        if (
          streamed?.type === "content_block_delta" &&
          streamed.delta?.type === "text_delta" &&
          streamed.delta.text
        ) {
          this.broadcast({ type: "chat:delta", text: streamed.delta.text });
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

/**
 * Wire protocol with the back end (mirror of server/src/protocol.ts).
 * The front end sends commands; the back end publishes "chat:*" events.
 */

export type ClientMessage = ChatCommand | LogCommand;

export interface ChatCommand {
  type: "chat";
  id?: string;
  text: string;
}

/** Browser-side observability entries, appended to the back end's JSONL log. */
export interface LogCommand {
  type: "log";
  entries: FrontendLogEntry[];
}

export interface FrontendLogEntry {
  ts: number;
  type: string;
  data?: unknown;
}

export type ServerEvent =
  | ChatStatusEvent
  | ChatMessageEvent
  | ChatDeltaEvent
  | ChatToolEvent
  | ChatResponseEvent
  | ChatErrorEvent
  | UiStartEvent
  | UiDeltaEvent
  | UiSpecEvent;

/** The model began a ui tool call. */
export interface UiStartEvent {
  type: "ui:start";
}

/** Decoded OpenUI Lang text extracted from the streaming tool-call tokens. */
export interface UiDeltaEvent {
  type: "ui:delta";
  text: string;
}

/** The complete, authoritative spec from the finished tool call. */
export interface UiSpecEvent {
  type: "ui:spec";
  spec: string;
}

export interface ChatStatusEvent {
  type: "chat:status";
  status:
    | "connected"
    | "starting"
    | "session"
    | "session-resumed"
    | "thinking"
    | "exited";
  sessionId?: string;
  model?: string;
  detail?: string;
}

export interface ChatMessageEvent {
  type: "chat:message";
  id?: string;
  role: "user" | "assistant";
  text: string;
}

export interface ChatDeltaEvent {
  type: "chat:delta";
  text: string;
}

export interface ChatToolEvent {
  type: "chat:tool";
  phase: "use" | "result";
  name?: string;
  detail?: string;
  isError?: boolean;
}

export interface ChatResponseEvent {
  type: "chat:response";
  text: string;
  sessionId?: string;
  durationMs?: number;
  costUsd?: number;
  numTurns?: number;
  isError: boolean;
}

export interface ChatErrorEvent {
  type: "chat:error";
  message: string;
}

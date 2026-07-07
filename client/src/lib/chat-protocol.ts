/**
 * Wire protocol with the back end (mirror of server/src/protocol.ts).
 * The front end sends commands; the back end publishes "chat:*" events.
 */

export type ClientMessage = {
  type: "chat";
  id?: string;
  text: string;
};

export type ServerEvent =
  | ChatStatusEvent
  | ChatMessageEvent
  | ChatDeltaEvent
  | ChatToolEvent
  | ChatResponseEvent
  | ChatErrorEvent;

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

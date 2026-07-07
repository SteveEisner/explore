/**
 * Wire protocol between the front end and the back end.
 *
 * The back end has no public API: everything is asynchronous over a single
 * websocket. The front end sends commands (e.g. "chat"), and the back end
 * publishes namespaced events ("chat:*") in response. Events are broadcast,
 * never request/response paired.
 */

/** Messages the front end sends to the back end. */
export type ClientMessage = {
  type: "chat";
  /** Client-generated id echoed back on related events. */
  id?: string;
  text: string;
};

/** Events the back end publishes to the front end. */
export type ServerEvent =
  | ChatStatusEvent
  | ChatMessageEvent
  | ChatDeltaEvent
  | ChatToolEvent
  | ChatResponseEvent
  | ChatErrorEvent;

/** Lifecycle/status updates: connecting, session started/resumed, thinking… */
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

/** A complete message in the conversation (user echo or assistant turn). */
export interface ChatMessageEvent {
  type: "chat:message";
  id?: string;
  role: "user" | "assistant";
  text: string;
}

/** Incremental streamed text from the assistant's in-progress turn. */
export interface ChatDeltaEvent {
  type: "chat:delta";
  text: string;
}

/** The assistant invoked a tool (or a tool finished). */
export interface ChatToolEvent {
  type: "chat:tool";
  phase: "use" | "result";
  name?: string;
  detail?: string;
  isError?: boolean;
}

/** Final result of a turn, with session metadata. */
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

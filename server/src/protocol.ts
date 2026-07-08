/**
 * Wire protocol between the front end and the back end.
 *
 * The back end has no public API: everything is asynchronous over a single
 * websocket. The front end sends commands (e.g. "chat"), and the back end
 * publishes namespaced events ("chat:*") in response. Events are broadcast,
 * never request/response paired.
 */

/** Messages the front end sends to the back end. */
export type ClientMessage =
  | ChatCommand
  | LogCommand
  | StateRequestCommand
  | StateResponseCommand;

/**
 * Front-end state inspection. The LLM's `state` MCP tool connects to the
 * websocket and sends state:request; the back end forwards it to browser
 * clients, and the first state:response with a matching id is routed back
 * to the requester.
 */
export interface StateRequestCommand {
  type: "state:request";
  id: string;
  /** Also capture a screenshot of the main window (PNG data URL). */
  screenshot?: boolean;
}

export interface StateResponseCommand {
  type: "state:response";
  id: string;
  /** Structured snapshot of what the user is looking at. */
  state?: unknown;
  /** PNG data URL of the main window, when requested. */
  screenshot?: string;
  error?: string;
}

export interface ChatCommand {
  type: "chat";
  /** Client-generated id echoed back on related events. */
  id?: string;
  text: string;
}

/** Browser-side observability entries, appended to the back end's JSONL log. */
export interface LogCommand {
  type: "log";
  entries: FrontendLogEntry[];
}

export interface FrontendLogEntry {
  /** Client clock, ms since epoch (the server adds its own timestamp too). */
  ts: number;
  type: string;
  data?: unknown;
}

/** Events the back end publishes to the front end. */
export type ServerEvent =
  | ChatStatusEvent
  | ChatMessageEvent
  | ChatDeltaEvent
  | ChatToolEvent
  | ChatResponseEvent
  | ChatErrorEvent
  | UiStartEvent
  | UiDeltaEvent
  | UiSpecEvent
  | StateRequestEvent
  | StateResponseEvent;

/** state:request forwarded to browser clients (shape mirrors the command). */
export interface StateRequestEvent {
  type: "state:request";
  id: string;
  screenshot?: boolean;
}

/** state:response routed back to the requesting client. */
export interface StateResponseEvent {
  type: "state:response";
  id: string;
  state?: unknown;
  screenshot?: string;
  error?: string;
}

/**
 * ui:* events — the LLM's `ui` tool call, streamed to the front end so the
 * main panel renders incrementally while the model writes the spec.
 */

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

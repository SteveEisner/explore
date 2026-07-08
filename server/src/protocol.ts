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
  | StateUpdateCommand
  | StateResponseCommand
  | ArtifactSaveCommand;

/**
 * Persist the authoring panel's artifact into the wiki as a .oui file (J4).
 * The back end answers the sender with an artifact:saved event carrying the
 * same id.
 */
export interface ArtifactSaveCommand {
  type: "artifact:save";
  id: string;
  /** Filename within the wiki; ".oui" is appended if missing. */
  name: string;
  /** The complete OpenUI Lang program to write. */
  spec: string;
  /**
   * Allow replacing an existing file. The client sets this when re-saving an
   * artifact it loaded from the wiki; a plain new-artifact save refuses to
   * clobber an existing name.
   */
  overwrite?: boolean;
}

/**
 * Front-end state mutation: the LLM's `set_state` MCP tool sends
 * state:update via the back end; browsers apply the updates to the D3
 * state store and answer with a state:response carrying the applied keys.
 */
export interface StateUpdateCommand {
  type: "state:update";
  id: string;
  /** State-store key → new value; null deletes the key. */
  updates: Record<string, unknown>;
}

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
  /** Optional image attachment (e.g. a screenshot) as a base64 data URL. */
  image?: string;
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
  | StateUpdateEvent
  | StateResponseEvent
  | WikiChangedEvent
  | ArtifactSavedEvent;

/** Outcome of an artifact:save command, sent only to the requester. */
export interface ArtifactSavedEvent {
  type: "artifact:saved";
  id: string;
  /** Web path of the written file (e.g. "/docs/my-report.oui") on success. */
  url?: string;
  error?: string;
}

/** state:request forwarded to browser clients (shape mirrors the command). */
export interface StateRequestEvent {
  type: "state:request";
  id: string;
  screenshot?: boolean;
}

/** state:update forwarded to browser clients (shape mirrors the command). */
export interface StateUpdateEvent {
  type: "state:update";
  id: string;
  updates: Record<string, unknown>;
}

/**
 * A wiki file changed on disk (e.g. the LLM edited it); the content pane
 * live-reloads if it is currently showing that file.
 */
export interface WikiChangedEvent {
  type: "wiki:changed";
  /** Web path of the changed file, e.g. "/docs/journeys.md". */
  url: string;
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
  /** Model-suggested save filename for the artifact (no extension). */
  name?: string;
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
  /** Data-URL image attached to a user turn (echoed to all clients). */
  image?: string;
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

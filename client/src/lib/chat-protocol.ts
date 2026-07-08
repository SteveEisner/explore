/**
 * Wire protocol with the back end (mirror of server/src/protocol.ts).
 * The front end sends commands; the back end publishes "chat:*" events.
 */

export type ClientMessage =
  | ChatCommand
  | LogCommand
  | StateRequestCommand
  | StateResponseCommand
  | ArtifactSaveCommand;

/**
 * Persist the authoring panel's artifact into the wiki as a .oui file (J4).
 * The back end answers with an artifact:saved event carrying the same id.
 */
export interface ArtifactSaveCommand {
  type: "artifact:save";
  id: string;
  /** Filename within the wiki; ".oui" is appended if missing. */
  name: string;
  /** The complete OpenUI Lang program to write. */
  spec: string;
  /** Allow replacing an existing file (re-saving a loaded artifact). */
  overwrite?: boolean;
}

/**
 * Front-end state inspection: the LLM's `state` MCP tool sends
 * state:request via the back end; the browser answers state:response.
 */
export interface StateRequestCommand {
  type: "state:request";
  id: string;
  screenshot?: boolean;
}

export interface StateResponseCommand {
  type: "state:response";
  id: string;
  state?: unknown;
  /** PNG data URL of the main window, when requested. */
  screenshot?: string;
  error?: string;
}

export interface ChatCommand {
  type: "chat";
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
  | UiSpecEvent
  | StateRequestEvent
  | StateUpdateEvent
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

/** state:request forwarded from the back end to this browser. */
export interface StateRequestEvent {
  type: "state:request";
  id: string;
  screenshot?: boolean;
}

/**
 * The LLM's set_state tool: apply these updates to the D3 state store and
 * answer with a state:response carrying the applied keys.
 */
export interface StateUpdateEvent {
  type: "state:update";
  id: string;
  /** State-store key → new value; null deletes the key. */
  updates: Record<string, unknown>;
}

/** A wiki file changed on disk; reload the content pane if it shows it. */
export interface WikiChangedEvent {
  type: "wiki:changed";
  /** Web path of the changed file, e.g. "/docs/journeys.md". */
  url: string;
}

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
  /** Data-URL image attached to a user turn (echoed to all clients). */
  image?: string;
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

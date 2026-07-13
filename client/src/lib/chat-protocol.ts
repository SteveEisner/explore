/**
 * Wire protocol with the back end (mirror of server/src/protocol.ts).
 * The front end sends commands; the back end publishes "chat:*" events.
 */

export type ClientMessage =
  | ChatCommand
  | LogCommand
  | StateRequestCommand
  | StateResponseCommand
  | ArtifactSaveCommand
  | VoiceToolCommand
  | VoiceTranscriptCommand;

/**
 * A server-side tool call bridged from the realtime voice session: the
 * voice model asked for tool `name` over its WebRTC data channel. The back
 * end answers with a voice:tool-result event carrying the same id.
 */
export interface VoiceToolCommand {
  type: "voice:tool";
  id: string;
  name: string;
  /** The model's arguments, JSON-parsed before bridging. */
  args: Record<string, unknown>;
}

/**
 * The D6 feedback envelope (decisions.md D6): the one shape every feedback
 * channel uses — typed chat, screenshot round-trip, point-and-comment,
 * voice transcripts. Channels fill in only the fields they have; producers
 * always attach `stateSnapshot` so the feedback is self-locating.
 */
export interface FeedbackEnvelope {
  /** What was typed or said. */
  text?: string;
  /** Captured image (screenshot round-trip, drawing overlay) as a base64 data URL. */
  screenshot?: string;
  /**
   * The D4 statement name the feedback points at (point-and-comment).
   * No producer emits it yet (P1); consumers must already handle it.
   */
  statementRef?: string;
  /** The D3 state store at capture time. */
  stateSnapshot?: Record<string, unknown>;
}

/**
 * One finished voice utterance (user transcription or the model's spoken
 * reply) — a D6 envelope filling `text` (+ `stateSnapshot`); the back end
 * folds it into every client's chat transcript.
 */
export interface VoiceTranscriptCommand extends FeedbackEnvelope {
  type: "voice:transcript";
  role: "user" | "assistant";
  text: string;
}

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

/**
 * A user feedback turn for the LLM: the D6 envelope plus routing fields.
 * At least one of text/screenshot must be filled.
 */
export interface ChatCommand extends FeedbackEnvelope {
  type: "chat";
  id?: string;
  /** Pre-envelope alias for `screenshot`; this client no longer sends it. */
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
  | ArtifactSavedEvent
  | VoiceToolResultEvent;

/**
 * Outcome of a voice:tool command, sent only to the requester. Exactly one
 * of result/error is set; error text is written for the voice model — it
 * explains how to correct the call.
 */
export interface VoiceToolResultEvent {
  type: "voice:tool-result";
  id: string;
  result?: string;
  error?: string;
}

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
  /** Web path of the changed file, e.g. "/docs/design/journeys.md". */
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

/**
 * Lifecycle/status updates. "warming"/"ready" bracket the back end's
 * pre-warm turn (see server protocol.ts) — statusText() renders both.
 */
export interface ChatStatusEvent {
  type: "chat:status";
  status:
    | "connected"
    | "starting"
    | "session"
    | "session-resumed"
    | "thinking"
    /** Thinking-block heartbeat — a live "reasoning…" signal, no content. */
    | "reasoning"
    | "warming"
    | "ready"
    | "exited";
  sessionId?: string;
  model?: string;
  detail?: string;
}

/**
 * A complete message in the conversation. User echoes carry the D6
 * envelope's adornments (thumbnail, "re: statement" chip, state chip).
 */
export interface ChatMessageEvent {
  type: "chat:message";
  id?: string;
  role: "user" | "assistant";
  text: string;
  /** The envelope's screenshot (data URL), echoed to all clients. */
  image?: string;
  /** The envelope's statementRef — what the feedback points at (D4 name). */
  statementRef?: string;
  /** The envelope's stateSnapshot — the D3 store at capture time. */
  stateSnapshot?: Record<string, unknown>;
  /** Set when the turn came through the realtime voice session. */
  via?: "voice";
}

export interface ChatDeltaEvent {
  type: "chat:delta";
  text: string;
}

/**
 * Tool-call lifecycle: "start" the moment the model begins writing the call
 * (name only, arguments still streaming), "use" when the finished call
 * arrives (adds the summarized input — upgrades the started row), "result"
 * when the tool reports back.
 */
export interface ChatToolEvent {
  type: "chat:tool";
  phase: "start" | "use" | "result";
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

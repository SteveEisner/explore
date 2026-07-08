import * as React from "react";
import { mergeStatements } from "@openuidev/react-lang";
import type { ServerEvent } from "@/lib/chat-protocol";
import { collectAppState } from "@/lib/app-state";
import {
  applyServerUpdates,
  getState,
  setState,
  stateSnapshot,
} from "@/lib/state-store";
import {
  attachLogSocket,
  frontendLog,
  installErrorLogging,
} from "@/lib/frontend-log";

/**
 * Everything in the event stream is expressed as a chat item so the sidebar
 * can render the whole conversation — bubbles for user/assistant turns,
 * simple marker text for status, tool activity, results, and errors.
 */
export type ChatItem =
  | { kind: "user"; id: string; text: string; image?: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "status"; id: string; text: string }
  /** `finished` distinguishes a completed tool call from one being invoked. */
  | { kind: "tool"; id: string; text: string; isError: boolean; finished: boolean }
  | { kind: "result"; id: string; text: string; isError: boolean }
  | { kind: "error"; id: string; text: string };

/**
 * The main-panel UI, assembled from streamed ui:* events. `program` is the
 * merged OpenUI Lang source: committed statements from finished ui calls,
 * plus (while streaming) the partial patch the model is currently writing.
 */
export interface UiState {
  program: string | null;
  streaming: boolean;
}

export interface ChatState {
  items: ChatItem[];
  connected: boolean;
  /** True from send until the back end publishes chat:response/chat:error. */
  busy: boolean;
  sessionId: string | null;
  ui: UiState;
  /** Send a user turn; `image` is an optional data-URL attachment. */
  send: (text: string, image?: string) => void;
  /** True from saveArtifact until the back end answers artifact:saved. */
  saving: boolean;
  /** Message from the last failed save; cleared by the next save. */
  saveError: string | null;
  /** Save the authoring panel's program to the wiki as <name>.oui (J4). */
  saveArtifact: (name: string) => void;
  /**
   * Seed the authoring panel with a saved .oui's program so the LLM's edit
   * patches merge onto it, and remember its origin so re-saving under the
   * same name overwrites the file (J4 reopen-and-continue-editing).
   */
  loadArtifact: (url: string, spec: string) => void;
}

let nextId = 0;
const newId = () => `item-${nextId++}`;

function reduceEvent(items: ChatItem[], event: ServerEvent): ChatItem[] {
  switch (event.type) {
    case "chat:status": {
      const text = statusText(event.status, event.sessionId, event.model);
      // "thinking" is shown via the busy indicator, not a persistent row.
      if (!text) return items;
      return [...items, { kind: "status", id: newId(), text }];
    }

    case "chat:message": {
      if (event.role === "user") {
        return [
          ...items,
          { kind: "user", id: newId(), text: event.text, image: event.image },
        ];
      }
      // A complete assistant message finalizes the in-progress streamed
      // bubble when one exists (the full text supersedes the deltas).
      const last = items[items.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        return [
          ...items.slice(0, -1),
          { ...last, text: event.text, streaming: false },
        ];
      }
      return [
        ...items,
        { kind: "assistant", id: newId(), text: event.text, streaming: false },
      ];
    }

    case "chat:delta": {
      const last = items[items.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        return [
          ...items.slice(0, -1),
          { ...last, text: last.text + event.text },
        ];
      }
      return [
        ...items,
        { kind: "assistant", id: newId(), text: event.text, streaming: true },
      ];
    }

    case "chat:tool": {
      const finished = event.phase === "result";
      const text = finished
        ? event.isError
          ? "tool failed"
          : "tool finished"
        : `${event.name ?? "tool"}${event.detail ? ` ${event.detail}` : ""}`;
      return [
        ...items,
        {
          kind: "tool",
          id: newId(),
          text,
          isError: event.isError ?? false,
          finished,
        },
      ];
    }

    case "chat:response": {
      const parts: string[] = [event.isError ? "Turn failed" : "Turn complete"];
      if (event.durationMs != null)
        parts.push(`${(event.durationMs / 1000).toFixed(1)}s`);
      if (event.costUsd != null) parts.push(`$${event.costUsd.toFixed(4)}`);
      return [
        ...items,
        {
          kind: "result",
          id: newId(),
          text: parts.join(" · "),
          isError: event.isError,
        },
      ];
    }

    case "chat:error":
      return [...items, { kind: "error", id: newId(), text: event.message }];

    // ui:* events drive the main panel; state:request/state:update are
    // answered out of band; wiki:changed reloads the content pane;
    // artifact:saved feeds the toolbar's save state — none of them show in
    // the chat transcript.
    case "ui:start":
    case "ui:delta":
    case "ui:spec":
    case "state:request":
    case "state:update":
    case "wiki:changed":
    case "artifact:saved":
      return items;
  }
}

/**
 * Answer the LLM's set_state tool: apply the updates to the state store —
 * the same path a user interaction takes — and acknowledge with the applied
 * keys plus the resulting store, so the model sees the effect.
 */
function answerStateUpdate(
  socket: WebSocket,
  id: string,
  updates: Record<string, unknown>
): void {
  let response: Record<string, unknown>;
  try {
    const applied = applyServerUpdates(updates);
    response = { state: { applied, store: stateSnapshot() } };
  } catch (err) {
    response = { error: String(err) };
  }
  frontendLog("state:updated", { id, keys: Object.keys(updates ?? {}) });
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "state:response", id, ...response }));
  }
}

/** Monotonic counter so equal-URL wiki changes still trigger a reload. */
let wikiChangeSeq = 0;

/** Answer the LLM's state tool: snapshot the app and ship it back. */
async function answerStateRequest(
  socket: WebSocket,
  id: string,
  screenshot: boolean
): Promise<void> {
  let response: Record<string, unknown>;
  try {
    const result = await collectAppState({ screenshot });
    response = { state: result.state, screenshot: result.screenshot };
  } catch (err) {
    response = { error: String(err) };
  }
  frontendLog("state:answered", { id, error: response.error });
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "state:response", id, ...response }));
  }
}

/**
 * Merge an edit-mode patch into the committed program. While the patch is
 * still streaming it can be syntactically incomplete, so fall back to plain
 * concatenation (the streaming parser discards invalid trailing lines).
 */
function safeMerge(base: string, patch: string): string {
  if (!base) return patch;
  try {
    return mergeStatements(base, patch);
  } catch {
    return `${base}\n${patch}`;
  }
}

/**
 * Split a still-streaming patch into its finished statements and the
 * incomplete tail. A statement is finished once a newline appears at bracket
 * depth 0 outside a string; everything after the last such boundary is tail
 * (even if it happens to parse) because more tokens may still arrive.
 * Bracket/quote rules mirror the language's statement splitter
 * (no escape handling inside strings).
 */
export function splitStreamingPatch(patch: string): {
  complete: string;
  tail: string;
} {
  let depth = 0;
  let inStr: string | false = false;
  let boundary = 0; // index just past the last depth-0 newline
  for (let i = 0; i < patch.length; i++) {
    const c = patch[i];
    if (inStr) {
      if (c === inStr) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === "\n" && depth === 0) boundary = i + 1;
  }
  return {
    complete: patch.slice(0, boundary).trim(),
    tail: patch.slice(boundary).trim(),
  };
}

/**
 * Merge a *partial* edit patch for live rendering. Merging the raw partial
 * text corrupts the program: the truncated last statement replaces a valid
 * one mid-program and its unbalanced bracket/quote swallows every statement
 * after it, blanking the panel until the finished spec arrives. Instead,
 * merge only the finished statements — each section updates the moment its
 * statement completes — and append the unfinished tail at the end, where the
 * streaming parser is built to tolerate it: a redefinition of an existing
 * statement is ignored there (first definition wins, so the old content
 * stays visible until the edit is complete), while a brand-new statement
 * renders progressively as it streams.
 */
export function mergeStreamingPatch(base: string, patch: string): string {
  if (!base) return patch;
  const { complete, tail } = splitStreamingPatch(patch);
  const merged = complete ? safeMerge(base, complete) : base;
  return tail ? `${merged}\n${tail}` : merged;
}

function statusText(
  status: string,
  sessionId?: string,
  model?: string
): string | null {
  switch (status) {
    case "connected":
      return "Connected to back end";
    case "starting":
      return "Starting Claude Code…";
    case "session":
      return `Session started${model ? ` (${model})` : ""}`;
    case "session-resumed":
      return `Session resumed${sessionId ? ` (${sessionId.slice(0, 8)}…)` : ""}`;
    case "warming":
      return "Warming up the session…";
    case "ready":
      return "Session ready";
    case "exited":
      return "Claude Code exited";
    default:
      return null;
  }
}

/**
 * Owns the websocket connection to the back end. Reconnects automatically,
 * folds every published chat:* event into the item list.
 */
export function useChat(): ChatState {
  const [items, setItems] = React.useState<ChatItem[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [uiParts, setUiParts] = React.useState({
    base: "", // merged program from completed ui calls
    patch: "", // spec text of the in-flight ui call, growing token by token
    streaming: false,
  });
  const [saveState, setSaveState] = React.useState<{
    saving: boolean;
    error: string | null;
  }>({ saving: false, error: null });
  const socketRef = React.useRef<WebSocket | null>(null);
  /** Wiki URL the authoring program was loaded from or last saved to. */
  const loadedFromRef = React.useRef<string | null>(null);
  /** Latest merged program, so saveArtifact stays a stable callback. */
  const programRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let retryDelay = 500;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    installErrorLogging();

    function connect() {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        retryDelay = 500;
        setConnected(true);
        attachLogSocket(socket);
        frontendLog("ws:open");
      };
      socket.onmessage = (raw) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(raw.data as string) as ServerEvent;
        } catch {
          return;
        }
        if ("sessionId" in event && event.sessionId) {
          setSessionId(event.sessionId);
        }
        if (event.type === "chat:response" || event.type === "chat:error") {
          setBusy(false);
        }
        if (event.type === "state:request") {
          void answerStateRequest(socket, event.id, event.screenshot === true);
        }
        if (event.type === "state:update") {
          answerStateUpdate(socket, event.id, event.updates ?? {});
        }
        if (event.type === "wiki:changed") {
          // Publish into the store; FileViewer reloads if it shows the file.
          setState(
            "app/wiki-changed",
            { url: event.url, seq: ++wikiChangeSeq },
            "server"
          );
        }
        if (event.type === "artifact:saved") {
          if (event.error || !event.url) {
            setSaveState({
              saving: false,
              error: event.error ?? "save failed",
            });
          } else {
            setSaveState({ saving: false, error: null });
            // The artifact now lives in the wiki: remember where (so the
            // next save overwrites it) and switch the panel to the file.
            loadedFromRef.current = event.url;
            setState("app/view", { kind: "doc", url: event.url }, "server");
          }
        }
        if (event.type === "ui:start") {
          setUiParts((p) => ({ ...p, patch: "", streaming: true }));
        } else if (event.type === "ui:delta") {
          setUiParts((p) => ({ ...p, patch: p.patch + event.text }));
        } else if (event.type === "ui:spec") {
          // The model's suggested filename is only a default: never clobber
          // a name the user already typed (or a loaded artifact's name).
          if (event.name && !getState("app/artifact-name")) {
            setState("app/artifact-name", event.name, "server");
          }
          // Authoritative full spec — commit it into the merged program.
          setUiParts((p) => ({
            base: safeMerge(p.base, event.spec),
            patch: "",
            streaming: false,
          }));
        }
        setItems((prev) => reduceEvent(prev, event));
      };
      socket.onclose = () => {
        setConnected(false);
        attachLogSocket(null);
        frontendLog("ws:close", { willRetry: !disposed });
        if (disposed) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10_000);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, []);

  const send = React.useCallback((text: string, image?: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    frontendLog("chat:send", { length: text.length, hasImage: image != null });
    socket.send(JSON.stringify({ type: "chat", id: newId(), text, image }));
    setBusy(true);
  }, []);

  const saveArtifact = React.useCallback((name: string) => {
    const socket = socketRef.current;
    // While a ui call streams, programRef holds a partial merge — callers
    // must not save then. The toolbar enforces it by disabling Save
    // (canSave requires !ui.streaming), so spec here is a finished program.
    const spec = programRef.current;
    const trimmed = name.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !spec || !trimmed) {
      return;
    }
    // Re-saving under the name the program was loaded from (or last saved
    // as) replaces that file; any other existing name is refused server-side.
    const fileName = trimmed.endsWith(".oui") ? trimmed : `${trimmed}.oui`;
    const overwrite = loadedFromRef.current?.split("/").pop() === fileName;
    frontendLog("artifact:save", { name: trimmed, overwrite });
    socket.send(
      JSON.stringify({
        type: "artifact:save",
        id: newId(),
        name: trimmed,
        spec,
        overwrite,
      })
    );
    setSaveState({ saving: true, error: null });
  }, []);

  const loadArtifact = React.useCallback((url: string, spec: string) => {
    loadedFromRef.current = url;
    setUiParts({ base: spec, patch: "", streaming: false });
    const fileName = url.split("/").pop() ?? "";
    setState("app/artifact-name", fileName.replace(/\.oui$/i, ""));
    setSaveState({ saving: false, error: null });
    frontendLog("artifact:load", { url, length: spec.length });
  }, []);

  const ui = React.useMemo<UiState>(() => {
    const { base, patch, streaming } = uiParts;
    const program = streaming && patch ? mergeStreamingPatch(base, patch) : base;
    return { program: program || null, streaming };
  }, [uiParts]);
  programRef.current = ui.program;

  return {
    items,
    connected,
    busy,
    sessionId,
    ui,
    send,
    saving: saveState.saving,
    saveError: saveState.error,
    saveArtifact,
    loadArtifact,
  };
}

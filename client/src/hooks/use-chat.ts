import * as React from "react";
import { mergeStatements } from "@openuidev/react-lang";
import type { ServerEvent } from "@/lib/chat-protocol";

/**
 * Everything in the event stream is expressed as a chat item so the sidebar
 * can render the whole conversation — bubbles for user/assistant turns,
 * simple marker text for status, tool activity, results, and errors.
 */
export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "status"; id: string; text: string }
  | { kind: "tool"; id: string; text: string; isError: boolean }
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
  send: (text: string) => void;
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
        return [...items, { kind: "user", id: newId(), text: event.text }];
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
      const text =
        event.phase === "use"
          ? `${event.name ?? "tool"}${event.detail ? ` ${event.detail}` : ""}`
          : event.isError
            ? "tool failed"
            : "tool finished";
      return [
        ...items,
        { kind: "tool", id: newId(), text, isError: event.isError ?? false },
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

    // ui:* events drive the main panel, not the chat transcript.
    case "ui:start":
    case "ui:delta":
    case "ui:spec":
      return items;
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
  const socketRef = React.useRef<WebSocket | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let retryDelay = 500;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${scheme}://${location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        retryDelay = 500;
        setConnected(true);
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
        if (event.type === "ui:start") {
          setUiParts((p) => ({ ...p, patch: "", streaming: true }));
        } else if (event.type === "ui:delta") {
          setUiParts((p) => ({ ...p, patch: p.patch + event.text }));
        } else if (event.type === "ui:spec") {
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

  const send = React.useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat", id: newId(), text }));
    setBusy(true);
  }, []);

  const ui = React.useMemo<UiState>(() => {
    const { base, patch, streaming } = uiParts;
    const program = streaming && patch ? safeMerge(base, patch) : base;
    return { program: program || null, streaming };
  }, [uiParts]);

  return { items, connected, busy, sessionId, ui, send };
}

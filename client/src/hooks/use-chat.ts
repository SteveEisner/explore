import * as React from "react";
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

export interface ChatState {
  items: ChatItem[];
  connected: boolean;
  /** True from send until the back end publishes chat:response/chat:error. */
  busy: boolean;
  sessionId: string | null;
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

  return { items, connected, busy, sessionId, send };
}

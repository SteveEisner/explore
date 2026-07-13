import * as React from "react";
import { Markdown } from "@/components/markdown";
import {
  AlertCircleIcon,
  AtSignIcon,
  CameraIcon,
  CheckIcon,
  FlagIcon,
  InfoIcon,
  MapPinIcon,
  SendIcon,
  WrenchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { ChatItem, ChatState } from "@/hooks/use-chat";
import type { VoiceState } from "@/hooks/use-voice";

/**
 * The conversation pane behind the toolbar chat bar's expander: the
 * transcript plus the typed composer (text input, screenshot, send).
 * Collapsed chat is voice-only — the toolbar bar carries just the mic
 * (see chat-bar.tsx); anything needing text happens here. Every event
 * published by the back end is expressed as a chat row: user/assistant
 * turns as bubbles, status/tool/result/error events as simple marker text.
 */
export function ChatSidebar({
  chat,
  voice,
  onScreenshot,
  screenshotEnabled,
}: {
  chat: ChatState;
  /** Shown-problems source: the pane renders voice warnings/errors in full
   * (the bar only tints its mic button) with the device picker to fix a
   * silent mic in place. */
  voice?: VoiceState;
  /** Capture the main view and send it into the chat as an image turn. */
  onScreenshot?: () => void;
  screenshotEnabled?: boolean;
}) {
  const { items, connected, busy, send } = chat;
  const [draft, setDraft] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send(text);
    setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="h-auto flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 p-4">
              {items.map((item) => (
                <MessageScrollerItem key={item.id} messageId={item.id}>
                  <ChatRow item={item} />
                </MessageScrollerItem>
              ))}
              {busy && (
                <MessageScrollerItem messageId="busy">
                  <Marker>
                    <MarkerContent className="shimmer">Thinking…</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {/* Delegation progress strip: an ask_artifact_agent call can run for
          minutes with nothing but the amber tool dot, so while one is in
          flight show what the delegated Claude turn is doing right now. The
          turn's events already stream to every client as ordinary chat:*
          broadcasts (they land in `items` above), so the newest item doubles
          as the live progress line — no extra protocol needed. */}
      {voice?.active && voice.runningTools.includes("ask_artifact_agent") && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="shimmer">
            Claude is working — {delegationProgress(items) ?? "starting up…"}
          </span>
        </div>
      )}

      {/* Voice problem strip: shown only when something needs the user —
          a mid-session warning (silent mic) or the reason the session
          failed. Text wraps — these are instructions, not decoration. The
          device picker rides along while live so a silent mic can be fixed
          in place (each switch re-verifies within seconds). */}
      {voice && (voice.warning || voice.status === "error") && (
        <div className="flex flex-col gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground">
          {voice.status === "error" ? (
            <span className="text-destructive">
              Voice failed: {voice.error ?? "unknown error"}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-500">
              {voice.warning}
            </span>
          )}
          {voice.active && (
            <select
              value={voice.inputDevice}
              onChange={(e) => voice.setInputDevice(e.target.value)}
              aria-label="Microphone device"
              className="min-w-0 truncate rounded border bg-transparent px-1 py-0.5 text-xs"
            >
              <option value="">Default microphone</option>
              {voice.inputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        {onScreenshot && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onScreenshot}
            disabled={!screenshotEnabled}
            aria-label="Send a screenshot of the main view"
          >
            <CameraIcon />
          </Button>
        )}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Message Claude…" : "Reconnecting…"}
          disabled={!connected}
        />
        <Button type="submit" size="icon" disabled={!connected || !draft.trim()}>
          <SendIcon />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

/**
 * One-line "what is Claude doing right now" for the delegation strip, read
 * off the newest chat item: the delegated turn's streamed events (tool
 * calls, response deltas, statuses) arrive as ordinary chat:* broadcasts
 * and land at the end of `items`. Null means nothing has streamed since the
 * delegation's own "voice:…" bridge marker — the caller shows a generic
 * starting line.
 */
function delegationProgress(items: ChatItem[]): string | null {
  const last = items[items.length - 1];
  if (!last) return null;
  switch (last.kind) {
    case "tool":
      // The bridge's own marker ("voice:ask_artifact_agent …") means the
      // delegated turn hasn't produced an event of its own yet.
      return last.text.startsWith("voice:") ? null : last.text;
    case "assistant":
      // A finished assistant row is a voice transcript folded in mid-flight
      // ("I'm on it") — not Claude progress.
      return last.streaming ? "writing a response…" : null;
    case "status":
    case "result":
      return last.text;
    default:
      return null;
  }
}

/**
 * One-phrase summary of a D6 stateSnapshot for the chat's state chip: where
 * the user was (derived from "app/view") when there is a view, otherwise
 * just the store size. Null when the snapshot is empty — no chip then.
 */
function summarizeSnapshot(
  snapshot: Record<string, unknown>
): string | null {
  const keyCount = Object.keys(snapshot).length;
  if (keyCount === 0) return null;
  const view = snapshot["app/view"] as
    | { kind?: string; url?: string | null }
    | undefined;
  if (view?.kind === "doc") return view.url?.split("/").pop() ?? "untitled";
  if (view?.kind === "authoring" || view?.kind === "home") return view.kind;
  return `${keyCount} state ${keyCount === 1 ? "key" : "keys"}`;
}

/**
 * The D6 envelope adornments under a bubble: a "re: <statement>" chip when
 * the feedback targets a component, and a compact state chip when a store
 * snapshot rode along (full snapshot inspectable via the tooltip). Renders
 * nothing when the message carried neither.
 */
function EnvelopeChips({
  statementRef,
  stateSnapshot,
  align,
}: {
  statementRef?: string;
  stateSnapshot?: Record<string, unknown>;
  align?: "start" | "end";
}) {
  const summary = stateSnapshot ? summarizeSnapshot(stateSnapshot) : null;
  if (!statementRef && !summary) return null;
  return (
    <div
      className={
        "mt-1 flex flex-wrap gap-1 " +
        (align === "end" ? "justify-end" : "justify-start")
      }
    >
      {statementRef && (
        <Badge variant="outline" className="text-muted-foreground">
          <AtSignIcon data-icon="inline-start" />
          re: {statementRef}
        </Badge>
      )}
      {summary && (
        <Badge
          variant="outline"
          className="text-muted-foreground"
          title={`State at capture: ${JSON.stringify(stateSnapshot)}`}
        >
          <MapPinIcon data-icon="inline-start" />
          {summary}
        </Badge>
      )}
    </div>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return (
        <Message align="end">
          <MessageContent>
            <Bubble align="end">
              <BubbleContent>
                {item.image && (
                  <img
                    src={item.image}
                    alt="Screenshot sent to the chat"
                    className="mb-2 max-h-64 w-full rounded-md border object-contain"
                  />
                )}
                <Markdown text={item.text} invert />
              </BubbleContent>
            </Bubble>
            <EnvelopeChips
              statementRef={item.statementRef}
              stateSnapshot={item.stateSnapshot}
              align="end"
            />
          </MessageContent>
        </Message>
      );

    case "assistant":
      return (
        <Message>
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent>
                <Markdown text={item.text} />
                {item.streaming && <span className="shimmer"> ▍</span>}
              </BubbleContent>
            </Bubble>
            <EnvelopeChips stateSnapshot={item.stateSnapshot} />
          </MessageContent>
        </Message>
      );

    case "status":
      return (
        <Marker>
          <MarkerIcon>
            <InfoIcon />
          </MarkerIcon>
          <MarkerContent>{item.text}</MarkerContent>
        </Marker>
      );

    case "tool":
      return (
        <Marker>
          <MarkerIcon>
            {item.isError ? (
              <AlertCircleIcon className="text-destructive" />
            ) : item.finished ? (
              <CheckIcon />
            ) : (
              <WrenchIcon />
            )}
          </MarkerIcon>
          <MarkerContent className="truncate font-mono text-xs">
            {item.text}
          </MarkerContent>
        </Marker>
      );

    case "result":
      return (
        <Marker variant="separator">
          <MarkerIcon>
            <FlagIcon className={item.isError ? "text-destructive" : ""} />
          </MarkerIcon>
          <MarkerContent>{item.text}</MarkerContent>
        </Marker>
      );

    case "error":
      return (
        <Marker>
          <MarkerIcon>
            <AlertCircleIcon className="text-destructive" />
          </MarkerIcon>
          <MarkerContent className="text-destructive">{item.text}</MarkerContent>
        </Marker>
      );
  }
}

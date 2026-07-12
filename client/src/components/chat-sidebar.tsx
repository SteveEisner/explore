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
  MicIcon,
  MicOffIcon,
  PanelRightCloseIcon,
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
import type { VoiceState, VoiceStatus } from "@/hooks/use-voice";

/**
 * Right-sidebar chat. Every event published by the back end is expressed as
 * a chat row: user/assistant turns as bubbles, status/tool/result/error
 * events as simple marker text.
 */
export function ChatSidebar({
  chat,
  voice,
  onClose,
  onScreenshot,
  screenshotEnabled,
}: {
  chat: ChatState;
  /** The realtime voice session behind the mic toggle. */
  voice?: VoiceState;
  onClose?: () => void;
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
      <header className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-semibold">Chat</span>
        {onClose && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close chat panel"
          >
            <PanelRightCloseIcon />
          </Button>
        )}
      </header>

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

      {/* Voice session status strip: the visible listening/speaking/tool
          states while the mic is live, plus mid-session warnings (silent
          mic) and the reason when the session failed. Warnings and errors
          wrap — they are instructions, not decoration. While live it is
          also the mic debugging surface: a real-time input level bar
          (if it doesn't move while you talk, the model can't hear you)
          and a device picker that switches the capture mid-call. */}
      {voice && voice.status !== "idle" && (
        <div className="flex flex-col gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span
              className={
                "mt-1 size-2 shrink-0 rounded-full " + voiceDotClass(voice.status)
              }
            />
            {voice.status === "error" ? (
              <span className="text-destructive">
                Voice failed: {voice.error ?? "unknown error"}
              </span>
            ) : voice.warning ? (
              <span className="text-amber-600 dark:text-amber-500">
                {voice.warning}
              </span>
            ) : (
              <span className="truncate">{voiceStatusLabel(voice.status)}</span>
            )}
          </div>
          {voice.active && (
            <div className="flex items-center gap-2">
              <span
                aria-label="Microphone input level"
                title={`Mic level — device: ${voice.micLabel ?? "unknown"}`}
                className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-green-500 transition-[width] duration-150"
                  style={{ width: `${Math.round(Math.min(1, voice.inputLevel) * 100)}%` }}
                />
              </span>
              <select
                value={voice.inputDevice}
                onChange={(e) => voice.setInputDevice(e.target.value)}
                aria-label="Microphone device"
                className="min-w-0 flex-1 truncate rounded border bg-transparent px-1 py-0.5 text-xs"
              >
                <option value="">Default microphone</option>
                {voice.inputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        {voice && (
          <Button
            type="button"
            size="icon"
            variant={voice.active ? "destructive" : "ghost"}
            onClick={voice.toggle}
            aria-label={
              voice.active ? "End the voice conversation" : "Start a voice conversation"
            }
            title={`Voice: ${voice.status}`}
            className={voice.active ? "animate-pulse" : undefined}
          >
            {/* A live mic shows a pulsing mic (recording), not a mic-off
                glyph — mic-off reads as "muted/disabled", the opposite of
                what an open session is. */}
            {voice.status === "error" ? <MicOffIcon /> : <MicIcon />}
          </Button>
        )}
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

function voiceStatusLabel(status: VoiceStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting voice…";
    case "listening":
      return "Listening…";
    case "speaking":
      return "Speaking…";
    case "tool":
      return "Working on it…";
    default:
      return status;
  }
}

/** Status dot: pulsing while something is happening, red on failure. */
function voiceDotClass(status: VoiceStatus): string {
  switch (status) {
    case "connecting":
      return "animate-pulse bg-muted-foreground";
    case "listening":
      return "animate-pulse bg-green-500";
    case "speaking":
      return "animate-pulse bg-blue-500";
    case "tool":
      return "animate-pulse bg-amber-500";
    case "error":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
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

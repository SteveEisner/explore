import * as React from "react";
import { Markdown } from "@/components/markdown";
import {
  AlertCircleIcon,
  CameraIcon,
  CheckIcon,
  FlagIcon,
  InfoIcon,
  PanelRightCloseIcon,
  SendIcon,
  WrenchIcon,
} from "lucide-react";
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

/**
 * Right-sidebar chat. Every event published by the back end is expressed as
 * a chat row: user/assistant turns as bubbles, status/tool/result/error
 * events as simple marker text.
 */
export function ChatSidebar({
  chat,
  onClose,
  onScreenshot,
  screenshotEnabled,
}: {
  chat: ChatState;
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
            ) : item.text === "tool finished" ? (
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

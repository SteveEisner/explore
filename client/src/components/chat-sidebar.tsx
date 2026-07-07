import * as React from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  FlagIcon,
  InfoIcon,
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

/**
 * Right-sidebar chat. Every event published by the back end is expressed as
 * a chat row: user/assistant turns as bubbles, status/tool/result/error
 * events as simple marker text.
 */
export function ChatSidebar({ chat }: { chat: ChatState }) {
  const { items, connected, busy, sessionId, send } = chat;
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
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Chat</span>
          {sessionId && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {sessionId}
            </span>
          )}
        </div>
        <Badge variant={connected ? "secondary" : "destructive"}>
          {connected ? "connected" : "offline"}
        </Badge>
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
              <BubbleContent>{item.text}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );

    case "assistant":
      return (
        <Message>
          <MessageContent>
            <Bubble variant="muted">
              <BubbleContent className="whitespace-pre-wrap">
                {item.text}
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

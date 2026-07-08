import * as React from "react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { FileViewer } from "@/components/file-viewer";
import { MainToolbar } from "@/components/main-toolbar";
import { useChat } from "@/hooks/use-chat";
import { GenerativeView } from "@/lib/openui";

/**
 * What the main viewing area shows: a file from the wiki (url null = the
 * empty in-memory OUI document the app starts on), or authoring mode where
 * the LLM's streamed ui tool output renders live.
 */
export type MainView = { kind: "doc"; url: string | null } | { kind: "authoring" };

export default function App() {
  const chat = useChat();
  const [view, setView] = React.useState<MainView>({ kind: "doc", url: null });

  return (
    <div className="flex h-screen bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <MainToolbar view={view} onView={setView} />
        {/* Document content is selectable; the surrounding chrome is not. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none select-text">
          {view.kind === "authoring" ? (
            <GenerativeView
              response={chat.ui.program}
              isStreaming={chat.ui.streaming}
            />
          ) : (
            <FileViewer
              url={view.url}
              onNavigate={(url) => setView({ kind: "doc", url })}
            />
          )}
        </div>
      </main>

      {/* Right sidebar: the chat, expressing the whole back-end event stream. */}
      <aside className="flex w-96 shrink-0 flex-col border-l bg-sidebar">
        <ChatSidebar chat={chat} />
      </aside>
    </div>
  );
}

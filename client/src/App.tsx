import * as React from "react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { FileViewer } from "@/components/file-viewer";
import { HOME_URL, MainToolbar } from "@/components/main-toolbar";
import { useChat } from "@/hooks/use-chat";
import { GenerativeView } from "@/lib/openui";

/**
 * What the main viewing area shows: a file from the wiki (url null = an
 * empty in-memory OUI document), or authoring mode where the LLM's streamed
 * ui tool output renders live. The app opens on the wiki README.
 */
export type MainView = { kind: "doc"; url: string | null } | { kind: "authoring" };

export default function App() {
  const chat = useChat();
  const [view, setView] = React.useState<MainView>({
    kind: "doc",
    url: HOME_URL,
  });
  const [chatOpen, setChatOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <MainToolbar
          view={view}
          onView={setView}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((open) => !open)}
          chatBusy={chat.busy}
        />
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

      {/* Right chat sidebar: a popup panel that takes layout space when
          open (the main panel shrinks) and none when closed. The inner
          wrapper keeps a fixed width so content doesn't reflow mid-slide. */}
      <aside
        className={
          "shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 " +
          (chatOpen ? "w-96 border-l" : "w-0")
        }
      >
        <div className="flex h-full w-96 flex-col">
          <ChatSidebar chat={chat} onClose={() => setChatOpen(false)} />
        </div>
      </aside>
    </div>
  );
}

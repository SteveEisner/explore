import { ChatSidebar } from "@/components/chat-sidebar";
import { TopBar } from "@/components/top-bar";
import { useChat } from "@/hooks/use-chat";
import { GenerativeView } from "@/lib/openui";

const TEST_MESSAGE =
  "Use the ui tool to build a small demo in the main panel: a Stack with a " +
  "Content heading, then a Tabs component with two or three tabs of HTML " +
  "content. Afterwards, confirm briefly in chat.";

export default function App() {
  const chat = useChat();

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Main panel: floating top bar over the LLM-constructed UI. */}
      <main className="relative min-w-0 flex-1">
        <TopBar onTest={() => chat.send(TEST_MESSAGE)} disabled={!chat.connected} />
        <div className="h-full w-full overflow-y-auto">
          <GenerativeView
            response={chat.ui.program}
            isStreaming={chat.ui.streaming}
          />
        </div>
      </main>

      {/* Right sidebar: the chat, expressing the whole back-end event stream. */}
      <aside className="flex w-96 shrink-0 flex-col border-l bg-sidebar">
        <ChatSidebar chat={chat} />
      </aside>
    </div>
  );
}

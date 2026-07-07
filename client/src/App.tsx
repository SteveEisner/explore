import { ChatSidebar } from "@/components/chat-sidebar";
import { TopBar } from "@/components/top-bar";
import { useChat } from "@/hooks/use-chat";

const TEST_MESSAGE =
  "Hello! This is a test message from the web UI. Please reply with a short greeting.";

export default function App() {
  const chat = useChat();

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Main panel: floating top bar, content area intentionally blank. */}
      <main className="relative min-w-0 flex-1">
        <TopBar onTest={() => chat.send(TEST_MESSAGE)} disabled={!chat.connected} />
      </main>

      {/* Right sidebar: the chat, expressing the whole back-end event stream. */}
      <aside className="flex w-96 shrink-0 flex-col border-l bg-sidebar">
        <ChatSidebar chat={chat} />
      </aside>
    </div>
  );
}

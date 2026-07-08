import * as React from "react";
import { SparklesIcon, SquarePenIcon } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { DrawingOverlay } from "@/components/drawing-overlay";
import { FileViewer } from "@/components/file-viewer";
import { HOME_URL, MainToolbar } from "@/components/main-toolbar";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/use-chat";
import { registerAppStateProvider } from "@/lib/app-state";
import { captureMainView } from "@/lib/capture";
import type { StrokePoints } from "@/lib/freehand";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";
import { buildAppSnapshot, type SnapshotInputs } from "@/lib/snapshot";
import { useStoreValue } from "@/lib/state-store";

/**
 * What the main viewing area shows: a file from the wiki (url null = an
 * empty in-memory OUI document), or authoring mode where the LLM's streamed
 * ui tool output renders live. The app opens on the wiki README.
 */
export type MainView = { kind: "doc"; url: string | null } | { kind: "authoring" };

/** Markdown wiki pages get the floating "New Artifact" entry point. */
function isMarkdownUrl(url: string | null): boolean {
  return url !== null && (url.endsWith(".md") || url.endsWith(".markdown"));
}

/** Saved .oui views get the floating "Edit Artifact" entry point (J4). */
function isOuiUrl(url: string | null): boolean {
  return url !== null && url.endsWith(".oui");
}

/**
 * The view lives in the state store, so it can be written by the LLM's
 * set_state tool as well as our own components — tolerate the shapes an LLM
 * plausibly writes: a bare "/docs/..." string means "open that file".
 */
function normalizeView(raw: unknown): MainView {
  if (typeof raw === "string") return { kind: "doc", url: raw };
  if (raw && typeof raw === "object") {
    const v = raw as { kind?: unknown; url?: unknown };
    if (v.kind === "authoring") return { kind: "authoring" };
    if (v.kind === "doc" && (typeof v.url === "string" || v.url === null)) {
      return { kind: "doc", url: v.url };
    }
  }
  return { kind: "doc", url: HOME_URL };
}

export default function App() {
  const chat = useChat();
  const [rawView, setView] = useStoreValue<unknown>("app/view", {
    kind: "doc",
    url: HOME_URL,
  });
  const view = normalizeView(rawView);
  const [drawMode, setDrawMode] = useStoreValue("app/draw-mode", false);
  const [strokes, setStrokes] = React.useState<StrokePoints[]>([]);
  const [capturing, setCapturing] = React.useState(false);
  const [chatOpen, setChatOpen] = useStoreValue("app/chat-open", false);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const docRef = React.useRef<HTMLDivElement>(null);

  // Leaving line mode erases the annotations — toggling off is the eraser.
  const toggleDraw = () => {
    if (drawMode) setStrokes([]);
    setDrawMode(!drawMode);
  };

  // ---- App-state snapshots for the LLM's `state` tool ----
  // Latest inputs live in a ref so the provider (registered once) always
  // reads current values; the pointer is tracked document-wide.
  const pointerRef = React.useRef<{ x: number; y: number; at: number } | null>(
    null
  );
  const snapshotInputsRef = React.useRef<SnapshotInputs>(null!);
  snapshotInputsRef.current = {
    view,
    chatOpen,
    chatBusy: chat.busy,
    drawMode,
    strokeCount: strokes.length,
    authoringProgram: chat.ui.program,
    pointer: pointerRef.current,
    scroller: scrollerRef.current,
    doc: docRef.current,
  };

  React.useEffect(() => {
    const track = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, at: Date.now() };
    };
    document.addEventListener("mousemove", track, { passive: true });
    const unregister = registerAppStateProvider(async ({ screenshot }) => {
      const inputs = {
        ...snapshotInputsRef.current,
        pointer: pointerRef.current,
      };
      const state = buildAppSnapshot(inputs);
      let image: string | undefined;
      if (screenshot && inputs.scroller && inputs.doc) {
        image = await captureMainView(inputs.scroller, inputs.doc);
      }
      return { state, screenshot: image };
    });
    return () => {
      document.removeEventListener("mousemove", track);
      unregister();
    };
  }, []);

  // Screenshot the content area (annotations are part of the document DOM,
  // so they're captured with it) and send it to the chat as an image turn.
  const screenshot = async () => {
    if (!scrollerRef.current || !docRef.current || capturing) return;
    setCapturing(true);
    try {
      const image = await captureMainView(scrollerRef.current, docRef.current);
      chat.send(
        strokes.length
          ? "Here's a screenshot of the current view, with my annotations drawn on it."
          : "Here's a screenshot of the current view.",
        image
      );
    } catch (err) {
      frontendLog("screenshot:error", { message: String(err) });
    } finally {
      setCapturing(false);
    }
  };

  return (
    // overflow-hidden: app-like shell — nothing (e.g. the fixed-width chat
    // wrapper inside the collapsed w-0 aside) may extend the page and give
    // the window a horizontal scrollbar / focus auto-pan.
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <MainToolbar
          view={view}
          onView={setView}
          drawMode={drawMode}
          onToggleDraw={toggleDraw}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen(!chatOpen)}
          chatBusy={chat.busy}
        />
        <div className="relative min-h-0 flex-1">
          {/* Floating entry into authoring mode, shown over markdown views
              (the toolbar deliberately has no authoring button — its pencil
              read too much like the drawing pen). */}
          {view.kind === "doc" && isMarkdownUrl(view.url) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setView({ kind: "authoring" })}
              className="absolute top-3 right-4 z-10 shadow-md"
            >
              <SparklesIcon data-icon="inline-start" />
              New Artifact
            </Button>
          )}
          {/* Document content is selectable; the surrounding chrome is not. */}
          <div
            ref={scrollerRef}
            className="h-full overflow-y-auto overscroll-none select-text"
          >
            {/* The overlay lives inside the document wrapper so annotations
                are anchored in document coordinates: they scroll and zoom
                with the content, and screenshots capture them for free. */}
            <div ref={docRef} className="relative min-h-full">
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
              <DrawingOverlay
                active={drawMode}
                strokes={strokes}
                onStrokesChange={setStrokes}
              />
            </div>
          </div>
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
          <ChatSidebar
            chat={chat}
            onClose={() => setChatOpen(false)}
            onScreenshot={screenshot}
            screenshotEnabled={chat.connected && !capturing}
          />
        </div>
      </aside>
    </div>
  );
}

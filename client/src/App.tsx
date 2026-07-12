import * as React from "react";
import { SparklesIcon, SquarePenIcon } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { DrawingOverlay } from "@/components/drawing-overlay";
import { FileViewer } from "@/components/file-viewer";
import { HomeView } from "@/components/home-view";
import { MainToolbar } from "@/components/main-toolbar";
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
 * What the main viewing area shows: the Home folder view of the wiki, a
 * file from the wiki (url null = an empty in-memory OUI document), or
 * authoring mode where the LLM's streamed ui tool output renders live. The
 * app opens on Home.
 */
export type MainView =
  | { kind: "home" }
  | { kind: "doc"; url: string | null }
  | { kind: "authoring" };

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
    if (v.kind === "home") return { kind: "home" };
    if (v.kind === "authoring") return { kind: "authoring" };
    if (v.kind === "doc" && (typeof v.url === "string" || v.url === null)) {
      return { kind: "doc", url: v.url };
    }
  }
  return { kind: "home" };
}

export default function App() {
  const chat = useChat();
  const [rawView, setView] = useStoreValue<unknown>("app/view", {
    kind: "home",
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

  // Reopen a saved .oui for editing: load its program into the authoring
  // panel (LLM edit patches then merge onto it; re-saving the same name
  // overwrites the file) and switch to authoring mode.
  const editArtifact = async () => {
    if (view.kind !== "doc" || !isOuiUrl(view.url)) return;
    const url = view.url!;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      chat.loadArtifact(url, await res.text());
      setView({ kind: "authoring" });
    } catch (err) {
      frontendLog("artifact:edit-error", { url, message: String(err) });
    }
  };

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
    // overflow-clip: app-like shell — nothing (e.g. the fixed-width chat
    // wrapper inside the collapsed w-0 aside) may extend the page and give
    // the window a horizontal scrollbar / focus auto-pan. `clip` (not
    // `hidden`) so focus/scrollIntoView can't programmatically pan it either;
    // html/body are pinned the same way in index.css.
    <div className="flex h-screen overflow-clip bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <MainToolbar
          view={view}
          onView={setView}
          drawMode={drawMode}
          onToggleDraw={toggleDraw}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen(!chatOpen)}
          chatBusy={chat.busy}
          onSaveArtifact={chat.saveArtifact}
          canSave={
            chat.connected && chat.ui.program !== null && !chat.ui.streaming
          }
          saving={chat.saving}
          saveError={chat.saveError}
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
          {/* Floating reopen-for-editing entry, shown over saved .oui views. */}
          {view.kind === "doc" && isOuiUrl(view.url) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void editArtifact()}
              className="absolute top-3 right-4 z-10 shadow-md"
            >
              <SquarePenIcon data-icon="inline-start" />
              Edit Artifact
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
              ) : view.kind === "home" ? (
                <HomeView
                  onNavigate={(url) => setView({ kind: "doc", url })}
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
          wrapper keeps a fixed width so content doesn't reflow mid-slide.
          overflow-clip (not hidden): focusing elements in the clipped chat
          must not scroll this box sideways. */}
      <aside
        className={
          "shrink-0 overflow-clip bg-sidebar transition-[width] duration-200 " +
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

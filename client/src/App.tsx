import * as React from "react";
import { SparklesIcon, SquarePenIcon } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { DrawingOverlay } from "@/components/drawing-overlay";
import { FileViewer } from "@/components/file-viewer";
import { HomeView } from "@/components/home-view";
import { MainToolbar } from "@/components/main-toolbar";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/use-chat";
import { useVoice } from "@/hooks/use-voice";
import { registerAppStateProvider } from "@/lib/app-state";
import { captureMainView } from "@/lib/capture";
import type { StrokePoints } from "@/lib/freehand";
import { frontendLog } from "@/lib/frontend-log";
import {
  indicate,
  indicateInPanel,
  registerIndicateProvider,
  type IndicateTarget,
} from "@/lib/indicate";
import { GenerativeView } from "@/lib/openui";
import { buildAppSnapshot, type SnapshotInputs } from "@/lib/snapshot";
import { useServerEventSounds, useVoiceSounds } from "@/lib/sound-cues";
import { getState, subscribeState, useStoreValue } from "@/lib/state-store";
import { normalizeView, useViewHistory } from "@/lib/view-history";

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

export default function App() {
  const chat = useChat();
  const voice = useVoice(chat);
  const [rawView, setView] = useStoreValue<unknown>("app/view", {
    kind: "home",
  });
  const view = normalizeView(rawView);
  // Mirror "app/view" into browser history (hash URLs) so Back/Forward
  // navigate between views instead of unloading the SPA.
  useViewHistory();
  // Audio cues for what the user can't see happen: server-pushed edits to
  // the viewed document, and the voice mic going live / closing.
  useServerEventSounds(view);
  useVoiceSounds(voice?.status);
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

  // Voice follows the chat panel: opening the sidebar starts a live voice
  // session, closing it always releases the mic — a hot mic whose controls
  // are hidden is never acceptable. Edge-triggered on chat-open transitions
  // (not status changes), so manually stopping the mic mid-session doesn't
  // fight an auto-restart, and a failed start doesn't retry-loop.
  const prevChatOpen = React.useRef(chatOpen);
  React.useEffect(() => {
    if (chatOpen === prevChatOpen.current) return;
    prevChatOpen.current = chatOpen;
    if (chatOpen && voice.status === "idle") voice.toggle();
    if (!chatOpen && voice.active) voice.toggle();
  }, [chatOpen, voice]);

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
    // Agents point at on-screen content (scroll into view + blink): the
    // voice hook's `indicate` tool calls the provider directly; the Claude
    // session drives the same provider by writing the `app/indicate` store
    // key through set_state. The raw subscription (not useStoreValue) fires
    // on every write, so pointing at the same target twice blinks twice.
    const unregisterIndicate = registerIndicateProvider((target) => {
      const { scroller, doc } = snapshotInputsRef.current;
      if (!scroller || !doc) {
        return { ok: false, matched: 0, detail: "main panel not mounted" };
      }
      const result = indicateInPanel(scroller, doc, target);
      frontendLog("indicate", { target, ...result });
      return result;
    });
    const unsubscribeIndicate = subscribeState("app/indicate", () => {
      const target = getState("app/indicate") as IndicateTarget | null;
      if (target && typeof target === "object") indicate(target);
    });
    return () => {
      document.removeEventListener("mousemove", track);
      unregister();
      unregisterIndicate();
      unsubscribeIndicate();
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
  // so they're captured with it) and send it to the chat as a D6 feedback
  // envelope: text + screenshot (+ the store snapshot chat.send attaches).
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
    <div className="relative flex h-screen overflow-clip bg-background text-foreground">
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

      {/* Right chat sidebar: floats above the content pane (the main panel
          keeps its width) and slides in from the right edge. Stays mounted
          off-screen when closed so chat state survives; `inert` keeps its
          controls out of the tab order then. overflow-clip on the shell
          clips the off-screen panel, and (not `hidden`) focusing elements
          in the clipped chat must not scroll anything sideways. z-20 rides
          over the content pane's floating buttons (z-10). */}
      <aside
        inert={!chatOpen}
        className={
          "absolute inset-y-0 right-0 z-20 w-96 border-l bg-sidebar shadow-lg " +
          "transition-transform duration-200 " +
          (chatOpen ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex h-full flex-col">
          <ChatSidebar
            chat={chat}
            voice={voice}
            onScreenshot={screenshot}
            screenshotEnabled={chat.connected && !capturing}
          />
        </div>
      </aside>
    </div>
  );
}

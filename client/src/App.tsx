import * as React from "react";
import { ChatBar } from "@/components/chat-bar";
import { ChatSidebar } from "@/components/chat-sidebar";
import { DrawingOverlay } from "@/components/drawing-overlay";
import { ExpandedArtifact } from "@/components/expanded-artifact";
import { FileViewer } from "@/components/file-viewer";
import {
  expandedRefKey,
  normalizeExpandedRef,
  type ExpandedArtifactRef,
} from "@/lib/expanded-ref";
import { HomeView } from "@/components/home-view";
import { MainToolbar } from "@/components/main-toolbar";
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
  // Chat's resting state is the toolbar composer alone; the conversation
  // pane (bubbles, tool markers) drops down only when explicitly expanded.
  const [chatExpanded, setChatExpanded] = useStoreValue(
    "app/chat-expanded",
    false
  );
  // A launched artifact covering the content panel (null = none): a .oui
  // URL or an inline-block {doc, line} reference. In the store so embeds'
  // Expand buttons, both agents, and state snapshots all share it;
  // navigation to a different view auto-minimizes below.
  const [rawExpanded, setExpandedArtifact] = useStoreValue<unknown>(
    "app/expanded-artifact",
    null
  );
  const expandedArtifact = normalizeExpandedRef(rawExpanded);
  const viewSignature = view.kind === "doc" ? `doc:${view.url}` : view.kind;
  const lastViewSignature = React.useRef(viewSignature);
  React.useEffect(() => {
    if (viewSignature === lastViewSignature.current) return;
    lastViewSignature.current = viewSignature;
    setExpandedArtifact(null);
  }, [viewSignature, setExpandedArtifact]);
  // What the overlay actually renders: follows the store key up instantly,
  // but holds the last target through the exit animation until onClosed.
  const [renderedArtifact, setRenderedArtifact] =
    React.useState<ExpandedArtifactRef | null>(null);
  const expandedKey = expandedRefKey(expandedArtifact);
  React.useEffect(() => {
    if (expandedArtifact) setRenderedArtifact(expandedArtifact);
    // expandedKey stands in for the object identity (LLM writes recreate it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey]);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const docRef = React.useRef<HTMLDivElement>(null);
  // The expanded-artifact overlay's own scroller/content, filled while one
  // is mounted (expanded-artifact.tsx).
  const expandedScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const expandedContentRef = React.useRef<HTMLDivElement | null>(null);

  // The surface the user actually sees: the expanded artifact when one is
  // up, else the document wrapper. Screenshots and state snapshots observe
  // this — capturing the hidden page under a maximized artifact was a bug.
  // Read at call time (refs fill after mount); everything touched is a
  // stable ref or the store, so the once-registered provider can close over
  // it safely.
  const activeSurface = () => {
    if (
      normalizeExpandedRef(getState("app/expanded-artifact")) &&
      expandedScrollerRef.current &&
      expandedContentRef.current
    ) {
      return {
        scroller: expandedScrollerRef.current,
        doc: expandedContentRef.current,
      };
    }
    return { scroller: scrollerRef.current, doc: docRef.current };
  };

  // Stable navigation callback: FileViewer derives its link handler from
  // this, and Markdown's memo (which keeps paragraph DOM nodes — and the
  // user's text selection — alive across App's frequent re-renders, e.g.
  // the live mic level) only holds if the handler identity doesn't churn.
  const navigateTo = React.useCallback(
    (url: string) => setView({ kind: "doc", url }),
    [setView]
  );

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
    expandedArtifact,
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
      const surface = activeSurface();
      const inputs = {
        ...snapshotInputsRef.current,
        pointer: pointerRef.current,
        scroller: surface.scroller,
        doc: surface.doc,
      };
      const state = buildAppSnapshot(inputs);
      let image: string | undefined;
      if (screenshot && surface.scroller && surface.doc) {
        image = await captureMainView(surface.scroller, surface.doc);
      }
      return { state, screenshot: image };
    });
    // Agents point at on-screen content (scroll into view + blink): the
    // voice hook's `indicate` tool calls the provider directly; the Claude
    // session drives the same provider by writing the `app/indicate` store
    // key through set_state. The raw subscription (not useStoreValue) fires
    // on every write, so pointing at the same target twice blinks twice.
    const unregisterIndicate = registerIndicateProvider((target) => {
      // Point at the surface the user sees: an expanded artifact's
      // statements when one is up, the document otherwise.
      const { scroller, doc } = activeSurface();
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

  // Screenshot the content area (annotations are part of the document DOM,
  // so they're captured with it) and send it to the chat as a D6 feedback
  // envelope: text + screenshot (+ the store snapshot chat.send attaches).
  const screenshot = async () => {
    const surface = activeSurface();
    if (!surface.scroller || !surface.doc || capturing) return;
    setCapturing(true);
    try {
      const image = await captureMainView(surface.scroller, surface.doc);
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
          chatBar={
            <ChatBar
              chat={chat}
              voice={voice}
              expanded={chatExpanded}
              onToggleExpanded={() => setChatExpanded(!chatExpanded)}
            />
          }
          onSaveArtifact={chat.saveArtifact}
          canSave={
            chat.connected && chat.ui.program !== null && !chat.ui.streaming
          }
          saving={chat.saving}
          saveError={chat.saveError}
        />
        <div className="relative min-h-0 flex-1">
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
                chat.ui.program?.trim() ? (
                  <GenerativeView
                    response={chat.ui.program}
                    isStreaming={chat.ui.streaming}
                  />
                ) : (
                  // Empty artifact: a calm placeholder instead of a bare
                  // white pane (the user steers via chat/voice — no manual
                  // editing to point at).
                  <p className="flex min-h-[60vh] items-center justify-center p-6 text-sm text-muted-foreground">
                    Blank artifact — nothing here yet.
                  </p>
                )
              ) : view.kind === "home" ? (
                <HomeView onNavigate={navigateTo} />
              ) : (
                <FileViewer url={view.url} onNavigate={navigateTo} />
              )}
              <DrawingOverlay
                active={drawMode}
                strokes={strokes}
                onStrokesChange={setStrokes}
              />
            </div>
          </div>
          {/* A launched artifact covers the content panel; the document view
              above stays mounted (scroll and state intact) underneath. It
              stays rendered through the exit animation (renderedArtifact
              lags the store key until the fade-out reports closed). */}
          {renderedArtifact && (
            <ExpandedArtifact
              target={renderedArtifact}
              open={expandedArtifact !== null}
              drawMode={drawMode}
              scrollerRef={expandedScrollerRef}
              contentRef={expandedContentRef}
              onClosed={() => setRenderedArtifact(null)}
              onNavigate={(url) => {
                setExpandedArtifact(null);
                setView({ kind: "doc", url });
              }}
            />
          )}
        </div>
      </main>

      {/* Right chat sidebar: floats above the content pane (the main panel
          keeps its width) and drops down from under the toolbar (top-12 =
          toolbar height) when the chat bar's expander is on — composing
          happens in the toolbar bar; this pane is only the transcript.
          Stays mounted off-screen when hidden so chat state survives;
          `inert` keeps its controls out of the tab order then. overflow-clip
          on the shell clips the off-screen panel, and (not `hidden`)
          focusing elements in the clipped chat must not scroll anything
          sideways. z-20 rides over the content pane's floating buttons
          (z-10). */}
      <aside
        inert={!(chatOpen && chatExpanded)}
        className={
          "absolute top-12 bottom-0 right-0 z-20 w-96 border-l bg-sidebar shadow-lg " +
          "transition-transform duration-200 " +
          (chatOpen && chatExpanded ? "translate-x-0" : "translate-x-full")
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

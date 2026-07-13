import * as React from "react";
import { FileWarningIcon, LoaderIcon } from "lucide-react";
import { DrawingOverlay } from "@/components/drawing-overlay";
import { FileViewer } from "@/components/file-viewer";
import type { ExpandedArtifactRef } from "@/lib/expanded-ref";
import type { StrokePoints } from "@/lib/freehand";
import { frontendLog } from "@/lib/frontend-log";
import { GenerativeView } from "@/lib/openui";
import { blockAt, extractOuiBlocks } from "@/lib/oui-blocks";
import { useStoreValue } from "@/lib/state-store";
import { cn } from "@/lib/utils";

/**
 * A launched artifact, taking over the content panel: full-screen view of a
 * wiki .oui file — or an inline ```oui block of a wiki page ({doc, line}
 * reference, decisions.md D8) — above the (still-mounted) document view.
 * Driven by the `app/expanded-artifact` store key — an embed's Expand
 * button, the user, or either agent can set it; minimizing happens in the
 * toolbar's file bar, where the launched artifact shows as a closable pill
 * (main-toolbar.tsx).
 *
 * `open` drives the enter/exit animation (fade + rise + slight scale); the
 * component stays mounted through the exit and reports `onClosed` when the
 * fade-out finishes so App can unmount it.
 */
export function ExpandedArtifact({
  target,
  open,
  drawMode,
  scrollerRef,
  contentRef,
  onClosed,
  onNavigate,
}: {
  target: ExpandedArtifactRef;
  open: boolean;
  /** The toolbar pen tool: draw on the artifact, not the page beneath. */
  drawMode: boolean;
  /**
   * Expose the overlay's scroll container and content wrapper to App: while
   * an artifact is expanded, screenshots and state snapshots must observe
   * this surface, not the hidden document underneath.
   */
  scrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  onClosed: () => void;
  onNavigate: (url: string) => void;
}) {
  // The expanded surface has its own annotation layer with its own strokes —
  // the document's strokes live in document coordinates and stay with the
  // page underneath. Same eraser semantics as the page: leaving pen mode
  // clears; closing the overlay drops them with the component.
  const [strokes, setStrokes] = React.useState<StrokePoints[]>([]);
  React.useEffect(() => {
    if (!drawMode) setStrokes([]);
  }, [drawMode]);
  // Mount closed, then open after a forced reflow so the enter transition
  // runs. A reflow (not requestAnimationFrame) because rAF never fires in a
  // hidden tab — an agent can expand an artifact while the tab is occluded.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    void rootRef.current?.offsetWidth; // commit the closed style first
    setEntered(true);
  }, []);
  const shown = open && entered;

  // Unmount backstop: transitionend doesn't fire reliably in hidden tabs or
  // when a transition is interrupted, so the exit also reports closed on a
  // timer a little longer than the 300ms transition.
  const onClosedRef = React.useRef(onClosed);
  onClosedRef.current = onClosed;
  React.useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => onClosedRef.current(), 450);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        scrollerRef.current = el;
      }}
      className={cn(
        "absolute inset-0 z-10 overflow-y-auto overscroll-none bg-background select-text",
        "transition-[opacity,transform,filter] duration-300 ease-out",
        shown
          ? "translate-y-0 scale-100 opacity-100 blur-none"
          : "pointer-events-none translate-y-4 scale-[0.97] opacity-0 blur-[2px]"
      )}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget && e.propertyName === "opacity") {
          onClosed();
        }
      }}
    >
      {/* Same shape as the document wrapper in App: the annotation layer
          lives inside the scrolled content, so strokes are recorded in the
          artifact's own coordinates and stay glued through scrolling. */}
      <div ref={contentRef} className="relative min-h-full">
        {typeof target === "string" ? (
          <FileViewer url={target} onNavigate={onNavigate} />
        ) : (
          <InlineBlockView doc={target.doc} line={target.line} />
        )}
        <DrawingOverlay
          active={drawMode}
          strokes={strokes}
          onStrokesChange={setStrokes}
        />
      </div>
    </div>
  );
}

/**
 * Full-screen view of one inline ```oui block: fetch the page, extract the
 * block at the referenced fence line, render its program. Re-reads on wiki
 * hot-reload, so editing the block (it's just text in the .md) updates the
 * expanded view live — the same contract as file embeds.
 */
function InlineBlockView({ doc, line }: { doc: string; line: number }) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; program: string }
  >({ status: "loading" });

  const [wikiChanged] = useStoreValue<{ url: string; seq: number } | null>(
    "app/wiki-changed",
    null
  );
  const reloadSeq = wikiChanged?.url === doc ? wikiChanged.seq : 0;

  React.useEffect(() => {
    let stale = false;
    fetch(doc)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (stale) return;
        const block = blockAt(extractOuiBlocks(text), line);
        if (!block) {
          throw new Error(`no \`\`\`oui block at line ${line} of ${doc}`);
        }
        setState({ status: "ready", program: block.program });
      })
      .catch((err: Error) => {
        frontendLog("expanded-block:error", { doc, line, message: err.message });
        if (!stale) setState({ status: "error", message: err.message });
      });
    return () => {
      stale = true;
    };
  }, [doc, line, reloadSeq]);

  switch (state.status) {
    case "loading":
      return (
        <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" /> Loading the artifact…
        </p>
      );
    case "error":
      return (
        <p className="flex items-center gap-2 p-6 text-sm text-destructive">
          <FileWarningIcon className="size-4" /> Couldn’t load the artifact:{" "}
          {state.message}
        </p>
      );
    case "ready":
      return <GenerativeView response={state.program} />;
  }
}

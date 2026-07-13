import * as React from "react";
import { FileViewer } from "@/components/file-viewer";
import { cn } from "@/lib/utils";

/**
 * A launched artifact, taking over the content panel: full-screen view of a
 * wiki .oui file above the (still-mounted) document view. Driven by the
 * `app/expanded-artifact` store key — an embed's Expand button, the user,
 * or either agent can set it; minimizing happens in the toolbar's file bar,
 * where the launched artifact shows as a closable pill (main-toolbar.tsx).
 *
 * `open` drives the enter/exit animation (fade + rise + slight scale); the
 * component stays mounted through the exit and reports `onClosed` when the
 * fade-out finishes so App can unmount it.
 */
export function ExpandedArtifact({
  url,
  open,
  onClosed,
  onNavigate,
}: {
  url: string;
  open: boolean;
  onClosed: () => void;
  onNavigate: (url: string) => void;
}) {
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
      ref={rootRef}
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
      <FileViewer url={url} onNavigate={onNavigate} />
    </div>
  );
}

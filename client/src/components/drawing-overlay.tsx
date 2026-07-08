import * as React from "react";
import { INK_COLOR, strokeToPath, type StrokePoints } from "@/lib/freehand";

/**
 * Freehand annotation layer, rendered with perfect-freehand. Mounted inside
 * the scrolling document wrapper, so strokes are recorded and drawn in
 * document coordinates — they stay glued to the content through scrolling
 * and zooming (content *changes* like tab switches can still shift under
 * them). Controlled: the parent owns the strokes so it can clear them when
 * line mode ends. While active the overlay captures pointer input; wheel
 * scrolling still bubbles to the scroll container.
 */
export function DrawingOverlay({
  active,
  strokes,
  onStrokesChange,
}: {
  active: boolean;
  strokes: StrokePoints[];
  onStrokesChange: (strokes: StrokePoints[]) => void;
}) {
  // The in-progress stroke lives in a ref, not state: pointermove events can
  // arrive faster than React re-renders, and points must never be dropped.
  // The version counter just triggers a repaint after each mutation.
  const currentRef = React.useRef<StrokePoints | null>(null);
  const [, repaint] = React.useReducer((n: number) => n + 1, 0);

  if (!active && strokes.length === 0) return null;

  const localPoint = (
    e: React.PointerEvent<SVGSVGElement>
  ): [number, number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, e.pressure];
  };

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    currentRef.current = [localPoint(e)];
    repaint();
  };

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!currentRef.current || e.buttons !== 1) return;
    currentRef.current.push(localPoint(e));
    repaint();
  };

  const handleUp = () => {
    const stroke = currentRef.current;
    if (!stroke) return;
    currentRef.current = null;
    onStrokesChange([...strokes, stroke]);
  };

  return (
    <svg
      className={
        active
          ? "absolute inset-0 h-full w-full cursor-crosshair touch-none"
          : "pointer-events-none absolute inset-0 h-full w-full"
      }
      onPointerDown={active ? handleDown : undefined}
      onPointerMove={active ? handleMove : undefined}
      onPointerUp={active ? handleUp : undefined}
    >
      {[...strokes, ...(currentRef.current ? [currentRef.current] : [])].map(
        (stroke, i) => (
          <path key={i} d={strokeToPath(stroke)} fill={INK_COLOR} />
        )
      )}
    </svg>
  );
}

import { getStroke } from "perfect-freehand";

/** One freehand stroke: input points as [x, y, pressure] in overlay-local px. */
export type StrokePoints = [number, number, number][];

/** Ink color for annotations — high-contrast on both light and dark themes. */
export const INK_COLOR = "#e11d48";

const STROKE_OPTIONS = {
  size: 6,
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
};

/**
 * Input points → filled SVG path data for the stroke outline. perfect-freehand
 * turns the polyline into a pressure-shaped polygon; the quadratic-midpoint
 * smoothing below is the renderer recommended by its README.
 */
export function strokeToPath(points: StrokePoints): string {
  const outline = getStroke(points, STROKE_OPTIONS);
  const len = outline.length;
  if (len < 4) return "";

  const avg = (a: number, b: number) => (a + b) / 2;
  let [a, b] = [outline[0], outline[1]];
  const c = outline[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(
    2
  )} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;

  for (let i = 2; i < len - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return d + "Z";
}

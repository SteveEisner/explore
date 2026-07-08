import { toCanvas } from "html-to-image";

/**
 * Screenshot the main content area as the user currently sees it. html-to-image
 * clones the DOM, which loses inner scroll positions, so instead of capturing
 * the clipped scroller we render the document at full size (freehand
 * annotations included — the overlay is part of the document DOM) and crop to
 * the scroller's current viewport ourselves. Returns a PNG data URL.
 */
export async function captureMainView(
  scroller: HTMLElement,
  doc: HTMLElement
): Promise<string> {
  const ratio = window.devicePixelRatio || 1;
  const background = effectiveBackground(scroller);
  const docCanvas = await toCanvas(doc, {
    pixelRatio: ratio,
    backgroundColor: background,
  });

  const out = document.createElement("canvas");
  out.width = Math.round(scroller.clientWidth * ratio);
  out.height = Math.round(scroller.clientHeight * ratio);
  const ctx = out.getContext("2d")!;

  // Backdrop first: the document can be shorter than the viewport.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);

  const sx = Math.round(scroller.scrollLeft * ratio);
  const sy = Math.round(scroller.scrollTop * ratio);
  const sw = Math.min(out.width, docCanvas.width - sx);
  const sh = Math.min(out.height, docCanvas.height - sy);
  if (sw > 0 && sh > 0) {
    ctx.drawImage(docCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  return out.toDataURL("image/png");
}

/** Nearest non-transparent ancestor background, for the canvas backdrop. */
function effectiveBackground(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
  }
  return "#ffffff";
}

import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin: stamp each rendered element with the markdown source line
 * it came from (data-source-line = 1-based start line). remark/rehype carry
 * `position` through the pipeline, so the DOM ends up addressable by source
 * line — used by the app-state snapshot to say "line N is at the top of the
 * screen" and to map selections back to the document.
 */
export function rehypeSourceLines() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const line = node.position?.start?.line;
      if (line !== undefined) {
        node.properties = { ...node.properties, dataSourceLine: line };
      }
    });
  };
}

/**
 * The markdown source line at (or just above) the top of the scroller, plus
 * the last line still visible — computed from the data-source-line stamps.
 */
export function visibleSourceLines(
  scroller: HTMLElement
): { top: number; bottom: number } | null {
  const viewTop = scroller.getBoundingClientRect().top;
  const viewBottom = viewTop + scroller.clientHeight;
  let top: number | null = null;
  let bottom: number | null = null;
  for (const el of scroller.querySelectorAll<HTMLElement>("[data-source-line]")) {
    const rect = el.getBoundingClientRect();
    const line = Number(el.dataset.sourceLine);
    if (Number.isNaN(line)) continue;
    // First element whose bottom edge is below the fold top = top line.
    if (top === null && rect.bottom > viewTop) top = line;
    if (rect.top < viewBottom) bottom = Math.max(bottom ?? line, line);
  }
  return top === null ? null : { top, bottom: bottom ?? top };
}

/** Source line of the element containing a DOM node, walking ancestors. */
export function sourceLineOf(node: Node | null): number | null {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  while (el) {
    if (el.dataset.sourceLine) return Number(el.dataset.sourceLine);
    el = el.parentElement;
  }
  return null;
}

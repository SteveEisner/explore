/**
 * Point at content in the main panel for the agents: scroll the target into
 * view (when it isn't already visible) and blink it a few times. Targets:
 *
 * - `lines`  — markdown source lines, resolved through the
 *   `data-source-line` stamps rehypeSourceLines leaves on rendered blocks
 * - `statement` — an OpenUI statement name, resolved through the
 *   `data-statement` stamp on every component root
 * - `text` — a literal snippet, resolved by searching the rendered DOM
 *
 * App registers the provider (it owns the panel's scroller/doc elements);
 * callers reach it through `indicate()` — the voice agent's `indicate`
 * front-end tool and the `app/indicate` store key (the Claude session's
 * set_state path) both land here.
 */

export interface IndicateTarget {
  /** Markdown source lines (1-based, inclusive; `end` defaults to `start`). */
  lines?: { start: number; end?: number };
  /** OpenUI statement name in the rendered artifact. */
  statement?: string;
  /** Literal text to find in the rendered document (case-insensitive). */
  text?: string;
}

export interface IndicateResult {
  ok: boolean;
  matched: number;
  detail: string;
}

type IndicateProvider = (target: IndicateTarget) => IndicateResult;

let provider: IndicateProvider | null = null;

export function registerIndicateProvider(p: IndicateProvider): () => void {
  provider = p;
  return () => {
    if (provider === p) provider = null;
  };
}

/** Route a target to the registered provider (the mounted app). */
export function indicate(target: IndicateTarget): IndicateResult {
  if (!provider) {
    return { ok: false, matched: 0, detail: "the app's main panel is not mounted" };
  }
  return provider(target);
}

/** How many elements one call will blink at most (a range of lines can hit many). */
const MAX_BLINKED = 40;

export function indicateInPanel(
  scroller: HTMLElement,
  doc: HTMLElement,
  target: IndicateTarget
): IndicateResult {
  const resolved = resolveTarget(doc, target);
  if ("error" in resolved) return { ok: false, matched: 0, detail: resolved.error };
  const els = outermostOnly(resolved.els).slice(0, MAX_BLINKED);

  if (!isVisibleIn(scroller, els[0])) {
    els[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }
  for (const el of els) blink(el);
  return {
    ok: true,
    matched: els.length,
    detail: `scrolled into view and blinking ${els.length} element${els.length === 1 ? "" : "s"} (${resolved.what})`,
  };
}

function resolveTarget(
  doc: HTMLElement,
  target: IndicateTarget
): { els: HTMLElement[]; what: string } | { error: string } {
  if (target.lines) {
    const start = Math.trunc(Number(target.lines.start));
    const end = Math.trunc(Number(target.lines.end ?? start));
    if (!Number.isFinite(start) || start < 1) {
      return { error: "lines.start must be a positive line number" };
    }
    const stamped = [...doc.querySelectorAll<HTMLElement>("[data-source-line]")];
    if (stamped.length === 0) {
      return {
        error:
          "no line-addressable content on screen — line targets only work on a rendered markdown document",
      };
    }
    const lineOf = (el: HTMLElement) => Number(el.dataset.sourceLine);
    const inRange = stamped.filter((el) => {
      const line = lineOf(el);
      return line >= start && line <= end;
    });
    if (inRange.length > 0) {
      return { els: inRange, what: `markdown lines ${start}–${end}` };
    }
    // No block starts inside the range (e.g. mid-paragraph line): fall back
    // to the nearest block that starts at or before it.
    const before = stamped
      .filter((el) => lineOf(el) <= start)
      .sort((a, b) => lineOf(b) - lineOf(a));
    if (before.length > 0) {
      return {
        els: [before[0]],
        what: `the block containing line ${start} (starts at line ${lineOf(before[0])})`,
      };
    }
    return { error: `no rendered content at or before line ${start}` };
  }

  if (target.statement) {
    const name = target.statement.replace(/["\\]/g, "\\$&");
    const els = [...doc.querySelectorAll<HTMLElement>(`[data-statement="${name}"]`)];
    if (els.length === 0) {
      const available = [...doc.querySelectorAll<HTMLElement>("[data-statement]")]
        .map((el) => el.dataset.statement)
        .slice(0, 20);
      return {
        error:
          `no rendered statement named "${target.statement}"` +
          (available.length ? `; on screen: ${available.join(", ")}` : ""),
      };
    }
    return { els, what: `statement "${target.statement}"` };
  }

  if (target.text) {
    const needle = target.text.trim().toLowerCase();
    if (!needle) return { error: "text must be a non-empty snippet" };
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.toLowerCase().includes(needle)) {
        const el = node.parentElement;
        if (el) return { els: [el], what: `first occurrence of "${target.text}"` };
      }
    }
    return { error: `"${target.text}" not found in the rendered document` };
  }

  return { error: "pass exactly one of: lines, statement, text" };
}

/**
 * Nested stamps (a container and its children can both match a line range)
 * would double-blink; keep only elements with no matched ancestor.
 */
function outermostOnly(els: HTMLElement[]): HTMLElement[] {
  const set = new Set(els);
  return els.filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (set.has(p)) return false;
    }
    return true;
  });
}

/** Any vertical overlap with the scroller's viewport counts as visible. */
function isVisibleIn(scroller: HTMLElement, el: HTMLElement): boolean {
  const view = scroller.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return rect.bottom > view.top && rect.top < view.bottom;
}

/** Class removal timers, so re-pointing at an element restarts its blink. */
const blinkTimers = new WeakMap<HTMLElement, number>();

function blink(el: HTMLElement): void {
  const pending = blinkTimers.get(el);
  if (pending !== undefined) {
    window.clearTimeout(pending);
    el.classList.remove("indicate-blink");
    void el.offsetWidth; // reflow so re-adding restarts the animation
  }
  el.classList.add("indicate-blink");
  blinkTimers.set(
    el,
    window.setTimeout(() => {
      el.classList.remove("indicate-blink");
      blinkTimers.delete(el);
    }, 1800)
  );
}

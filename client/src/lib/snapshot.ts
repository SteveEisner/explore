import { sourceLineOf, visibleSourceLines } from "@/lib/source-lines";
import { stateSnapshot } from "@/lib/state-store";

/**
 * Assemble the structured "what is the user looking at" snapshot for the
 * LLM's `state` tool. Everything is computed from the live DOM plus the
 * bits of app state the caller passes in.
 */
export interface SnapshotInputs {
  view: { kind: "doc"; url: string | null } | { kind: "authoring" };
  chatOpen: boolean;
  chatBusy: boolean;
  drawMode: boolean;
  strokeCount: number;
  authoringProgram: string | null;
  pointer: { x: number; y: number; at: number } | null;
  scroller: HTMLElement | null;
  doc: HTMLElement | null;
}

export function buildAppSnapshot(inputs: SnapshotInputs): unknown {
  const { view, scroller, doc } = inputs;
  return {
    view:
      view.kind === "authoring"
        ? {
            mode: "authoring",
            description:
              "New Artifact: rendering the OUI program from your ui tool calls",
            program: cap(inputs.authoringProgram, 8000),
          }
        : {
            mode: "viewing",
            url: view.url,
            filename: view.url?.split("/").pop() ?? "Untitled.oui (empty)",
            fileType: view.url?.endsWith(".oui")
              ? "oui"
              : view.url
                ? "markdown"
                : "oui",
          },
    scroll: snapshotScroll(scroller),
    selection: snapshotSelection(doc),
    pointer: snapshotPointer(inputs.pointer, doc),
    panels: {
      chat: { open: inputs.chatOpen, turnInProgress: inputs.chatBusy },
      drawing: { active: inputs.drawMode, strokeCount: inputs.strokeCount },
    },
    /**
     * The D3 state store: every key the app and artifact controls render
     * from. Each is writable through the set_state tool.
     */
    stateStore: stateSnapshot(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    capturedAt: new Date().toISOString(),
  };
}

/** Scroll position in pixels and, for markdown, in source line numbers. */
function snapshotScroll(scroller: HTMLElement | null): unknown {
  if (!scroller) return null;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const lines = visibleSourceLines(scroller);
  return {
    scrollTopPx: Math.round(scroller.scrollTop),
    scrollHeightPx: scroller.scrollHeight,
    viewportHeightPx: scroller.clientHeight,
    percent: max === 0 ? 0 : Math.round((scroller.scrollTop / max) * 100),
    /** Markdown source line at the top of the screen (1-based), if any. */
    topSourceLine: lines?.top ?? null,
    /** Last markdown source line still visible. */
    bottomSourceLine: lines?.bottom ?? null,
  };
}

/** The user's text selection inside the main document, if any. */
function snapshotSelection(doc: HTMLElement | null): unknown {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { active: false };
  }
  const range = selection.getRangeAt(0);
  const inDocument =
    doc !== null &&
    doc.contains(range.startContainer) &&
    doc.contains(range.endContainer);
  return {
    active: true,
    inMainPanel: inDocument,
    text: cap(selection.toString(), 4000),
    startSourceLine: inDocument ? sourceLineOf(range.startContainer) : null,
    endSourceLine: inDocument ? sourceLineOf(range.endContainer) : null,
  };
}

/** Where the mouse is hovering and what element is under it. */
function snapshotPointer(
  pointer: { x: number; y: number; at: number } | null,
  doc: HTMLElement | null
): unknown {
  if (!pointer) return null;
  const el = document.elementFromPoint(pointer.x, pointer.y);
  const inDocument = doc !== null && el !== null && doc.contains(el);
  return {
    x: pointer.x,
    y: pointer.y,
    msAgo: Date.now() - pointer.at,
    overMainPanel: inDocument,
    elementUnderPointer: el
      ? {
          tag: el.tagName.toLowerCase(),
          sourceLine: sourceLineOf(el),
          text: cap(el.textContent?.trim() ?? "", 120),
        }
      : null,
  };
}

function cap(text: string | null, max: number): string | null {
  if (text == null) return null;
  return text.length > max ? text.slice(0, max) + `… [truncated]` : text;
}

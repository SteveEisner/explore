/**
 * What `app/expanded-artifact` may hold (decisions.md D8): a wiki .oui URL,
 * or a {doc, line} reference to an inline ```oui block — the page URL plus
 * the source line of the block's opening fence. The store key is
 * LLM-writable, so consumers normalize instead of trusting the shape.
 */

export type ExpandedArtifactRef = string | { doc: string; line: number };

export function normalizeExpandedRef(raw: unknown): ExpandedArtifactRef | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw !== null && typeof raw === "object") {
    const o = raw as { doc?: unknown; line?: unknown };
    if (typeof o.doc === "string" && o.doc.trim() && typeof o.line === "number") {
      return { doc: o.doc, line: Math.trunc(o.line) };
    }
  }
  return null;
}

/** Short human name for the toolbar pill and aria labels. */
export function expandedRefLabel(ref: ExpandedArtifactRef): string {
  if (typeof ref === "string") return ref.split("/").pop() ?? ref;
  return `${ref.doc.split("/").pop()} artifact`;
}

/** Stable identity for effect deps and render keys. */
export function expandedRefKey(ref: ExpandedArtifactRef | null): string {
  if (ref === null) return "";
  return typeof ref === "string" ? ref : `${ref.doc}#${ref.line}`;
}

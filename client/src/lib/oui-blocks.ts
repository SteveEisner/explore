/**
 * Inline OpenUI blocks (decisions.md D8): a wiki markdown page carries an
 * artifact as a fenced code block with language `oui`. This module finds
 * those blocks in raw markdown so the renderer (markdown.tsx) and the
 * maximize path (expanded-artifact.tsx) agree on what a block is and where
 * it lives — a block is addressed by the source line of its opening fence.
 */

export interface OuiBlock {
  /** 1-based markdown source line of the opening ```oui fence. */
  line: number;
  /** The OpenUI Lang program between the fences. */
  program: string;
}

/** Opening fence: ```oui or ~~~oui, up to 3 leading spaces, per CommonMark. */
const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})\s*oui\s*$/;

export function extractOuiBlocks(markdown: string): OuiBlock[] {
  const lines = markdown.split("\n");
  const blocks: OuiBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN_FENCE.exec(lines[i]);
    if (!open) continue;
    const closer = new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !closer.test(lines[j])) {
      body.push(lines[j]);
      j++;
    }
    blocks.push({ line: i + 1, program: body.join("\n") });
    i = j; // continue after the closing fence (or EOF for an unclosed block)
  }
  return blocks;
}

/**
 * The block a maximize reference points at. Exact fence-line match first;
 * then nearest within a small tolerance (renderers and extractors can
 * disagree by a line or two about where a fence "starts"); a sole block
 * matches anything — a one-artifact page can't be ambiguous.
 */
export function blockAt(blocks: OuiBlock[], line: number): OuiBlock | null {
  const exact = blocks.find((b) => b.line === line);
  if (exact) return exact;
  const near = blocks.filter((b) => Math.abs(b.line - line) <= 2);
  if (near.length === 1) return near[0];
  if (blocks.length === 1) return blocks[0];
  return null;
}

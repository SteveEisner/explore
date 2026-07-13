import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mergeStatements } from "@openuidev/lang-core";
import { listWikiFiles } from "./wiki-files.js";

/**
 * Wiki content service: read, search, and edit files inside the wiki
 * directory. This is the internal surface behind every non-MCP way of
 * touching wiki content — the voice agent's server tools and (future) HTTP
 * endpoints — so path safety and edit semantics live in exactly one place.
 *
 * All functions take the wiki root and a *wiki-relative* path already
 * validated by `wikiDocPath`; they throw plain Errors with user-readable
 * messages (the voice bridge forwards them verbatim to the model, so a
 * failed call must teach the model how to correct itself).
 */

/** Longest slice `readDoc` returns; keeps tool results bounded. */
export const MAX_READ_LINES = 400;
/** Default `readDoc` slice when the caller doesn't pass a limit. */
export const DEFAULT_READ_LINES = 200;
/** Search stops collecting after this many matching lines. */
const MAX_SEARCH_RESULTS = 40;
/** Files larger than this are skipped by search (the wiki is prose/specs). */
const MAX_SEARCHABLE_BYTES = 512 * 1024;

/**
 * Normalize a caller-supplied file reference into a safe wiki-relative path,
 * or null if it can't be one. Accepts the /docs/<path> URL form the model
 * sees elsewhere. Every segment must be a plain name — no traversal, no
 * absolute paths, no hidden files (leading `\w` rules out "." / ".." /
 * dotfiles; the trailing-dot check rules out Windows-style "name." tricks).
 */
export function wikiDocPath(file: unknown): string | null {
  if (typeof file !== "string") return null;
  const rel = file.trim().replace(/^\/docs\//, "");
  if (!rel) return null;
  const plainSegment = /^[\w][\w .-]*$/;
  const segments = rel.split("/");
  if (!segments.every((s) => plainSegment.test(s) && !s.endsWith("."))) {
    return null;
  }
  return rel;
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export interface DocSlice {
  path: string;
  /** Total lines in the file — tells the caller whether to page further. */
  totalLines: number;
  /** 1-based line number of the first returned line. */
  offset: number;
  /** The requested lines, joined with newlines (plain text, no numbering). */
  lines: string;
}

/**
 * Read a bounded slice of a wiki file: at most `limit` lines starting at
 * 1-based `offset` — never the whole document, so arbitrarily long files
 * stay cheap to consult. Out-of-range offsets and missing files throw with
 * the fact the caller needs to correct the call (total line count, listing
 * hint).
 */
export async function readDoc(
  wikiDir: string,
  rel: string,
  offset = 1,
  limit = DEFAULT_READ_LINES
): Promise<DocSlice> {
  const content = await readDocFile(wikiDir, rel);
  const all = splitLines(content);
  const from = Math.max(1, Math.floor(offset));
  const count = Math.min(MAX_READ_LINES, Math.max(1, Math.floor(limit)));
  if (from > all.length) {
    throw new Error(
      `offset ${from} is past the end of ${rel} (${all.length} lines)`
    );
  }
  return {
    path: rel,
    totalLines: all.length,
    offset: from,
    lines: all.slice(from - 1, from - 1 + count).join("\n"),
  };
}

export interface SearchMatch {
  path: string;
  /** 1-based line number of the matching line. */
  line: number;
  text: string;
}

/**
 * Case-insensitive literal search across every wiki file, line by line.
 * Returns up to MAX_SEARCH_RESULTS matches plus whether the cap cut the
 * list short — a truncated result must never read as "that's everything".
 * Oversized files are skipped rather than scanned (the wiki holds prose;
 * anything huge is an import artifact, not content to quote).
 */
export async function searchDocs(
  wikiDir: string,
  query: string
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  const needle = query.toLowerCase();
  if (!needle) throw new Error("empty search query");
  const matches: SearchMatch[] = [];
  for (const file of listWikiFiles(wikiDir)) {
    if (file.size > MAX_SEARCHABLE_BYTES) continue;
    const content = await readFile(path.join(wikiDir, file.path), "utf8");
    const lines = splitLines(content);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(needle)) continue;
      matches.push({
        path: file.path,
        line: i + 1,
        text: lines[i].length > 200 ? lines[i].slice(0, 197) + "…" : lines[i],
      });
      if (matches.length >= MAX_SEARCH_RESULTS) {
        return { matches, truncated: true };
      }
    }
  }
  return { matches, truncated: false };
}

/**
 * Exact search/replace edit (decisions.md D1): `oldText` must occur exactly
 * once in the file; that one occurrence is replaced with `newText` and the
 * file is written back. The two failure modes throw loud, distinguishable
 * errors — "no match" tells the caller to re-copy the text exactly,
 * "N matches" tells it to include more surrounding context — because a
 * silent wrong-place edit is worse than no edit.
 */
export async function editDoc(
  wikiDir: string,
  rel: string,
  oldText: string,
  newText: string
): Promise<void> {
  if (!oldText) throw new Error("old_text must not be empty");
  const content = await readDocFile(wikiDir, rel);
  const occurrences = content.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `no match for old_text in ${rel} — copy the text to replace exactly, including whitespace and line breaks (read_doc shows the current content)`
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `old_text matches ${occurrences} places in ${rel} — include more surrounding context so it matches exactly one`
    );
  }
  // Replacement via callback: a plain string replacement would expand `$`
  // patterns in newText, corrupting content that legitimately contains them.
  const edited = content.replace(oldText, () => newText);
  await writeFile(path.join(wikiDir, rel), edited, "utf8");
}

/**
 * Text types agents may create. Everything here is servable by the app and
 * editable through the agents' own tools afterward — a create that neither
 * surface could ever render or edit again is a mistake, not a capability.
 */
const CREATABLE_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".oui",
  ".txt",
  ".html",
  ".csv",
  ".json",
]);

/**
 * Create a new wiki file (any supported text type, .oui included — the
 * agent-side counterpart of the user's artifact save). Refuses to overwrite:
 * changing an existing file is edit_doc / edit_artifact territory, so a
 * duplicate path errors instead of silently clobbering. Parent folders are
 * created as needed.
 */
export async function createDoc(
  wikiDir: string,
  rel: string,
  content: string
): Promise<void> {
  const ext = path.extname(rel).toLowerCase();
  if (!CREATABLE_EXTENSIONS.has(ext)) {
    throw new Error(
      `cannot create "${rel}" — supported types: ${[...CREATABLE_EXTENSIONS].join(", ")}`
    );
  }
  const abs = path.join(wikiDir, rel);
  if (existsSync(abs)) {
    throw new Error(
      `"${rel}" already exists — edit it instead (edit_doc for text, edit_artifact for .oui)`
    );
  }
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, ensureTrailingNewline(content), "utf8");
}

/**
 * Merge an OpenUI Lang edit patch into an existing wiki .oui file — the same
 * statement-name semantics as the authoring panel's edit mode (same name
 * replaces, new name appends, statements unreachable from root are dropped)
 * — and write the merged program back. The file must already exist: new
 * artifacts are created by saving from the panel, so a typo'd path errors
 * instead of silently spawning a file.
 */
export async function editArtifactSpec(
  wikiDir: string,
  rel: string,
  spec: string
): Promise<void> {
  const existing = await readDocFile(wikiDir, rel);
  const merged = mergeStatements(existing, spec);
  await writeFile(
    path.join(wikiDir, rel),
    ensureTrailingNewline(merged),
    "utf8"
  );
}

/** Read a wiki file, turning ENOENT into the caller-correctable message. */
async function readDocFile(wikiDir: string, rel: string): Promise<string> {
  try {
    return await readFile(path.join(wikiDir, rel), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`"${rel}" does not exist in the wiki — check list_docs`);
    }
    throw err;
  }
}

/**
 * File content as lines. A trailing newline is a line *terminator*, not an
 * extra empty line — "a\nb\n" is two lines — so drop the final empty piece.
 */
function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

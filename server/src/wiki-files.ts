import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The wiki file inventory, shared by every listing surface (the /api HTTP
 * endpoint the home view reads and the wiki MCP server's list_files tool),
 * so they can never disagree about what the wiki contains.
 */
export interface WikiFile {
  /** Wiki-relative path with "/" separators, e.g. "notes/topic.md". */
  path: string;
  size: number;
  /** Last modification time, ISO 8601. */
  modified: string;
}

/**
 * Every file under the wiki, sorted by name at each level, directories
 * flattened into relative paths. Dot-entries (vault index, .DS_Store,
 * editor droppings) are hidden at every depth — the same rule the wiki
 * watcher applies, so listings never show a file whose changes wouldn't
 * broadcast.
 */
export function listWikiFiles(dir: string, prefix = ""): WikiFile[] {
  const files: WikiFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stats = statSync(abs);
    if (stats.isDirectory()) {
      files.push(...listWikiFiles(abs, rel));
    } else {
      files.push({
        path: rel,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    }
  }
  return files;
}

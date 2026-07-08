import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Standalone MCP stdio server exposing wiki file-system tools to the Claude
 * CLI. The wiki directory comes from the WIKI_PATH env var.
 *
 * The markdown-vault MCP server owns note-level operations but only sees
 * markdown; the wiki also holds .oui and .html pages, so this server fills
 * the gap with a complete file listing.
 */
const wikiRoot = process.env.WIKI_PATH;
if (!wikiRoot) {
  console.error("wiki-mcp: WIKI_PATH env var is required");
  process.exit(1);
}

interface WikiFile {
  path: string;
  size: number;
  modified: string;
}

/** All files under the wiki, skipping dot-entries (vault index, .DS_Store). */
function listFiles(dir: string, prefix = ""): WikiFile[] {
  const files: WikiFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stats = statSync(abs);
    if (stats.isDirectory()) {
      files.push(...listFiles(abs, rel));
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

const server = new McpServer({ name: "wiki", version: "0.1.0" });

server.registerTool(
  "list_files",
  {
    description:
      "List every file in the user's wiki (all types — .md, .oui, .html, " +
      "images), with sizes and modification times. Markdown notes are " +
      "editable through the vault tools; every file is web-served at " +
      "/docs/<path>, so use that URL form when linking wiki pages in UIs.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(listFiles(wikiRoot), null, 2),
      },
    ],
  })
);

await server.connect(new StdioServerTransport());

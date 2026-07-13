import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listWikiFiles } from "./wiki-files.js";
import { createDoc, readDoc, wikiDocPath } from "./wiki-service.js";

/**
 * Standalone MCP stdio server exposing wiki file-system tools to the Claude
 * CLI. The wiki directory comes from the WIKI_PATH env var.
 *
 * The markdown-vault MCP server owns note-level operations but only sees
 * markdown; the wiki also holds .oui and .html pages, so this server fills
 * the gap: a complete file listing (shared with the app's /api/wiki/files
 * endpoint via wiki-files.ts), chunked reads of any file type, and file
 * creation for the types the vault can't write (notably .oui). All content
 * operations go through wiki-service.ts — the same path-safety and edit
 * semantics as the voice agent's tools.
 */
const wikiRoot = process.env.WIKI_PATH;
if (!wikiRoot) {
  console.error("wiki-mcp: WIKI_PATH env var is required");
  process.exit(1);
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
        text: JSON.stringify(listWikiFiles(wikiRoot), null, 2),
      },
    ],
  })
);

/** Uniform error shape: the message teaches the model how to correct itself. */
function toolError(err: unknown) {
  return {
    content: [{ type: "text" as const, text: String((err as Error).message ?? err) }],
    isError: true,
  };
}

/** Resolve a path argument or throw the teaching error. */
function requirePath(file: string): string {
  const rel = wikiDocPath(file);
  if (!rel) {
    throw new Error(
      `invalid path "${file}" — pass a wiki-relative path like "journeys.md" (list_files shows every file); no absolute paths or ".."`
    );
  }
  return rel;
}

server.registerTool(
  "read_file",
  {
    description:
      "Read part of any wiki file as plain text — including the types the " +
      "vault tools can't see (.oui artifacts, .html pages). Returns at most " +
      "`limit` lines from 1-based line `offset`, plus the file's total line " +
      "count; page through long files with further calls. For markdown " +
      "notes the vault view tool (with search) is usually better.",
    inputSchema: {
      path: z
        .string()
        .describe("Wiki-relative path or /docs/<path> URL"),
      offset: z
        .number()
        .optional()
        .describe("1-based first line to return (default 1)"),
      limit: z
        .number()
        .optional()
        .describe("Max lines to return (default 200, cap 400)"),
    },
  },
  async ({ path, offset, limit }) => {
    try {
      const slice = await readDoc(wikiRoot, requirePath(path), offset, limit);
      return { content: [{ type: "text", text: JSON.stringify(slice) }] };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.registerTool(
  "create_file",
  {
    description:
      "Create a new file in the wiki — any supported text type, including " +
      ".oui exploration artifacts (write a complete OpenUI Lang program as " +
      "the content). Fails if the file already exists: change existing " +
      "files with the vault edit tool (markdown) or edit_artifact (.oui). " +
      "Parent folders are created as needed.",
    inputSchema: {
      path: z
        .string()
        .describe("Wiki-relative path for the new file, e.g. 'notes/idea.md'"),
      content: z.string().describe("The full file content"),
    },
  },
  async ({ path, content }) => {
    try {
      const rel = requirePath(path);
      await createDoc(wikiRoot, rel, content);
      return {
        content: [
          { type: "text", text: `Created ${rel} (served at /docs/${rel}).` },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

await server.connect(new StdioServerTransport());

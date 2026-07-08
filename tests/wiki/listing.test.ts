import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Listing surface of the wiki: the `wiki` MCP server's `list_files` tool,
 * which is how the LLM enumerates every wiki file (including the non-
 * markdown ones the vault server can't see). These tests speak real MCP
 * over stdio to the real server process and prove the listing covers nested
 * files of every type with sizes, and hides internal dot-entries.
 */

const repoRoot = path.resolve(import.meta.dirname, "../..");

const SEED = {
  "guide.md": "# Guide\n",
  "notes/deep.oui": "root = Stack([])\n",
  ".vault-index.json": "{}", // internal dot-entry: must not be listed
};

interface ListedFile {
  path: string;
  size: number;
  modified: string;
}

describe("wiki listing via the wiki MCP server", () => {
  let wikiDir: string;
  let client: Client;
  before(async () => {
    wikiDir = await mkdtemp(path.join(tmpdir(), "explore-wiki-mcp-"));
    for (const [rel, content] of Object.entries(SEED)) {
      await mkdir(path.dirname(path.join(wikiDir, rel)), { recursive: true });
      await writeFile(path.join(wikiDir, rel), content, "utf8");
    }
    client = new Client({ name: "tests", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: path.join(repoRoot, "node_modules/.bin/tsx"),
        args: [path.join(repoRoot, "server/src/wiki-mcp.ts")],
        env: { ...process.env, WIKI_PATH: wikiDir } as Record<string, string>,
      })
    );
  });
  after(async () => {
    await client.close();
    await rm(wikiDir, { recursive: true, force: true });
  });

  it("lists every visible file with its path, byte size, and mtime", async () => {
    const files = await listFiles(client);

    // Nested paths use forward slashes relative to the wiki root — the
    // same form the /docs/<path> URLs are built from.
    assert.deepEqual(
      files.map((f) => f.path),
      ["guide.md", "notes/deep.oui"]
    );
    for (const file of files) {
      const seeded = SEED[file.path as keyof typeof SEED];
      assert.equal(file.size, Buffer.byteLength(seeded), `size of ${file.path}`);
      assert.ok(
        !Number.isNaN(Date.parse(file.modified)),
        `modified of ${file.path} is a parseable timestamp`
      );
    }
  });

  it("hides dot-entries (vault index, .DS_Store) from the model", async () => {
    const files = await listFiles(client);
    assert.ok(
      files.every((f) => !f.path.includes(".vault-index")),
      "internal dotfile leaked into the listing"
    );
  });
});

/** Call list_files and decode its JSON text payload. */
async function listFiles(client: Client): Promise<ListedFile[]> {
  const result = await client.callTool({ name: "list_files", arguments: {} });
  const content = result.content as Array<{ type: string; text?: string }>;
  assert.equal(content[0]?.type, "text");
  return JSON.parse(content[0].text ?? "") as ListedFile[];
}

/**
 * Manual probe: drive the @wirux/mcp-markdown-vault MCP server (the "vault"
 * server claude.ts wires into CLI sessions) directly over stdio and exercise
 * its search surface — view.search / view.global_search / view.semantic_search.
 *
 * Run:  node_modules/.bin/tsx scripts/probe-vault-mcp.mts
 *
 * NOT part of `npm test` on purpose: on a fresh checkout semantic search
 * downloads an ~86MB embedding model (Xenova/all-MiniLM-L6-v2) into
 * node_modules/@huggingface/transformers/.cache, which is neither hermetic
 * nor fast. With the model cached, the whole probe runs in seconds.
 *
 * The probe copies a few real docs into a temp vault so the real state dir
 * (docs/.markdown_vault_mcp) is never touched.
 */
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scratch =
  process.env.PROBE_SCRATCH ?? path.join(os.tmpdir(), "vault-probe");
mkdirSync(scratch, { recursive: true });
const vaultDir = mkdtempSync(path.join(scratch, "vault-"));

// A small vault of real wiki content, including decisions.md — its D5
// section holds distinctive strings ("gpt-realtime", "Petri"-free prose)
// that known-good search must find.
for (const f of ["decisions.md", "ARCHITECTURE.md", "journeys.md"]) {
  copyFileSync(path.join(repoRoot, "docs", f), path.join(vaultDir, f));
}

const transport = new StdioClientTransport({
  command: path.join(repoRoot, "node_modules", ".bin", "markdown-vault-mcp"),
  env: { ...process.env, VAULT_PATH: vaultDir } as Record<string, string>,
  stderr: "pipe",
});
const client = new Client({ name: "vault-probe", version: "0.0.1" });

function firstText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  return content?.find((c) => c.type === "text")?.text ?? "(no text content)";
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  console.log(`\n=== ${label} (${Date.now() - t0}ms) ===`);
  return out;
}

try {
  await client.connect(transport);
  transport.stderr?.on("data", (d: Buffer) =>
    console.error(`[server] ${String(d).trimEnd()}`)
  );

  const tools = await timed("list tools", () => client.listTools());
  for (const t of tools.tools) {
    console.log(`- ${t.name}: ${(t.description ?? "").slice(0, 100)}`);
  }
  const view = tools.tools.find((t) => t.name === "view");
  console.log(
    "\nview input schema:",
    JSON.stringify(view?.inputSchema).slice(0, 2000)
  );

  const calls: Array<{ label: string; args: Record<string, unknown> }> = [
    // Fragment retrieval within one known file.
    {
      label: "view.search (in decisions.md)",
      args: { action: "search", path: "decisions.md", query: "gpt-realtime" },
    },
    // Cross-vault lexical search for a distinctive D5 phrase.
    {
      label: "view.global_search",
      args: { action: "global_search", query: "ephemeral session tokens" },
    },
    // Hybrid semantic search — a paraphrase, not a literal string, so a hit
    // proves the vector side works and the index actually built.
    {
      label: "view.semantic_search",
      args: {
        action: "semantic_search",
        query: "how does voice audio reach the AI model",
      },
    },
  ];
  for (const { label, args } of calls) {
    const res = await timed(label, () =>
      client.callTool({ name: "view", arguments: args })
    );
    console.log(firstText(res).slice(0, 3000));
  }

  // system.status reports indexing state — proves the semantic index built.
  const status = await timed("system.status", () =>
    client.callTool({ name: "system", arguments: { action: "status" } })
  );
  console.log(firstText(status).slice(0, 2000));
} finally {
  await client.close().catch(() => {});
  rmSync(vaultDir, { recursive: true, force: true });
}

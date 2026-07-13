import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSystemPrompt } from "../../server/src/prompt.js";

/**
 * The D7 wiki preload inlines whole wiki pages into the appended system
 * prompt. These tests pin the contracts that keep it a safe optimization:
 * pages anywhere in the wiki tree are found and labeled by wiki-relative
 * path (the docs reorg into subdirectories must not silently empty the
 * preload again), hidden directories like the vault index never leak into
 * the prompt, the byte budget admits whole small files and excludes whole
 * large ones (never a truncated page), and WIKI_PRELOAD_BYTES=0 disables
 * the section entirely.
 */

describe("wiki preload", () => {
  let wikiDir: string;

  before(async () => {
    wikiDir = await mkdtemp(path.join(tmpdir(), "explore-preload-"));
    await writeFile(path.join(wikiDir, "root-page.md"), "root body", "utf8");
    await mkdir(path.join(wikiDir, "design", "api"), { recursive: true });
    await writeFile(path.join(wikiDir, "design", "journeys.md"), "journeys body", "utf8");
    await writeFile(path.join(wikiDir, "design", "api", "contract.md"), "contract body", "utf8");
    // Over any test budget: must be skipped whole, never truncated.
    await writeFile(path.join(wikiDir, "design", "huge.md"), "x".repeat(50_000), "utf8");
    await mkdir(path.join(wikiDir, ".markdown_vault_mcp"), { recursive: true });
    await writeFile(path.join(wikiDir, ".markdown_vault_mcp", "index.md"), "vault index", "utf8");
  });

  after(async () => {
    delete process.env.WIKI_PRELOAD_BYTES;
    await rm(wikiDir, { recursive: true, force: true });
  });

  it("inlines pages from subdirectories, labeled by wiki-relative path", () => {
    delete process.env.WIKI_PRELOAD_BYTES;
    const prompt = buildSystemPrompt({ wikiDir });
    assert.match(prompt, /### root-page\.md\n\nroot body/);
    assert.match(prompt, /### design\/journeys\.md\n\njourneys body/);
    assert.match(prompt, /### design\/api\/contract\.md\n\ncontract body/);
  });

  it("skips hidden directories and never truncates: over-budget pages are omitted whole", () => {
    delete process.env.WIKI_PRELOAD_BYTES;
    const prompt = buildSystemPrompt({ wikiDir });
    assert.doesNotMatch(prompt, /vault index/);
    assert.doesNotMatch(prompt, /huge\.md/);
    assert.doesNotMatch(prompt, /xxxxx/);
  });

  it("WIKI_PRELOAD_BYTES=0 disables the preload section", () => {
    process.env.WIKI_PRELOAD_BYTES = "0";
    const prompt = buildSystemPrompt({ wikiDir });
    assert.doesNotMatch(prompt, /Preloaded wiki pages/);
  });

  it("a missing wiki dir yields a prompt without a preload section, not an error", () => {
    delete process.env.WIKI_PRELOAD_BYTES;
    const prompt = buildSystemPrompt({ wikiDir: path.join(wikiDir, "does-not-exist") });
    assert.doesNotMatch(prompt, /Preloaded wiki pages/);
  });
});

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  editDoc,
  readDoc,
  searchDocs,
  wikiDocPath,
} from "../../server/src/wiki-service.js";

/**
 * The wiki service (voice row 2) is the shared internal surface the voice
 * agent edits the wiki through, so these tests pin its three contracts:
 * bounded chunked reads (never the whole doc), loud distinguishable
 * str_replace failures (D1 — no match vs. ambiguous match, and no write in
 * either case), and traversal-proof path normalization.
 */

describe("wiki service", () => {
  let wikiDir: string;
  /** 450 numbered lines — past the 400-line cap, so both paging and the
   * whole-doc guard are observable. */
  const longDoc = Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

  before(async () => {
    wikiDir = await mkdtemp(path.join(tmpdir(), "explore-wiki-service-"));
    await writeFile(path.join(wikiDir, "long.md"), longDoc, "utf8");
    await writeFile(
      path.join(wikiDir, "notes.md"),
      "# Notes\nThe launch is on Tuesday.\nthe launch team meets daily.\n",
      "utf8"
    );
    await mkdir(path.join(wikiDir, "nested"), { recursive: true });
    await writeFile(
      path.join(wikiDir, "nested", "deep.md"),
      "buried treasure\n",
      "utf8"
    );
  });

  after(async () => {
    await rm(wikiDir, { recursive: true, force: true });
  });

  describe("readDoc chunking", () => {
    it("defaults to the first 200 lines and reports the true total", async () => {
      const slice = await readDoc(wikiDir, "long.md");
      assert.equal(slice.totalLines, 450);
      assert.equal(slice.offset, 1);
      const lines = slice.lines.split("\n");
      assert.equal(lines.length, 200);
      assert.equal(lines[0], "line 1");
      assert.equal(lines[199], "line 200");
    });

    it("pages from an offset with a caller-chosen limit", async () => {
      const slice = await readDoc(wikiDir, "long.md", 291, 50);
      const lines = slice.lines.split("\n");
      assert.equal(lines.length, 50);
      assert.equal(lines[0], "line 291");
      assert.equal(lines[49], "line 340");
    });

    it("returns a short tail slice when fewer lines remain than asked", async () => {
      const slice = await readDoc(wikiDir, "long.md", 441, 50);
      const lines = slice.lines.split("\n");
      assert.equal(lines.length, 10);
      assert.equal(lines[9], "line 450");
    });

    it("caps the limit so a huge request cannot return the whole doc", async () => {
      const slice = await readDoc(wikiDir, "long.md", 1, 100_000);
      assert.equal(slice.lines.split("\n").length, 400);
    });

    it("rejects an offset past the end, naming the total", async () => {
      await assert.rejects(
        () => readDoc(wikiDir, "long.md", 451),
        /450 lines/
      );
    });

    it("rejects a missing file with the list_docs hint", async () => {
      await assert.rejects(() => readDoc(wikiDir, "ghost.md"), /list_docs/);
    });
  });

  describe("searchDocs", () => {
    it("finds matches case-insensitively with paths and line numbers", async () => {
      const { matches, truncated } = await searchDocs(wikiDir, "THE LAUNCH");
      assert.equal(truncated, false);
      assert.deepEqual(
        matches.map((m) => [m.path, m.line]),
        [
          ["notes.md", 2],
          ["notes.md", 3],
        ]
      );
    });

    it("reaches nested files", async () => {
      const { matches } = await searchDocs(wikiDir, "treasure");
      assert.deepEqual(matches.map((m) => m.path), ["nested/deep.md"]);
    });

    it("flags truncation instead of silently capping", async () => {
      // "line" appears 450 times in long.md; the cap is 40.
      const { matches, truncated } = await searchDocs(wikiDir, "line");
      assert.equal(matches.length, 40);
      assert.equal(truncated, true);
    });
  });

  describe("editDoc str_replace semantics (D1)", () => {
    it("replaces a unique match exactly once", async () => {
      await editDoc(wikiDir, "notes.md", "on Tuesday", "on Wednesday");
      const content = await readFile(path.join(wikiDir, "notes.md"), "utf8");
      assert.match(content, /on Wednesday/);
      assert.doesNotMatch(content, /on Tuesday/);
    });

    it("does not expand $-patterns from the replacement text", async () => {
      await editDoc(wikiDir, "notes.md", "# Notes", "# Notes ($& $1 $')");
      const content = await readFile(path.join(wikiDir, "notes.md"), "utf8");
      assert.match(content, /\$& \$1 \$'/);
    });

    it("refuses a no-match edit loudly and writes nothing", async () => {
      const before = await readFile(path.join(wikiDir, "notes.md"), "utf8");
      await assert.rejects(
        () => editDoc(wikiDir, "notes.md", "not in the file", "x"),
        /no match/
      );
      assert.equal(await readFile(path.join(wikiDir, "notes.md"), "utf8"), before);
    });

    it("refuses an ambiguous edit, naming the match count", async () => {
      const before = await readFile(path.join(wikiDir, "notes.md"), "utf8");
      // "launch" survives both earlier edits and still appears twice.
      await assert.rejects(
        () => editDoc(wikiDir, "notes.md", "launch", "liftoff"),
        /matches 2 places/
      );
      assert.equal(await readFile(path.join(wikiDir, "notes.md"), "utf8"), before);
    });
  });

  describe("wikiDocPath normalization", () => {
    it("accepts plain and nested paths, and the /docs/ URL form", () => {
      assert.equal(wikiDocPath("notes.md"), "notes.md");
      assert.equal(wikiDocPath("nested/deep.md"), "nested/deep.md");
      assert.equal(wikiDocPath("/docs/nested/deep.md"), "nested/deep.md");
    });

    it("rejects traversal, absolute, and hidden forms", () => {
      for (const bad of [
        "../secrets.md",
        "nested/../../etc/passwd",
        "/etc/passwd",
        ".obsidian/config",
        "nested/.hidden.md",
        "name./x.md",
        "",
        42,
      ]) {
        assert.equal(wikiDocPath(bad), null, `expected null for ${String(bad)}`);
      }
    });
  });
});

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDoc,
  editDoc,
  readDoc,
  renameDoc,
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

  describe("createDoc", () => {
    it("creates a new file (parent dirs included) with a trailing newline", async () => {
      await createDoc(wikiDir, "made/fresh.md", "# Fresh");
      const content = await readFile(path.join(wikiDir, "made", "fresh.md"), "utf8");
      assert.equal(content, "# Fresh\n");
    });

    it("refuses to overwrite an existing file, without tool names", async () => {
      await assert.rejects(
        () => createDoc(wikiDir, "notes.md", "clobber"),
        (err: Error) => {
          assert.match(err.message, /"notes\.md" already exists/);
          // Surface-neutral: the same message reaches the voice model and
          // the CLI model, whose edit tools have different names.
          assert.doesNotMatch(err.message, /edit_doc|edit_artifact/);
          return true;
        }
      );
      // The refused write must not have touched the file.
      const content = await readFile(path.join(wikiDir, "notes.md"), "utf8");
      assert.doesNotMatch(content, /clobber/);
    });

    it("rejects empty content instead of writing a lone newline", async () => {
      await assert.rejects(
        () => createDoc(wikiDir, "made/blank.md", ""),
        /empty content/
      );
      assert.equal(existsSync(path.join(wikiDir, "made", "blank.md")), false);
    });

    it("rejects unsupported extensions, listing the supported ones", async () => {
      await assert.rejects(
        () => createDoc(wikiDir, "script.sh", "#!/bin/sh\n"),
        /supported types: .*\.md/
      );
    });
  });

  describe(".oui validation (parse at the write boundary)", () => {
    // The real failure this guards against: an agent hallucinating an
    // indentation-based syntax that is not OpenUI Lang at all. The parser
    // sees zero statements in it, so the artifact would render blank.
    const hallucinated = [
      "app Explainer",
      "  header Title",
      '    text "Explainer"',
    ].join("\n");
    const valid = 'main = Stack([Content("<p>hi</p>")])\n';

    it("createDoc refuses non-OpenUI-Lang .oui content and writes nothing", async () => {
      await assert.rejects(
        () => createDoc(wikiDir, "made/broken.oui", hallucinated),
        (err: Error) => {
          assert.match(err.message, /not valid OpenUI Lang/);
          // The teaching part: what the language actually looks like.
          assert.match(err.message, /name = Component\(\.\.\.\)/);
          // Surface-neutral, like the duplicate-path error.
          assert.doesNotMatch(err.message, /create_doc|create_file|edit_artifact/);
          return true;
        }
      );
      assert.equal(existsSync(path.join(wikiDir, "made", "broken.oui")), false);
    });

    it("createDoc accepts a minimal valid program", async () => {
      await createDoc(wikiDir, "made/valid.oui", valid);
      assert.equal(
        await readFile(path.join(wikiDir, "made", "valid.oui"), "utf8"),
        valid
      );
    });

    it("editDoc refuses an edit that would break the .oui, leaving it unchanged", async () => {
      // Breaking `Stack` into `Stak` makes the root statement invalid
      // (unknown component), which the parser redacts — an empty render.
      await assert.rejects(
        () => editDoc(wikiDir, "made/valid.oui", "Stack", "Stak"),
        (err: Error) => {
          assert.match(err.message, /would no longer be valid OpenUI Lang/);
          assert.match(err.message, /Stak/); // parser message names the culprit
          return true;
        }
      );
      assert.equal(
        await readFile(path.join(wikiDir, "made", "valid.oui"), "utf8"),
        valid,
        "a refused edit must not touch the file"
      );
    });

    it("editDoc still applies edits that keep the .oui valid", async () => {
      await editDoc(wikiDir, "made/valid.oui", "<p>hi</p>", "<p>bye</p>");
      assert.match(
        await readFile(path.join(wikiDir, "made", "valid.oui"), "utf8"),
        /<p>bye<\/p>/
      );
    });
  });

  describe("renameDoc", () => {
    it("moves a file to a new nested path, creating parent dirs", async () => {
      await createDoc(wikiDir, "to-move.md", "movable\n");
      await renameDoc(wikiDir, "to-move.md", "moved/into/place.md");
      assert.equal(existsSync(path.join(wikiDir, "to-move.md")), false);
      const content = await readFile(
        path.join(wikiDir, "moved", "into", "place.md"),
        "utf8"
      );
      assert.equal(content, "movable\n");
    });

    it("renames a .oui artifact", async () => {
      await createDoc(wikiDir, "board.oui", 'root = Content("<p>hi</p>")\n');
      await renameDoc(wikiDir, "board.oui", "boards/kanban.oui");
      assert.match(
        await readFile(path.join(wikiDir, "boards", "kanban.oui"), "utf8"),
        /root = Content/
      );
    });

    it("rejects a missing source with a listing hint", async () => {
      await assert.rejects(
        () => renameDoc(wikiDir, "ghost.md", "still-ghost.md"),
        /"ghost\.md" does not exist/
      );
    });

    it("refuses to overwrite an existing target and leaves both files intact", async () => {
      await createDoc(wikiDir, "clash-src.md", "source\n");
      await createDoc(wikiDir, "clash-dst.md", "target\n");
      await assert.rejects(
        () => renameDoc(wikiDir, "clash-src.md", "clash-dst.md"),
        /"clash-dst\.md" already exists/
      );
      assert.equal(await readFile(path.join(wikiDir, "clash-src.md"), "utf8"), "source\n");
      assert.equal(await readFile(path.join(wikiDir, "clash-dst.md"), "utf8"), "target\n");
    });

    it("refuses a cross-extension rename (content/type mismatch)", async () => {
      await createDoc(wikiDir, "typed.md", "prose\n");
      await assert.rejects(
        () => renameDoc(wikiDir, "typed.md", "typed.oui"),
        /must keep the file type/
      );
      assert.equal(existsSync(path.join(wikiDir, "typed.md")), true);
      assert.equal(existsSync(path.join(wikiDir, "typed.oui")), false);
    });

    it("rejects a no-op rename to the same path", async () => {
      await assert.rejects(
        () => renameDoc(wikiDir, "notes.md", "notes.md"),
        /same as the current path/
      );
      assert.equal(existsSync(path.join(wikiDir, "notes.md")), true);
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

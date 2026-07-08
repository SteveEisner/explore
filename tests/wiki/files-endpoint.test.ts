import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { startApp, type TestApp } from "../helpers/app.js";

/**
 * The Wiki API list endpoint: GET /api/wiki/files, the home view's source
 * for the folder listing. These tests hit the real served endpoint and prove
 * it returns every visible file with path/size/mtime metadata, hides
 * dot-entries, and reads the disk fresh on every request (a file created
 * after startup appears without a restart).
 */

const SEED = {
  "README.md": "# Front page\n",
  "guide.md": "# Guide\n",
  "notes/deep.oui": "root = Stack([])\n",
  ".vault-index.json": "{}", // internal dot-entry: must not be listed
};

interface ListedFile {
  path: string;
  size: number;
  modified: string;
}

describe("GET /api/wiki/files", () => {
  let app: TestApp;
  before(async () => {
    app = await startApp(SEED);
  });
  after(async () => {
    await app.close();
  });

  async function fetchListing(): Promise<{
    files: ListedFile[];
    contentType: string;
  }> {
    const res = await fetch(`${app.baseUrl}/api/wiki/files`);
    assert.equal(res.status, 200);
    return {
      files: (await res.json()) as ListedFile[],
      contentType: res.headers.get("content-type") ?? "",
    };
  }

  it("returns every visible file as JSON with path, size, and mtime", async () => {
    const { files, contentType } = await fetchListing();

    assert.match(contentType, /application\/json/);
    // Paths are wiki-relative with forward slashes — the same form the
    // /docs/<path> URLs are built from — sorted by name at each level.
    assert.deepEqual(
      files.map((f) => f.path),
      ["README.md", "guide.md", "notes/deep.oui"]
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

  it("hides dot-entries from the listing", async () => {
    const { files } = await fetchListing();
    assert.ok(
      files.every((f) => !f.path.startsWith(".")),
      "internal dotfile leaked into the listing"
    );
  });

  it("reflects files created after startup (no caching)", async () => {
    await writeFile(path.join(app.wikiDir, "later.md"), "# Later\n", "utf8");
    const { files } = await fetchListing();
    assert.ok(
      files.some((f) => f.path === "later.md"),
      "file created after startup missing from the listing"
    );
  });
});

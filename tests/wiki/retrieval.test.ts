import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startApp, type TestApp } from "../helpers/app.js";

/**
 * Retrieval surface of the wiki: files are web-served verbatim at
 * /docs/<path> by the real server. These tests prove the read contract the
 * viewer depends on — exact bytes back, viewer-meaningful MIME types, plain
 * 404s (no SPA fallback), and no path that reaches outside the wiki root.
 */

const SEED = {
  "guide.md": "# Guide\n\nBody text.\n",
  "artifact.oui": 'root = Stack([intro])\nintro = Content("<h1>Hi</h1>")\n',
  "notes/nested.md": "nested note\n",
};

describe("wiki retrieval over /docs/", () => {
  let app: TestApp;
  before(async () => {
    app = await startApp(SEED);
  });
  after(() => app.close());

  it("serves a wiki file's exact contents", async () => {
    // Verbatim serving: the viewer renders exactly what is on disk.
    const res = await fetch(`${app.baseUrl}/docs/guide.md`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), SEED["guide.md"]);
  });

  it("serves files in nested wiki directories", async () => {
    const res = await fetch(`${app.baseUrl}/docs/notes/nested.md`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), SEED["notes/nested.md"]);
  });

  it("labels markdown and .oui with viewer-meaningful content types", async () => {
    // FileViewer picks a renderer by extension/content-type; both file
    // kinds must arrive as text the browser will not download or reinterpret.
    const md = await fetch(`${app.baseUrl}/docs/guide.md`);
    assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8");
    const oui = await fetch(`${app.baseUrl}/docs/artifact.oui`);
    assert.equal(oui.headers.get("content-type"), "text/plain; charset=utf-8");
  });

  it("answers a missing file with a plain 404, not the SPA page", async () => {
    // The /docs/ mount must not fall back to index.html the way app routes
    // do — the viewer treats any 200 as file content.
    const res = await fetch(`${app.baseUrl}/docs/absent.md`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /not found/);
  });

  it("answers a directory path with 404 (directories are not content)", async () => {
    const res = await fetch(`${app.baseUrl}/docs/notes`);
    assert.equal(res.status, 404);
  });

  for (const traversal of [
    "/docs/../package.json",
    "/docs/%2e%2e/package.json",
    "/docs/..%2Fpackage.json",
  ]) {
    it(`refuses path traversal: ${traversal}`, async () => {
      // Escaping the wiki root must fail; the repo's package.json (a file
      // that certainly exists above the temp wiki) must never be readable
      // through the wiki mount. Raw http.request bypasses fetch's URL
      // normalization so the server sees the hostile path itself.
      const res = await rawGet(app.baseUrl, traversal);
      assert.notEqual(res.status, 200);
      assert.ok(
        !res.body.includes('"workspaces"'),
        `traversal leaked package.json: ${res.body.slice(0, 200)}`
      );
    });
  }
});

/** GET with the path sent as-is (fetch would collapse ".." before sending). */
function rawGet(
  baseUrl: string,
  rawPath: string
): Promise<{ status: number; body: string }> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    http
      .get({ hostname, port, path: rawPath }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

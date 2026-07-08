import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startApp, type AppSocket, type TestApp } from "../helpers/app.js";

/**
 * The artifact:edit websocket command (the LLM's `edit_artifact` tool):
 * merges an OpenUI Lang patch into an existing wiki .oui file by statement
 * name — replace / append / garbage-collect, the panel's edit-mode
 * semantics — and writes it back. These tests prove the merge semantics on
 * disk, the viewer-notification chain (wiki:changed), and that invalid
 * targets are refused with the wiki left untouched.
 */

const ORIGINAL = [
  "root = Stack([intro, middle, outro])",
  'intro = Content("<h1>Intro</h1>")',
  'middle = Content("<p>Middle stays.</p>")',
  'outro = Content("<p>Outro.</p>")',
].join("\n");

const SEED = {
  "report.oui": ORIGINAL,
  "notes/nested.oui": ORIGINAL,
  "page.md": "# Not an artifact\n",
};

let commandSeq = 0;

/** Send artifact:edit and return the matching artifact:edited answer. */
async function editArtifact(
  socket: AppSocket,
  args: { file: string; spec: string }
): Promise<{ url?: string; error?: string }> {
  const id = `test-edit-${commandSeq++}`;
  socket.send({ type: "artifact:edit", id, ...args });
  return socket.next(
    (event) => event.type === "artifact:edited" && event.id === id,
    { description: `artifact:edited answer for ${id}` }
  ) as Promise<{ url?: string; error?: string }>;
}

describe("artifact:edit (the edit_artifact tool's write path)", () => {
  let app: TestApp;
  let socket: AppSocket;
  before(async () => {
    app = await startApp(SEED);
    socket = await app.connect();
  });
  after(async () => {
    await app.close();
  });

  it("replaces a statement by name, leaving the rest untouched", async () => {
    const reply = await editArtifact(socket, {
      file: "report.oui",
      spec: 'middle = Content("<p>EDITED.</p>")',
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.url, "/docs/report.oui");

    const merged = await readFile(path.join(app.wikiDir, "report.oui"), "utf8");
    assert.match(merged, /EDITED/);
    assert.doesNotMatch(merged, /Middle stays/);
    // Untouched statements survive verbatim.
    assert.match(merged, /<h1>Intro<\/h1>/);
    assert.match(merged, /<p>Outro\.<\/p>/);
  });

  it("garbage-collects statements dropped from the root (delete semantics)", async () => {
    const reply = await editArtifact(socket, {
      file: "report.oui",
      spec: "root = Stack([intro, outro])",
    });
    assert.equal(reply.error, undefined);

    const merged = await readFile(path.join(app.wikiDir, "report.oui"), "utf8");
    // `middle` is unreachable from the new root, so it must be gone.
    assert.doesNotMatch(merged, /middle/);
    assert.match(merged, /intro/);
  });

  it("accepts the /docs/<path> URL form and nested paths", async () => {
    const reply = await editArtifact(socket, {
      file: "/docs/notes/nested.oui",
      spec: 'outro = Content("<p>Nested edit.</p>")',
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.url, "/docs/notes/nested.oui");

    const merged = await readFile(
      path.join(app.wikiDir, "notes/nested.oui"),
      "utf8"
    );
    assert.match(merged, /Nested edit/);
  });

  it("broadcasts wiki:changed so viewers hot-reload the edited file", async () => {
    const viewer = await app.connect();
    const reply = await editArtifact(socket, {
      file: "report.oui",
      spec: 'intro = Content("<h1>Reloaded</h1>")',
    });
    assert.equal(reply.error, undefined);
    const changed = await viewer.next(
      (event) =>
        event.type === "wiki:changed" && event.url === "/docs/report.oui",
      { description: "wiki:changed for the edited file" }
    );
    assert.equal(changed.url, "/docs/report.oui");
  });

  it("refuses invalid targets and leaves the wiki untouched", async () => {
    const before = await readFile(path.join(app.wikiDir, "page.md"), "utf8");
    const cases: Array<{ file: string; why: string }> = [
      { file: "missing.oui", why: "nonexistent file" },
      { file: "page.md", why: "not a .oui file" },
      { file: "../escape.oui", why: "traversal" },
      { file: "/etc/passwd.oui", why: "absolute-looking path" },
      { file: ".hidden.oui", why: "hidden file" },
    ];
    for (const { file, why } of cases) {
      const reply = await editArtifact(socket, {
        file,
        spec: 'x = Content("<p>nope</p>")',
      });
      assert.ok(reply.error, `${why} must be refused`);
      assert.equal(reply.url, undefined, `${why} must not report success`);
    }
    assert.equal(
      await readFile(path.join(app.wikiDir, "page.md"), "utf8"),
      before,
      "non-artifact file was modified by a refused edit"
    );
  });

  it("refuses an empty spec", async () => {
    const reply = await editArtifact(socket, { file: "report.oui", spec: "  " });
    assert.ok(reply.error);
  });
});

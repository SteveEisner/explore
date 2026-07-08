import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import {
  saveArtifact,
  startApp,
  type AppSocket,
  type TestApp,
} from "../helpers/app.js";

/**
 * Creation and edit surface of the wiki: the `artifact:save` websocket
 * command (the app's only write path into the wiki, used by the toolbar's
 * Save button). These tests prove the write contract end to end through the
 * real server: a save is immediately retrievable at its /docs/ URL, names
 * are normalized to a single safe `<name>.oui` path segment, existing files
 * are protected unless the caller explicitly overwrites, and every rejected
 * save leaves the wiki untouched.
 */

const EXISTING_SPEC = 'root = Stack([a])\na = Content("<p>original</p>")\n';

describe("artifact:save over the websocket", () => {
  let app: TestApp;
  let socket: AppSocket;
  before(async () => {
    app = await startApp({ "existing.oui": EXISTING_SPEC });
    socket = await app.connect();
  });
  after(() => app.close());

  it("creates <name>.oui and the file is immediately retrievable", async () => {
    const spec = 'root = Stack([hello])\nhello = Content("<h1>Hi</h1>")';
    const answer = await saveArtifact(socket, { name: "fresh", spec });

    assert.equal(answer.error, undefined);
    assert.equal(answer.url, "/docs/fresh.oui");
    // Round trip through retrieval: what was saved is what the viewer loads
    // (modulo the newline the writer guarantees at end-of-file).
    const res = await fetch(`${app.baseUrl}${answer.url}`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), `${spec}\n`);
  });

  it("normalizes the extension: at most one .oui, lowercased", async () => {
    // Users may type the extension themselves, in any case; the wiki must
    // never end up with "name.oui.oui" or a case-variant extension.
    const typed = await saveArtifact(socket, {
      name: "typed-extension.oui",
      spec: "root = Stack([])",
    });
    assert.equal(typed.url, "/docs/typed-extension.oui");
    const shouted = await saveArtifact(socket, {
      name: "Shouted.OUI",
      spec: "root = Stack([])",
    });
    assert.equal(shouted.url, "/docs/Shouted.oui");
  });

  it("refuses to overwrite an existing artifact by default", async () => {
    const answer = await saveArtifact(socket, {
      name: "existing",
      spec: "root = Stack([])",
    });

    assert.equal(answer.url, undefined);
    assert.match(String(answer.error), /already exists/);
    // The refused save must not have touched the file.
    const res = await fetch(`${app.baseUrl}/docs/existing.oui`);
    assert.equal(await res.text(), EXISTING_SPEC);
  });

  it("replaces an existing artifact when overwrite is set (re-save flow)", async () => {
    // The client sets overwrite only when re-saving the artifact it loaded
    // from this very file; the server then replaces the content in place.
    const spec = 'root = Stack([a])\na = Content("<p>edited</p>")';
    const answer = await saveArtifact(socket, {
      name: "existing",
      spec,
      overwrite: true,
    });

    assert.equal(answer.url, "/docs/existing.oui");
    const res = await fetch(`${app.baseUrl}/docs/existing.oui`);
    assert.equal(await res.text(), `${spec}\n`);
  });

  // Every hostile or meaningless save must be answered with an error AND
  // leave the wiki byte-for-byte alone — especially names that try to
  // address files outside the wiki root.
  const rejected: Array<{ label: string; name: string; spec?: string }> = [
    { label: "path traversal", name: "../escape" },
    { label: "nested path (no directories via save)", name: "notes/inner" },
    { label: "backslash path", name: "notes\\inner" },
    { label: "hidden-file name", name: ".sneaky" },
    { label: "empty name", name: "" },
    { label: "whitespace-only name", name: "   " },
    { label: "trailing-dot name", name: "dangling." },
    { label: "empty spec", name: "valid-name", spec: "   " },
  ];
  for (const { label, name, spec } of rejected) {
    it(`rejects without writing: ${label}`, async () => {
      const filesBefore = await wikiListing(app);

      const answer = await saveArtifact(socket, {
        name,
        spec: spec ?? "root = Stack([])",
      });

      assert.equal(answer.url, undefined);
      assert.ok(answer.error, "expected an error answer");
      assert.deepEqual(await wikiListing(app), filesBefore);
    });
  }

  it("answers only the saving client; others are not interrupted", async () => {
    // Saves are a private command/answer exchange: a second connected
    // browser must not receive this client's artifact:saved event (it
    // learns about the new file from the wiki watcher instead).
    const bystander = await app.connect();
    const answer = await saveArtifact(socket, {
      name: "private-answer",
      spec: "root = Stack([])",
    });
    assert.equal(answer.url, "/docs/private-answer.oui");
    await bystander.expectSilence((e) => e.type === "artifact:saved", {
      description: "artifact:saved leaked to a non-requesting client",
    });
  });
});

/** Recursive wiki listing used to prove "nothing was written anywhere". */
async function wikiListing(app: TestApp): Promise<string[]> {
  const entries = await readdir(app.wikiDir, { recursive: true });
  return entries.sort();
}

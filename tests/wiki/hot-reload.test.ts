import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  saveArtifact,
  startApp,
  type AppSocket,
  type ServerEvent,
  type TestApp,
} from "../helpers/app.js";

/**
 * Edit-notification surface of the wiki: any on-disk change (LLM vault
 * edits, artifact saves, external editors) must reach connected clients as
 * a `wiki:changed` broadcast so the content pane can live-reload the file
 * it is showing. These tests drive the real watcher through real file
 * writes and prove the broadcast fires once per change burst, names the
 * changed file's /docs/ URL, and ignores hidden files.
 *
 * The watcher debounces 150ms per file; expectations use windows well past
 * that so slow CI filesystems don't flake.
 */

const SEED = {
  "guide.md": "original\n",
  "notes/seed.md": "keeps the nested directory present in the seed\n",
};

const changed =
  (url: string) =>
  (event: ServerEvent): boolean =>
    event.type === "wiki:changed" && event.url === url;

describe("wiki hot-reload notifications", () => {
  let app: TestApp;
  let socket: AppSocket;
  before(async () => {
    app = await startApp(SEED);
    socket = await app.connect();
  });
  after(() => app.close());

  it("broadcasts wiki:changed when an existing file is edited on disk", async () => {
    await writeFile(path.join(app.wikiDir, "guide.md"), "edited\n");
    const event = await socket.next(changed("/docs/guide.md"), {
      description: "wiki:changed for /docs/guide.md",
    });
    assert.equal(event.url, "/docs/guide.md");
  });

  it("broadcasts wiki:changed for a newly created nested file", async () => {
    // New files matter as much as edits: the LLM creates wiki pages, and
    // the URL must carry the full nested path the viewer would load.
    await writeFile(path.join(app.wikiDir, "notes/new.md"), "brand new\n");
    await socket.next(changed("/docs/notes/new.md"), {
      description: "wiki:changed for /docs/notes/new.md",
    });
  });

  it("collapses a burst of writes to one notification per file", async () => {
    // Editors and streamed writes save in bursts; the viewer should reload
    // once, not once per flush. Three quick writes → exactly one event.
    const file = path.join(app.wikiDir, "guide.md");
    for (const body of ["burst 1\n", "burst 2\n", "burst 3\n"]) {
      await writeFile(file, body);
    }
    await socket.next(changed("/docs/guide.md"), {
      description: "debounced wiki:changed for the burst",
    });
    await socket.expectSilence(changed("/docs/guide.md"), {
      description: "second wiki:changed for one write burst",
    });
  });

  it("stays silent for hidden files (vault index, editor swap files)", async () => {
    await writeFile(path.join(app.wikiDir, ".scratch.md"), "internal\n");
    await socket.expectSilence(
      (e) => e.type === "wiki:changed" && String(e.url).includes("scratch"),
      { description: "wiki:changed for a dotfile" }
    );
  });

  it("notifies other clients when an artifact is saved through the app", async () => {
    // The save→reload chain across two browsers: client A saves via
    // artifact:save, client B (which gets no artifact:saved answer) still
    // learns about the new file from the watcher and can refresh its view.
    const saver = await app.connect();
    const answer = await saveArtifact(saver, {
      name: "broadcast-me",
      spec: "root = Stack([])",
    });
    assert.equal(answer.url, "/docs/broadcast-me.oui");
    await socket.next(changed("/docs/broadcast-me.oui"), {
      description: "wiki:changed after artifact:save",
    });
  });
});

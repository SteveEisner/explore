import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startApp, type TestApp, type AppSocket } from "../helpers/app.js";

/**
 * The voice:tool websocket bridge (voice row 3), exercised over the real
 * server: the browser's voice session sends tool calls as ws commands and
 * must get a correlated voice:tool-result back — success and teaching-error
 * alike — while every client's transcript sees the chat:tool markers and
 * voice:transcript utterances (row 8). Also covers the /api/voice/session
 * endpoint's no-key refusal, the one case that needs no OpenAI account.
 */

let commandSeq = 0;

/** One voice:tool round trip, correlated by id. */
async function callTool(
  socket: AppSocket,
  name: string,
  args: Record<string, unknown>
) {
  const id = `voice-test-${commandSeq++}`;
  socket.send({ type: "voice:tool", id, name, args });
  return socket.next(
    (event) => event.type === "voice:tool-result" && event.id === id,
    { description: `voice:tool-result for ${name}` }
  );
}

describe("voice:tool bridge", () => {
  let app: TestApp;
  let socket: AppSocket;

  before(async () => {
    app = await startApp(
      {
        "guide.md": "# Guide\nAlpha step one.\nAlpha step two.\n",
        "board.oui": 'root = Stack(children=[hello])\nhello = Text(text="hi")\n',
      },
      // Mask the developer's real key (.env.local): these tests must never
      // mint a paid session, and the no-key refusal path needs no key.
      { OPENAI_API_KEY: "" }
    );
    socket = await app.connect();
  });

  after(async () => {
    await app.close();
  });

  it("answers read_doc with the file's lines and total", async () => {
    const reply = await callTool(socket, "read_doc", { path: "guide.md" });
    assert.equal(reply.error, undefined);
    const slice = JSON.parse(reply.result as string);
    assert.equal(slice.totalLines, 3);
    assert.match(slice.lines, /Alpha step one\./);
  });

  it("answers search_docs with paths and line numbers", async () => {
    const reply = await callTool(socket, "search_docs", { query: "alpha step" });
    const { matches } = JSON.parse(reply.result as string);
    assert.deepEqual(
      matches.map((m: { path: string; line: number }) => [m.path, m.line]),
      [
        ["guide.md", 2],
        ["guide.md", 3],
      ]
    );
  });

  it("edit_doc writes through to the wiki file", async () => {
    const reply = await callTool(socket, "edit_doc", {
      path: "guide.md",
      old_text: "Alpha step one.",
      new_text: "Alpha step ONE (edited by voice).",
    });
    assert.equal(reply.error, undefined);
    const content = await readFile(path.join(app.wikiDir, "guide.md"), "utf8");
    assert.match(content, /edited by voice/);
  });

  it("edit_artifact merges statements into the saved .oui", async () => {
    const reply = await callTool(socket, "edit_artifact", {
      file: "/docs/board.oui",
      spec: 'hello = Text(text="hello again")',
    });
    assert.equal(reply.error, undefined);
    const content = await readFile(path.join(app.wikiDir, "board.oui"), "utf8");
    assert.match(content, /hello again/);
    // Merge, not append: the old statement body is replaced.
    assert.doesNotMatch(content, /text="hi"/);
  });

  it("returns teaching errors, not silence, for bad calls", async () => {
    const unknown = await callTool(socket, "no_such_tool", {});
    assert.match(unknown.error as string, /unknown voice tool/);

    const badArgs = await callTool(socket, "read_doc", {});
    assert.match(badArgs.error as string, /invalid arguments for read_doc/);

    const traversal = await callTool(socket, "read_doc", {
      path: "../../etc/passwd",
    });
    assert.match(traversal.error as string, /invalid path/);

    const noMatch = await callTool(socket, "edit_doc", {
      path: "guide.md",
      old_text: "text that is not there",
      new_text: "x",
    });
    assert.match(noMatch.error as string, /no match/);
  });

  it("broadcasts chat:tool markers so other clients see voice activity", async () => {
    const observer = await app.connect();
    const reply = callTool(socket, "read_doc", { path: "guide.md" });
    const marker = await observer.next(
      (event) => event.type === "chat:tool" && event.name === "voice:read_doc",
      { description: "voice tool marker on another client" }
    );
    assert.equal(marker.phase, "use");
    await reply;
  });

  it("folds voice transcripts into every client's chat as via-voice messages", async () => {
    const observer = await app.connect();
    socket.send({
      type: "voice:transcript",
      role: "user",
      text: "make the title bigger",
    });
    const message = await observer.next(
      (event) => event.type === "chat:message" && event.via === "voice",
      { description: "voice transcript broadcast" }
    );
    assert.equal(message.role, "user");
    assert.equal(message.text, "make the title bigger");
  });

  it("refuses to mint a voice session without OPENAI_API_KEY", async () => {
    // The harness forced the key empty, so the endpoint must refuse with
    // the configuration hint instead of contacting OpenAI at all.
    const res = await fetch(`${app.baseUrl}/api/voice/session`, {
      method: "POST",
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /OPENAI_API_KEY/);
  });

  it("rejects non-POST voice session requests", async () => {
    const res = await fetch(`${app.baseUrl}/api/voice/session`);
    assert.equal(res.status, 405);
  });
});

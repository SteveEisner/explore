import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { startApp, type AppSocket, type TestApp } from "../helpers/app.js";

/**
 * The ui MCP server's dial-back chain (server/src/ui-mcp.ts): the Claude CLI
 * spawns ui-mcp as a stdio MCP server per session, and each state /
 * set_state / edit_artifact tool call dials the app server back over
 * `ws://localhost:$PORT/ws` — state exchanges are relayed onward to browser
 * clients, artifact edits are answered by the back end itself.
 *
 * These tests spawn the *real* ui-mcp.ts exactly as production does (tsx +
 * a PORT env var, mirroring ClaudeSession.writeMcpConfig) and drive it over
 * MCP stdio, against the real app server on an ephemeral port. No LLM is
 * involved: the tests play the CLI's role (MCP client) and the browser's
 * role (websocket client answering state:update / state:request).
 *
 * Regression under guard: the app server binds PORT=0 (ephemeral) in tests
 * and side instances, and ui-mcp used to inherit that literal "0" and fail
 * silently. The fix threads the *bound* port via claude.appPort into the
 * MCP config (server/src/index.ts, claude.ts). A wrong port must therefore
 * fail LOUDLY (isError result naming the failure), and the right port must
 * round-trip end to end.
 */

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const uiMcpEntry = path.join(repoRoot, "server/src/ui-mcp.ts");

/** One MCP tool result, reduced to what the CLI (and the model) would see. */
interface ToolOutcome {
  isError: boolean;
  /** All text content joined — error messages or the tool's reply. */
  text: string;
}

/** The spawned ui-mcp stdio server plus the client driving it. */
interface UiMcp {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
  close(): Promise<void>;
}

/**
 * Spawn server/src/ui-mcp.ts over stdio with the given PORT — the same
 * command (tsx + source file) and the same env contract that
 * ClaudeSession.writeMcpConfig hands the CLI, so the dial-back code under
 * test is byte-identical to production.
 */
async function startUiMcp(port: string): Promise<UiMcp> {
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: [uiMcpEntry],
    // The CLI merges the config's env into a default environment; mirror
    // that so tsx can find PATH/HOME while PORT stays under test control.
    env: { ...getDefaultEnvironment(), PORT: port },
  });
  const client = new Client({ name: "dialback-test", version: "0.0.0" });
  await client.connect(transport);
  return {
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }>;
      return {
        isError: result.isError === true,
        text: content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n"),
      };
    },
    async close() {
      await client.close();
    },
  };
}

/**
 * Play the browser's half of one state exchange: await the forwarded
 * state:update on `browser`, assert its payload, and answer with a
 * state:response echoing the applied store — what client/src does after
 * writing the D3 store.
 */
async function answerStateUpdate(
  browser: AppSocket,
  expectedUpdates: Record<string, unknown>,
  appliedStore: Record<string, unknown>
): Promise<void> {
  const forwarded = await browser.next(
    (event) => event.type === "state:update",
    { description: "state:update forwarded to the browser" }
  );
  assert.deepEqual(
    forwarded.updates,
    expectedUpdates,
    "browser must receive exactly the updates the MCP tool sent"
  );
  browser.send({
    type: "state:response",
    id: forwarded.id,
    state: { stateStore: appliedStore },
  });
}

const ORIGINAL_OUI = [
  "root = Stack([intro, body])",
  'intro = Content("<h1>Intro</h1>")',
  'body = Content("<p>Original body.</p>")',
].join("\n");

describe("ui MCP dial-back chain (state / set_state / edit_artifact)", () => {
  let app: TestApp;
  let mcp: UiMcp;
  before(async () => {
    app = await startApp({ "report.oui": ORIGINAL_OUI });
    mcp = await startUiMcp(new URL(app.baseUrl).port);
  });
  after(async () => {
    await mcp.close();
    await app.close();
  });

  it("set_state round-trips: MCP → server → browser store update → tool reply", async () => {
    const browser = await app.connect();
    const updates = { "app/chat-open": true, "app/context-level": 2 };

    const pendingCall = mcp.callTool("set_state", { updates });
    await answerStateUpdate(browser, updates, {
      "app/chat-open": true,
      "app/context-level": 2,
    });

    const outcome = await pendingCall;
    assert.equal(outcome.isError, false, `set_state failed: ${outcome.text}`);
    // The tool reports the applied store back to the model.
    assert.match(outcome.text, /app\/chat-open/);
    assert.match(outcome.text, /app\/context-level/);
    browser.close();
  });

  it("state round-trips the browser's snapshot back to the tool", async () => {
    const browser = await app.connect();

    const pendingCall = mcp.callTool("state", {});
    const forwarded = await browser.next(
      (event) => event.type === "state:request",
      { description: "state:request forwarded to the browser" }
    );
    browser.send({
      type: "state:response",
      id: forwarded.id,
      state: { view: { kind: "doc", url: "/docs/report.oui" } },
    });

    const outcome = await pendingCall;
    assert.equal(outcome.isError, false, `state failed: ${outcome.text}`);
    assert.match(outcome.text, /\/docs\/report\.oui/);
    browser.close();
  });

  it("edit_artifact reaches the wiki write path and notifies viewers", async () => {
    const viewer = await app.connect();

    const outcome = await mcp.callTool("edit_artifact", {
      file: "report.oui",
      spec: 'body = Content("<p>Edited via MCP.</p>")',
    });
    assert.equal(outcome.isError, false, `edit failed: ${outcome.text}`);
    assert.match(outcome.text, /Edited \/docs\/report\.oui/);

    const merged = await readFile(path.join(app.wikiDir, "report.oui"), "utf8");
    assert.match(merged, /Edited via MCP/);
    assert.doesNotMatch(merged, /Original body/);

    // Viewers learn about the edit through the wiki:changed broadcast.
    await viewer.next(
      (event) =>
        event.type === "wiki:changed" && event.url === "/docs/report.oui",
      { description: "wiki:changed for the MCP-edited file" }
    );
    viewer.close();
  });

  it("set_state fails loudly (not silently) when no browser is connected", async () => {
    // Only the MCP tool's own short-lived connection exists here; the server
    // must answer with an explicit error, and the tool must surface it.
    const outcome = await mcp.callTool("set_state", {
      updates: { "app/chat-open": false },
    });
    assert.equal(outcome.isError, true, "must be an error result");
    assert.match(outcome.text, /no front-end client is connected/);
  });
});

describe("ui MCP dial-back with a wrong port (the PORT=0 regression)", () => {
  // The historical bug: the app binds PORT=0 (ephemeral), ui-mcp inherits
  // the literal "0", dials ws://localhost:0, and every tool silently no-ops.
  // The chain must instead surface a loud error to the CLI/model.
  let app: TestApp;
  let mcp: UiMcp;
  before(async () => {
    app = await startApp({ "report.oui": ORIGINAL_OUI });
    mcp = await startUiMcp("0");
  });
  after(async () => {
    await mcp.close();
    await app.close();
  });

  it("set_state surfaces a connection error instead of silent success", async () => {
    const browser = await app.connect();

    const outcome = await mcp.callTool("set_state", {
      updates: { "app/chat-open": true },
    });
    assert.equal(outcome.isError, true, "must be an error result");
    assert.match(outcome.text, /state update failed:/);

    // The real server (on its actual port) must have seen nothing.
    await browser.expectSilence((event) => event.type === "state:update", {
      description: "state:update reached the app despite the wrong port",
    });
    browser.close();
  });

  it("edit_artifact surfaces a connection error and leaves the wiki untouched", async () => {
    const outcome = await mcp.callTool("edit_artifact", {
      file: "report.oui",
      spec: 'body = Content("<p>must not land</p>")',
    });
    assert.equal(outcome.isError, true, "must be an error result");
    assert.match(outcome.text, /edit failed:/);

    const content = await readFile(
      path.join(app.wikiDir, "report.oui"),
      "utf8"
    );
    assert.equal(content, ORIGINAL_OUI, "wiki file must be untouched");
  });
});

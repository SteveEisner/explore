import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import WebSocket from "ws";
import { z } from "zod";

/**
 * Standalone MCP stdio server exposing the `ui` tool to the Claude CLI.
 *
 * The tool itself is a no-op acknowledgement: the UI reaches the front end
 * by streaming — the back end watches the CLI's partial tool-call tokens
 * and forwards them over the websocket as ui:* events, so the panel updates
 * while the model is still writing the spec.
 */
const server = new McpServer({ name: "ui", version: "0.1.0" });

server.registerTool(
  "ui",
  {
    description:
      "Render or update the UI shown in the main panel of the user's app. " +
      "Pass an OpenUI Lang program (or an edit-mode patch of changed " +
      "statements) as `spec`. The language and available components are " +
      "documented in your system prompt under '# The ui tool'.",
    inputSchema: {
      spec: z
        .string()
        .describe("OpenUI Lang statements (full program or edit patch)"),
      name: z
        .string()
        .optional()
        .describe(
          "Default save filename for the artifact: short, kebab-case, no " +
            "extension (e.g. 'auth-flow-explainer'). Supply it when creating " +
            "a new artifact (a full program); omit it on edit patches."
        ),
    },
  },
  async ({ spec }) => {
    // Flavor for the acknowledgement only: non-empty lines approximate
    // statements (nothing here parses the spec — see the header; the back
    // end streams the real spec to the front end from the tool-call tokens).
    const statements = spec
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
    return {
      content: [
        {
          type: "text",
          text: `UI updated (${statements} statement${statements === 1 ? "" : "s"} applied).`,
        },
      ],
    };
  }
);

server.registerTool(
  "state",
  {
    description:
      "Inspect what the user currently sees in the app: the open document " +
      "(or authoring-mode program), any text selection in the main panel, " +
      "pointer position, scroll position, viewport, and panel states. Set " +
      "`screenshot: true` to also receive a screenshot of the main window. " +
      "Call this whenever you need context about what the user is looking " +
      "at or referring to.",
    inputSchema: {
      screenshot: z
        .boolean()
        .optional()
        .describe("Also capture a screenshot of the main window"),
    },
  },
  async ({ screenshot }) => {
    const reply = await serverExchange(
      { type: "state:request", screenshot: screenshot === true },
      "state:response"
    );
    if (reply.error) {
      return {
        content: [
          { type: "text", text: `front-end state unavailable: ${reply.error}` },
        ],
        isError: true,
      };
    }
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    > = [{ type: "text", text: JSON.stringify(reply.state, null, 1) }];
    const image = parseDataUrl(reply.screenshot);
    if (image) {
      content.push({ type: "image", data: image.data, mimeType: image.mimeType });
    }
    return { content };
  }
);

server.registerTool(
  "set_state",
  {
    description:
      "Update the front end's shared state store — the same hierarchical " +
      "key-value store the app's own controls read and write — so the " +
      "change applies instantly, exactly as if the user did it. Pass " +
      "`updates` mapping keys to new values (null deletes a key). App " +
      "keys: 'app/view' — what the main panel shows: {kind:'doc', url:" +
      "'/docs/<path>'} opens a wiki file (a plain '/docs/<path>' string " +
      "also works), {kind:'home'} the wiki folder view, " +
      "{kind:'authoring'} the generative-UI panel; " +
      "'app/context-level' (integer) — the active context level gating " +
      "context-aware artifact components; 'app/artifact-name' (string) — " +
      "the filename the authoring panel's artifact saves under; " +
      "'app/chat-open' and 'app/draw-mode' (booleans); 'app/indicate' — " +
      "point at on-screen content: the app scrolls it into view (if " +
      "needed) and blinks it. Value is one of {lines:{start,end}} " +
      "(markdown source lines of the open document, 1-based), " +
      "{statement:'name'} (an OpenUI statement in the rendered artifact), " +
      "or {text:'snippet'} (first occurrence, case-insensitive); write it " +
      "again to blink again; 'app/expanded-artifact' — expands an artifact " +
      "full-screen over the content panel (the document view stays open " +
      "underneath): a wiki .oui URL ('/docs/<path>'), or {doc:'/docs/" +
      "<page>.md', line:N} for the inline ```oui block whose opening fence " +
      "is at that 1-based source line; null minimizes " +
      "back to the document. Artifact keys: a " +
      "Tabs/Gallery " +
      "component's active item lives under its stateKey prop, or " +
      "'artifact/tabs/<statementId>' / 'artifact/gallery/<statementId>' " +
      "by default; the value may be the 0-based item index or the item " +
      "label, and the artifact's declared keys (with descriptions) appear " +
      "under 'artifact/manifest'. Call the `state` tool first to see " +
      "every current key and value under `stateStore`.",
    inputSchema: {
      updates: z
        .record(z.string(), z.unknown())
        .describe("State-store key → new value; null deletes the key"),
    },
  },
  async ({ updates }) => {
    const reply = await serverExchange(
      { type: "state:update", updates },
      "state:response"
    );
    if (reply.error) {
      return {
        content: [
          { type: "text", text: `state update failed: ${reply.error}` },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(reply.state, null, 1) }],
    };
  }
);

server.registerTool(
  "edit_artifact",
  {
    description:
      "Edit a saved wiki artifact (.oui file) in place. Pass the file's " +
      "wiki path (or /docs/<path> URL) and a `spec` of OpenUI Lang edit " +
      "statements — the same edit-mode semantics as the ui tool: same " +
      "statement name replaces, new name appends, statements unreachable " +
      "from root are dropped; send a full program with a new root to " +
      "replace everything. The file is updated on disk and anyone viewing " +
      "it sees the change immediately. Use the ui tool for the main " +
      "panel's artifact; use this for .oui files saved in the wiki. The " +
      "file must already exist — new artifacts are created by the user " +
      "saving from the panel.",
    inputSchema: {
      file: z
        .string()
        .describe("Target .oui file: wiki path or /docs/<path> URL"),
      spec: z
        .string()
        .describe("OpenUI Lang statements (edit patch or full program)"),
    },
  },
  async ({ file, spec }) => {
    const reply = await serverExchange(
      { type: "artifact:edit", file, spec },
      "artifact:edited"
    );
    if (reply.error) {
      return {
        content: [{ type: "text", text: `edit failed: ${reply.error}` }],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text", text: `Edited ${reply.url} (merged and saved).` },
      ],
    };
  }
);

/**
 * Run one command/response exchange with the back end over its websocket
 * (the only API surface): send the command with a fresh id, resolve on the
 * `replyType` event carrying the same id. state:request / state:update are
 * relayed onward to the browser; artifact:edit is answered by the back end
 * itself. One short-lived connection per request.
 */
function serverExchange(
  command: Record<string, unknown>,
  replyType: string
): Promise<{
  state?: unknown;
  screenshot?: string;
  url?: string;
  error?: string;
}> {
  const port = process.env.PORT ?? "3001";
  const id = randomUUID();
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const finish = (result: {
      state?: unknown;
      screenshot?: string;
      url?: string;
      error?: string;
    }) => {
      clearTimeout(timer);
      ws.close();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ error: "timed out waiting for the app" }),
      15_000
    );
    ws.on("open", () => ws.send(JSON.stringify({ ...command, id })));
    ws.on("message", (raw) => {
      try {
        const event = JSON.parse(raw.toString());
        if (event.type === replyType && event.id === id) finish(event);
      } catch {
        // ignore unrelated traffic (status broadcasts etc.)
      }
    });
    ws.on("error", (err) => finish({ error: String(err) }));
  });
}

function parseDataUrl(
  url: string | undefined
): { mimeType: string; data: string } | null {
  const match = url?.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

await server.connect(new StdioServerTransport());

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
    },
  },
  async ({ spec }) => {
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

await server.connect(new StdioServerTransport());

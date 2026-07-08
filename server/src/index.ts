import { createServer } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { ChatService } from "./chat.js";
import { ClaudeSession } from "./claude.js";
import { JsonlLogger } from "./logger.js";
import { createFilesHandler, createStaticHandler } from "./static.js";

const PORT = Number(process.env.PORT ?? 3001);

// Works from both src/ (tsx dev) and dist/ (compiled): ../../client/dist.
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");

// Web serving engine: the front-end application, plus the wiki (repo docs/)
// served verbatim at /docs so the viewer can load .md/.oui files directly.
const staticHandler = createStaticHandler(clientDist);
const docsHandler = createFilesHandler(
  path.resolve(import.meta.dirname, "../../docs"),
  "/docs/"
);
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/docs/")) return docsHandler(req, res);
  staticHandler(req, res);
});

// Back-end services — no public API; all communication is async over the
// websocket. The Claude session runs the CLI inside the gitignored sandbox/
// directory: the model can only touch files there (and in temp dirs); all
// other capabilities go through its MCP tools.
const claude = new ClaudeSession({
  cwd: path.resolve(import.meta.dirname, "../../sandbox"),
  dataDir: path.resolve(import.meta.dirname, "../data"),
});
// Observability: every event reaching the back end, one JSON object per line.
const logger = new JsonlLogger();
const chat = new ChatService(claude, logger);

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => chat.addClient(ws));

httpServer.listen(PORT, () => {
  logger.log("server", { type: "server:listen", port: PORT });
  console.log(`serving front end + websocket on http://localhost:${PORT}`);
  console.log(`event log: ${logger.file}`);
  if (claude.sessionId) {
    console.log(`will resume claude session ${claude.sessionId} on first chat`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    claude.stop();
    process.exit(0);
  });
}

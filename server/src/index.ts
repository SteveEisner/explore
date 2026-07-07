import { createServer } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { ChatService } from "./chat.js";
import { ClaudeSession } from "./claude.js";
import { createStaticHandler } from "./static.js";

const PORT = Number(process.env.PORT ?? 3001);

// Works from both src/ (tsx dev) and dist/ (compiled): ../../client/dist.
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");

// Web serving engine — exists only to serve the front-end application.
const httpServer = createServer(createStaticHandler(clientDist));

// Back-end services — no public API; all communication is async over the
// websocket. The Claude session runs the CLI against the repo root so the
// assistant operates on this project.
const claude = new ClaudeSession({
  cwd: path.resolve(import.meta.dirname, "../.."),
  dataDir: path.resolve(import.meta.dirname, "../data"),
});
const chat = new ChatService(claude);

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => chat.addClient(ws));

httpServer.listen(PORT, () => {
  console.log(`serving front end + websocket on http://localhost:${PORT}`);
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

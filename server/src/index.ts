import { watch } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { ChatService } from "./chat.js";
import { ClaudeSession } from "./claude.js";
import { JsonlLogger } from "./logger.js";
import { createFilesHandler, createStaticHandler } from "./static.js";
import { listWikiFiles } from "./wiki-files.js";

const PORT = Number(process.env.PORT ?? 3001);

// Every path that gives an instance its identity is env-overridable, so a
// second isolated instance (eval harness, side worker) can run alongside the
// main one without sharing its port, wiki, sandbox, session, or event log
// (EVENTS_LOG is read by JsonlLogger). Unset vars fall back to the repo's
// standard layout.
const envDir = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value ? path.resolve(value) : fallback;
};

// Works from both src/ (tsx dev) and dist/ (compiled): ../../client/dist.
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");

// The wiki: the repo's docs/ directory unless WIKI_DIR points elsewhere.
const wikiDir = envDir("WIKI_DIR", path.resolve(import.meta.dirname, "../../docs"));

// Web serving engine: the front-end application, plus the wiki served
// verbatim at /docs so the viewer can load .md/.oui files directly.
const staticHandler = createStaticHandler(clientDist);
const docsHandler = createFilesHandler(wikiDir, "/docs/");
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/docs/")) return docsHandler(req, res);
  // Wiki file inventory (the Wiki API list endpoint): the home view's
  // folder listing. Read fresh per request so it always matches the disk.
  if (req.url === "/api/wiki/files") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(listWikiFiles(wikiDir)));
    return;
  }
  staticHandler(req, res);
});

// Back-end services — no public API; all communication is async over the
// websocket. The Claude session runs the CLI inside the gitignored sandbox/
// directory: the model can only touch files there (and in temp dirs); the
// wiki and everything else go through its MCP tools.
const claude = new ClaudeSession({
  cwd: envDir("SANDBOX_DIR", path.resolve(import.meta.dirname, "../../sandbox")),
  dataDir: envDir("DATA_DIR", path.resolve(import.meta.dirname, "../data")),
  wikiDir,
  // Session knobs for the perf/cost evals; production defaults when unset.
  model: process.env.CLAUDE_MODEL,
  effort: process.env.CLAUDE_EFFORT,
  appendSystemPromptFile: process.env.APPEND_PROMPT_FILE,
});
// Observability: every event reaching the back end, one JSON object per line.
const logger = new JsonlLogger();
// WARMUP=0 disables the pre-warm turn on first client connect (tests, cost-
// sensitive experiments); anything else leaves it on.
const chat = new ChatService(claude, logger, wikiDir, process.env.WARMUP !== "0");

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => chat.addClient(ws));

// Wiki hot-reload: when a wiki file changes on disk (typically an LLM edit
// via the vault tools), tell clients so the content pane can live-reload it.
// Editors fire bursts of events per save, so debounce per file.
const wikiChangeTimers = new Map<string, NodeJS.Timeout>();
watch(wikiDir, { recursive: true }, (_eventType, filename) => {
  if (!filename) return;
  const rel = filename.split(path.sep).join("/");
  // Skip hidden files/dirs (e.g. editor swap files, .obsidian).
  if (rel.split("/").some((part) => part.startsWith("."))) return;
  clearTimeout(wikiChangeTimers.get(rel));
  wikiChangeTimers.set(
    rel,
    setTimeout(() => {
      wikiChangeTimers.delete(rel);
      chat.publish({ type: "wiki:changed", url: `/docs/${rel}` });
    }, 150)
  );
});

httpServer.listen(PORT, () => {
  // Report the *bound* port, not the configured one: PORT=0 asks the OS for
  // an ephemeral port (test harnesses and side instances), and callers learn
  // the real port only from this line / log entry.
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  // The ui MCP server dials the app back on this port; hand the CLI session
  // the bound value (under PORT=0 the env alone would say 0).
  claude.appPort = port;
  logger.log("server", { type: "server:listen", port });
  console.log(`serving front end + websocket on http://localhost:${port}`);
  console.log(`wiki: ${wikiDir}`);
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

/**
 * Agent-as-a-tool timing suite: invoke the back-end Claude session the way
 * the voice agent does — one `voice:tool` ask_artifact_agent command over
 * the websocket, no chat UI — and trace where the wall-clock goes on the
 * back end, plus what a client could have *shown* while waiting.
 *
 *   npx tsx eval/agent-timing.ts                          # fast + smart, 1 rep each
 *   npx tsx eval/agent-timing.ts --mode fast --reps 3
 *   npx tsx eval/agent-timing.ts --fast-model claude-opus-4-8   # override tier model
 *
 * Each run: spawn a fully isolated server (throwaway COPY of the fixture
 * wiki — the delegated job writes files), pre-warm like production, send the
 * ask_artifact_agent command, record every ws event, then reconstruct the
 * back-end waterfall from the server's JSONL event log:
 *
 *   send → [CLI respawn?] → init → per-API-turn message_start (model, cache)
 *        → thinking/tool_use blocks → tool results → result → tool-result ws
 *
 * Two report sections per run:
 *   a) WHERE THE TIME GOES — phase waterfall with respawn/cache-write flags.
 *   b) STREAMABILITY — what reached the client when (chat:delta / chat:tool /
 *      status), the silent gaps a user would stare at, and the earliest
 *      signals that *exist* in the CLI stream (thinking block starts, tool
 *      call starts, text deltas) that a streaming tool response could surface.
 *
 * Results: eval/results/<label>/agent-runs.jsonl + per-run events log.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_BIN = path.resolve(REPO_ROOT, "node_modules/.bin/tsx");
const SERVER_ENTRY = path.resolve(REPO_ROOT, "server/src/index.ts");
const WIKI_FIXTURE = path.resolve(import.meta.dirname, "wiki");

/**
 * The delegated job: deterministic file creation, the case reported slow.
 * Content is pinned so success is checkable and output size comparable.
 */
const CREATE_DOC_REQUEST =
  "Create a new wiki file named eval-timing-note.md with exactly this " +
  "content and nothing else:\n\n# Eval timing note\n\nHello from the " +
  "timing eval.\n\nDo not read other files first, do not build any UI, and " +
  "reply with one short sentence when done.";
const CREATED_FILE = "eval-timing-note.md";
const CREATED_MARKER = "Hello from the timing eval";

interface Flags {
  modes: Array<"fast" | "smart">;
  reps: number;
  label: string;
  timeoutMs: number;
  fastModel?: string;
  smartModel?: string;
  warm: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    modes: ["fast", "smart"],
    reps: 1,
    label: `agent-timing-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    timeoutMs: 360_000,
    warm: true,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || value === undefined) throw new Error(`dangling flag: ${argv[i]}`);
    switch (key) {
      case "mode": flags.modes = value.split(",") as Array<"fast" | "smart">; break;
      case "reps": flags.reps = Number(value); break;
      case "label": flags.label = value; break;
      case "timeout": flags.timeoutMs = Number(value) * 1000; break;
      case "fast-model": flags.fastModel = value; break;
      case "smart-model": flags.smartModel = value; break;
      case "warm": flags.warm = value !== "off"; break;
      default: throw new Error(`unknown flag: --${key}`);
    }
  }
  return flags;
}

/** One timestamped observation, ms relative to the voice:tool send. */
interface Moment {
  atMs: number;
  kind: string;
  detail?: string;
}

interface AgentRunResult {
  mode: string;
  rep: number;
  fastModel?: string;
  smartModel?: string;
  ok: boolean;
  error?: string;
  fileCreated: boolean;
  totalMs?: number;
  warmupMs?: number;
  /** Client-visible ws events (what a user could have seen). */
  wsMoments: Moment[];
  /** Back-end CLI events from the JSONL log (what actually happened). */
  cliMoments: Moment[];
  /** Did the delegation respawn the CLI (model switch)? */
  respawned: boolean;
  modelsSeen: string[];
  /** Uncached input tokens summed over the turn's API calls (cache misses). */
  uncachedInputTokens: number;
  cacheReadTokens: number;
  costUsd?: number;
  numTurns?: number;
  /** Client-visible silent gaps > 3s between send and tool-result. */
  silentGaps: Array<{ fromMs: number; toMs: number; coveredBy?: string }>;
}

async function connect(url: string, deadlineMs: number): Promise<WebSocket> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.once("open", () => resolve(ws));
        ws.once("error", reject);
      });
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`server never came up: ${String(err)}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function runOne(
  mode: "fast" | "smart",
  rep: number,
  flags: Flags,
  resultsDir: string
): Promise<AgentRunResult> {
  const result: AgentRunResult = {
    mode,
    rep,
    fastModel: flags.fastModel,
    smartModel: flags.smartModel,
    ok: false,
    fileCreated: false,
    wsMoments: [],
    cliMoments: [],
    respawned: false,
    modelsSeen: [],
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    silentGaps: [],
  };

  // The delegated job writes into the wiki — run against a throwaway copy.
  const wikiCopy = mkdtempSync(path.join(tmpdir(), "explore-agent-wiki-"));
  cpSync(WIKI_FIXTURE, wikiCopy, {
    recursive: true,
    filter: (src) => !path.basename(src).startsWith("."),
  });
  const sandbox = mkdtempSync(path.join(tmpdir(), "explore-agent-sandbox-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "explore-agent-data-"));
  const eventsLog = path.join(resultsDir, `events_${mode}_${rep}.jsonl`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "0",
    WIKI_DIR: wikiCopy,
    SANDBOX_DIR: sandbox,
    DATA_DIR: dataDir,
    EVENTS_LOG: eventsLog,
    WARMUP: flags.warm ? "1" : "0",
  };
  if (flags.fastModel) env.VOICE_FAST_MODEL = flags.fastModel;
  if (flags.smartModel) env.VOICE_SMART_MODEL = flags.smartModel;

  const server: ChildProcess = spawn(TSX_BIN, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLogs: string[] = [];
  const portPromise = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server never announced its port")), 15_000);
    server.stdout?.on("data", (c: Buffer) => {
      const match = /websocket on http:\/\/localhost:(\d+)/.exec(c.toString());
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited before listening (code ${code})`));
    });
  });
  server.stdout?.on("data", (c: Buffer) => serverLogs.push(c.toString()));
  server.stderr?.on("data", (c: Buffer) => serverLogs.push(c.toString()));

  let ws: WebSocket | undefined;
  let sendWallClock = 0;
  try {
    const port = await portPromise;
    ws = await connect(`ws://127.0.0.1:${port}/ws`, 15_000);

    if (flags.warm) {
      const tWarm = performance.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("pre-warm never signaled ready")), 90_000);
        const onMessage = (raw: WebSocket.RawData) => {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (event.type === "chat:status" && event.status === "ready") {
            clearTimeout(timer);
            ws!.off("message", onMessage);
            resolve();
          } else if (event.type === "chat:status" && event.status === "exited") {
            clearTimeout(timer);
            ws!.off("message", onMessage);
            reject(new Error("CLI exited during pre-warm"));
          }
        };
        ws!.on("message", onMessage);
      });
      result.warmupMs = Math.round(performance.now() - tWarm);
    }

    // ——— The invocation, byte-identical to the browser voice bridge. ———
    const commandId = `agent-timing-${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("run timed out")), flags.timeoutMs);
      const t0 = performance.now();
      sendWallClock = Date.now();
      const since = () => Math.round(performance.now() - t0);

      ws!.on("message", (raw) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const type = String(event.type);
        // Record what a client could have rendered, with enough detail to
        // tell signal ("Editing journeys.md…") from noise.
        if (type === "chat:delta") {
          result.wsMoments.push({ atMs: since(), kind: "chat:delta" });
        } else if (type === "chat:message") {
          result.wsMoments.push({
            atMs: since(),
            kind: "chat:message",
            detail: String(event.text ?? "").slice(0, 80),
          });
        } else if (type === "chat:tool") {
          result.wsMoments.push({
            atMs: since(),
            kind: `chat:tool:${event.phase}`,
            detail: typeof event.name === "string" ? event.name : undefined,
          });
        } else if (type === "chat:status") {
          result.wsMoments.push({
            atMs: since(),
            kind: `chat:status:${event.status}`,
            detail: typeof event.model === "string" ? event.model : undefined,
          });
        } else if (type.startsWith("ui:")) {
          result.wsMoments.push({ atMs: since(), kind: type });
        } else if (type === "voice:tool-result" && event.id === commandId) {
          result.totalMs = since();
          result.wsMoments.push({
            atMs: since(),
            kind: "voice:tool-result",
            detail:
              typeof event.error === "string"
                ? `ERROR: ${event.error.slice(0, 120)}`
                : String(event.result ?? "").slice(0, 120),
          });
          clearTimeout(timeout);
          if (typeof event.error === "string") reject(new Error(`tool error: ${event.error}`));
          else resolve();
        }
      });

      ws!.send(
        JSON.stringify({
          type: "voice:tool",
          id: commandId,
          name: "ask_artifact_agent",
          args: { request: CREATE_DOC_REQUEST, mode },
        })
      );
    });

    // Did the job actually happen?
    const created = readdirSync(wikiCopy).includes(CREATED_FILE);
    result.fileCreated =
      created &&
      readFileSync(path.join(wikiCopy, CREATED_FILE), "utf8").includes(CREATED_MARKER);
    result.ok = result.fileCreated;
    if (!result.ok) result.error = `delegation returned but ${CREATED_FILE} missing/wrong`;
  } catch (err) {
    result.error = `${String(err instanceof Error ? err.message : err)}\n--- server tail ---\n${serverLogs.join("").slice(-1500)}`;
  } finally {
    ws?.close();
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        server.kill("SIGKILL");
        resolve();
      }, 5000);
      server.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
    });
  }

  // ——— Back-end waterfall from the server's JSONL event log. ———
  try {
    parseCliMoments(result, eventsLog, sendWallClock);
  } catch (err) {
    result.cliMoments.push({ atMs: -1, kind: "log-parse-error", detail: String(err) });
  }
  computeSilentGaps(result);
  return result;
}

/**
 * Reconstruct the back-end timeline: every log entry at/after the send
 * becomes a Moment (ms relative to the send), keeping the events that
 * explain time — respawns, inits, API-call starts (model + cache usage),
 * content blocks (thinking / text / tool calls), tool results, the final
 * result — and, for streamability, the first text delta of each API call.
 */
function parseCliMoments(result: AgentRunResult, eventsLog: string, sendWallClock: number): void {
  let sawTextDeltaThisCall = false;
  for (const line of readFileSync(eventsLog, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(String(event.ts ?? ""));
    if (!Number.isFinite(at) || at < sendWallClock - 50) continue;
    const atMs = at - sendWallClock;
    const push = (kind: string, detail?: string) =>
      result.cliMoments.push({ atMs, kind, detail });

    switch (event.type) {
      case "claude:started":
        result.respawned = true;
        push("cli:respawn");
        break;
      case "system":
        if (event.subtype === "init") {
          const model = typeof event.model === "string" ? event.model : "?";
          if (!result.modelsSeen.includes(model)) result.modelsSeen.push(model);
          push("cli:init", model);
        }
        break;
      case "stream_event": {
        const inner = event.event ?? {};
        if (inner.type === "message_start") {
          sawTextDeltaThisCall = false;
          const usage = inner.message?.usage ?? {};
          const uncached = Number(usage.input_tokens ?? 0);
          const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);
          result.uncachedInputTokens += uncached + cacheWrite;
          result.cacheReadTokens += Number(usage.cache_read_input_tokens ?? 0);
          if (typeof inner.message?.model === "string" && !result.modelsSeen.includes(inner.message.model)) {
            result.modelsSeen.push(inner.message.model);
          }
          push(
            "api:message_start",
            `${inner.message?.model ?? "?"} uncached=${uncached + cacheWrite} cacheRead=${usage.cache_read_input_tokens ?? 0}`
          );
        } else if (inner.type === "content_block_start") {
          const block = inner.content_block ?? {};
          if (block.type === "thinking") push("api:thinking_start");
          else if (block.type === "tool_use") push("api:tool_call_start", block.name);
          else if (block.type === "text") push("api:text_start");
        } else if (
          inner.type === "content_block_delta" &&
          inner.delta?.type === "text_delta" &&
          !sawTextDeltaThisCall
        ) {
          sawTextDeltaThisCall = true;
          push("api:first_text_delta");
        }
        break;
      }
      case "user":
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_result") push("api:tool_result", block.is_error ? "ERROR" : undefined);
        }
        break;
      case "result":
        if (typeof event.total_cost_usd === "number") result.costUsd = event.total_cost_usd;
        if (typeof event.num_turns === "number") result.numTurns = event.num_turns;
        push("cli:result", `duration=${event.duration_ms}ms cost=$${event.total_cost_usd}`);
        break;
    }
  }
}

/**
 * Client-visible silent gaps: stretches > 3s between successive ws events
 * from the send to the tool result — the time a user stares at nothing.
 * Each gap is annotated with the first back-end moment inside it, i.e. the
 * signal that *existed* and could have been streamed to cover it.
 */
function computeSilentGaps(result: AgentRunResult): void {
  if (result.totalMs === undefined) return;
  const visible = [0, ...result.wsMoments.map((m) => m.atMs), result.totalMs].sort((a, b) => a - b);
  for (let i = 1; i < visible.length; i++) {
    const fromMs = visible[i - 1];
    const toMs = visible[i];
    if (toMs - fromMs <= 3000) continue;
    const cover = result.cliMoments.find((m) => m.atMs > fromMs && m.atMs < toMs);
    result.silentGaps.push({
      fromMs,
      toMs,
      coveredBy: cover ? `${cover.kind}${cover.detail ? ` (${cover.detail})` : ""} @${(cover.atMs / 1000).toFixed(1)}s` : undefined,
    });
  }
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function printRun(result: AgentRunResult): void {
  const head = `mode=${result.mode} rep=${result.rep}` +
    (result.fastModel ? ` fast-model=${result.fastModel}` : "") +
    (result.smartModel ? ` smart-model=${result.smartModel}` : "");
  if (!result.ok && result.totalMs === undefined) {
    console.log(`  ${head}  FAILED: ${result.error?.split("\n")[0]}`);
    return;
  }
  console.log(
    `  ${head}  total ${fmt(result.totalMs!)}  file=${result.fileCreated ? "✓" : "✗"}` +
      `  respawn=${result.respawned ? "YES" : "no"}  models=[${result.modelsSeen.join(", ")}]` +
      `  uncachedIn=${result.uncachedInputTokens}  cost=${result.costUsd !== undefined ? `$${result.costUsd.toFixed(3)}` : "?"}`
  );
  console.log("    a) back-end waterfall:");
  for (const m of result.cliMoments) {
    console.log(`       ${fmt(m.atMs).padStart(7)}  ${m.kind}${m.detail ? `  ${m.detail}` : ""}`);
  }
  console.log("    b) client-visible timeline (streamability):");
  for (const m of result.wsMoments) {
    console.log(`       ${fmt(m.atMs).padStart(7)}  ${m.kind}${m.detail ? `  ${m.detail}` : ""}`);
  }
  if (result.silentGaps.length) {
    console.log("    silent gaps > 3s (what streaming could cover):");
    for (const g of result.silentGaps) {
      console.log(
        `       ${fmt(g.fromMs)} → ${fmt(g.toMs)} (${fmt(g.toMs - g.fromMs)} silent)` +
          (g.coveredBy ? `  first available signal: ${g.coveredBy}` : "  no back-end signal either")
      );
    }
  } else {
    console.log("    no client-visible silent gaps > 3s");
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const resultsDir = path.resolve(import.meta.dirname, "results", flags.label);
  mkdirSync(resultsDir, { recursive: true });
  const runsFile = path.join(resultsDir, "agent-runs.jsonl");

  const total = flags.modes.length * flags.reps;
  console.log(`${total} agent-timing run(s) → ${resultsDir}`);
  let i = 0;
  for (const mode of flags.modes) {
    for (let rep = 1; rep <= flags.reps; rep++) {
      i += 1;
      console.log(`[${i}/${total}] ask_artifact_agent mode=${mode} rep=${rep}`);
      const result = await runOne(mode, rep, flags, resultsDir);
      appendFileSync(runsFile, JSON.stringify(result) + "\n");
      printRun(result);
    }
  }
}

void main();

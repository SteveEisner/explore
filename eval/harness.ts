/**
 * One eval run = one fresh, fully isolated app instance driven like a real
 * client:
 *
 *   spawn server (own port/sandbox/data-dir/event-log, fixture wiki)
 *     → connect websocket → send the scenario's chat message
 *     → timestamp every interesting event → wait for the turn's result
 *     → kill the server, return the measurements.
 *
 * Fresh DATA_DIR per run means no persisted session id, so every run pays
 * the full cold path (CLI spawn + new session) — that is the thing being
 * measured. The headline metric is `uiSpecMs`: request sent → the complete
 * ui tool-call input received (the last data of the UI tool call), a good
 * proxy for "UI complete on screen" without timing the front end.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { normalizeSpec, SPEED_HINT, type Scenario } from "./scenarios.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_BIN = path.resolve(REPO_ROOT, "node_modules/.bin/tsx");
const SERVER_ENTRY = path.resolve(REPO_ROOT, "server/src/index.ts");
const WIKI_FIXTURE = path.resolve(import.meta.dirname, "wiki");

export interface RunConfig {
  scenario: Scenario;
  /** `--model` for the CLI; undefined = the CLI's default model. */
  model?: string;
  /** `--effort` for the CLI; undefined = the CLI's default. */
  effort?: string;
  /**
   * "full" = production system prompt; anything else = the whole appended
   * prompt is replaced by eval/prompts/<variant>.md ("slim" keeps its
   * historical mapping to slim-ui.md).
   */
  promptVariant: string;
  /** Prepend the hurry-up line to the chat message. */
  speedHint: boolean;
  /**
   * Connect-time pre-warm (production default). When on, the harness waits
   * for the server's "ready" status before sending — modeling a user who
   * connects, then types — so the measured turn starts against a warm CLI.
   */
  warm: boolean;
  rep: number;
  /** Per-run event log destination (JSONL, written by the server). */
  eventsLog: string;
  /** Hard cap on the whole run; the run errors out beyond this. */
  timeoutMs?: number;
}

/** Millisecond offsets from the moment the chat message was sent. */
export interface RunTimings {
  /** CLI session initialized (system:init reached the server). */
  initMs?: number;
  /** First streamed content of any kind (chat or ui delta). */
  firstDeltaMs?: number;
  /** ui tool call began streaming. */
  uiStartMs?: number;
  /** First ui spec fragment forwarded. */
  uiFirstDeltaMs?: number;
  /** HEADLINE: complete ui tool-call input received. */
  uiSpecMs?: number;
  /** Turn finished (CLI result event). */
  resultMs?: number;
}

export interface RunResult {
  scenario: string;
  model: string;
  effort: string;
  promptVariant: string;
  speedHint: boolean;
  warm: boolean;
  rep: number;
  ok: boolean;
  error?: string;
  /** Wall-clock of the pre-warm turn (connect → "ready"), when warm is on. */
  warmupMs?: number;
  /**
   * Conversation events that leaked to the client during the warm turn
   * (must be 0 — the warm ping is invisible in the chat).
   */
  warmLeaks?: number;
  /** Model id the CLI actually reported at session init. */
  modelReported?: string;
  timings: RunTimings;
  /** The CLI's own duration/cost accounting from the result event. */
  cliDurationMs?: number;
  costUsd?: number;
  numTurns?: number;
  uiCalls: number;
  specMatch?: boolean;
  specLength?: number;
  actualSpec?: string;
}

/** Retry the websocket until the freshly spawned server starts accepting. */
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

export async function runOne(config: RunConfig): Promise<RunResult> {
  const result: RunResult = {
    scenario: config.scenario.key,
    model: config.model ?? "default",
    effort: config.effort ?? "default",
    promptVariant: config.promptVariant,
    speedHint: config.speedHint,
    warm: config.warm,
    rep: config.rep,
    ok: false,
    timings: {},
    uiCalls: 0,
  };

  // Fresh sandbox + data dir: no resumable session, no leftover files.
  const sandbox = mkdtempSync(path.join(tmpdir(), "explore-eval-sandbox-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "explore-eval-data-"));

  // PORT=0: the server binds an OS-assigned ephemeral port and announces the
  // bound port on stdout — no bind-and-release race between parallel runs.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "0",
    WIKI_DIR: WIKI_FIXTURE,
    SANDBOX_DIR: sandbox,
    DATA_DIR: dataDir,
    EVENTS_LOG: config.eventsLog,
    WARMUP: config.warm ? "1" : "0",
  };
  if (config.model) env.CLAUDE_MODEL = config.model;
  if (config.effort) env.CLAUDE_EFFORT = config.effort;
  if (config.promptVariant !== "full") {
    const file = config.promptVariant === "slim" ? "slim-ui" : config.promptVariant;
    env.APPEND_PROMPT_FILE = path.resolve(import.meta.dirname, `prompts/${file}.md`);
  }

  const server: ChildProcess = spawn(TSX_BIN, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLogs: string[] = [];
  // The listen announcement carries the bound ephemeral port; watch stdout
  // for it (while also keeping all output for error reports).
  const portPromise = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server never announced its port")),
      15_000
    );
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
  try {
    const port = await portPromise;
    ws = await connect(`ws://127.0.0.1:${port}/ws`, 15_000);

    // Connecting triggers the server's pre-warm; hold the real message until
    // "ready" (a user would still be typing). Conversation events arriving
    // during this window are warm-turn leaks — counted, and expected to be 0.
    if (config.warm) {
      const tWarm = performance.now();
      let leaks = 0;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("pre-warm never signaled ready")),
          90_000
        );
        const settle = (fn: () => void) => {
          clearTimeout(timer);
          ws!.off("message", onMessage);
          fn();
        };
        const onMessage = (raw: WebSocket.RawData) => {
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw.toString());
          } catch {
            return;
          }
          const type = String(event.type);
          if (
            ["chat:message", "chat:delta", "chat:tool", "chat:response",
             "ui:start", "ui:delta", "ui:spec"].includes(type)
          ) {
            leaks += 1;
          }
          if (type === "chat:status" && event.status === "ready") {
            settle(resolve);
          } else if (type === "chat:status" && event.status === "exited") {
            settle(() => reject(new Error("CLI exited during pre-warm")));
          }
        };
        ws!.on("message", onMessage);
      });
      result.warmupMs = Math.round(performance.now() - tWarm);
      result.warmLeaks = leaks;
    }

    // Drive one chat turn and timestamp the event waterfall relative to send.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("run timed out")),
        config.timeoutMs ?? 240_000
      );
      const speedPrefix = config.speedHint ? SPEED_HINT : "";
      const t0 = performance.now();
      const since = () => Math.round(performance.now() - t0);
      const t = result.timings;

      ws!.on("message", (raw) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }
        switch (event.type) {
          case "chat:status":
            if (event.status === "session" || event.status === "session-resumed") {
              t.initMs ??= since();
              if (typeof event.model === "string") result.modelReported = event.model;
            }
            break;
          case "chat:delta":
            t.firstDeltaMs ??= since();
            break;
          case "ui:start":
            t.firstDeltaMs ??= since();
            t.uiStartMs ??= since();
            break;
          case "ui:delta":
            t.firstDeltaMs ??= since();
            t.uiFirstDeltaMs ??= since();
            break;
          case "ui:spec": {
            // The authoritative full tool input — the headline finish line.
            t.uiSpecMs = since();
            result.uiCalls += 1;
            const spec = typeof event.spec === "string" ? event.spec : "";
            result.actualSpec = spec;
            result.specLength = spec.length;
            result.specMatch =
              normalizeSpec(spec) === normalizeSpec(config.scenario.expectedSpec);
            break;
          }
          case "chat:response": {
            t.resultMs = since();
            if (typeof event.durationMs === "number") result.cliDurationMs = event.durationMs;
            if (typeof event.costUsd === "number") result.costUsd = event.costUsd;
            if (typeof event.numTurns === "number") result.numTurns = event.numTurns;
            if (event.isError === true) {
              reject(new Error(`CLI reported error result: ${String(event.text).slice(0, 300)}`));
            } else {
              clearTimeout(timeout);
              resolve();
            }
            break;
          }
          case "chat:error":
            clearTimeout(timeout);
            reject(new Error(`chat:error: ${String(event.message)}`));
            break;
        }
      });

      ws!.send(
        JSON.stringify({
          type: "chat",
          id: `eval-${Date.now()}`,
          text: speedPrefix + config.scenario.prompt,
        })
      );
    });

    // A run only counts when the turn completed AND produced a ui call.
    result.ok = result.uiCalls > 0;
    if (!result.ok) result.error = "turn completed without any ui tool call";
  } catch (err) {
    result.error = `${String(err instanceof Error ? err.message : err)}\n--- server output tail ---\n${serverLogs.join("").slice(-2000)}`;
  } finally {
    ws?.close();
    // SIGTERM lets the server's signal handler stop the Claude CLI child.
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
  return result;
}

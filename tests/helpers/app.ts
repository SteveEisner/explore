import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

/**
 * Test harness for the real application server.
 *
 * `startApp` seeds a throwaway wiki directory, spawns `server/src/index.ts`
 * exactly as production runs it (tsx), and points every identity path
 * (wiki, sandbox, data, event log) at the temp directory via the server's
 * env overrides — so tests exercise the served HTTP + websocket surface,
 * never in-process reconstructions of it. PORT=0 lets the OS pick a free
 * port; the harness learns the bound port from the server's startup line.
 *
 * The Claude CLI is never spawned: WARMUP=0 disables the connect-time
 * pre-warm turn, so the CLI starts only on the first "chat" command, which
 * these tests never send.
 */

const repoRoot = path.resolve(import.meta.dirname, "../..");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const serverEntry = path.join(repoRoot, "server/src/index.ts");

/** How long to wait for the spawned server's "listening" line. */
const STARTUP_TIMEOUT_MS = 15_000;

export interface TestApp {
  /** e.g. "http://localhost:52341" — the ephemeral port the server bound. */
  baseUrl: string;
  /** The temp wiki directory the server serves at /docs/ and writes into. */
  wikiDir: string;
  /** Open a websocket client speaking the app's wire protocol. */
  connect(): Promise<AppSocket>;
  /** Kill the server and delete the temp directory. Safe to call once. */
  close(): Promise<void>;
}

/**
 * Start the app against a fresh temp wiki seeded with `seedFiles`
 * (relative path → content; nested paths create directories). `env` adds or
 * overrides server environment variables — including forcing one *empty*
 * (e.g. OPENAI_API_KEY: "") to mask a secret the developer's gitignored
 * .env.local would otherwise supply, since the server treats present-but-
 * empty vars as authoritative over that file.
 */
export async function startApp(
  seedFiles: Record<string, string> = {},
  env: Record<string, string> = {}
): Promise<TestApp> {
  const root = await mkdtemp(path.join(tmpdir(), "explore-test-"));
  const wikiDir = path.join(root, "wiki");
  for (const dir of ["wiki", "sandbox", "data"]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
  await seedWiki(wikiDir, seedFiles);

  const child = spawn(tsxBin, [serverEntry], {
    env: {
      ...process.env,
      PORT: "0",
      WIKI_DIR: wikiDir,
      SANDBOX_DIR: path.join(root, "sandbox"),
      DATA_DIR: path.join(root, "data"),
      EVENTS_LOG: path.join(root, "events.jsonl"),
      // No paid CLI turns from tests: connecting a websocket must not
      // trigger the pre-warm.
      WARMUP: "0",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const sockets: AppSocket[] = [];
  try {
    const port = await waitForListeningPort(child);
    const baseUrl = `http://localhost:${port}`;
    return {
      baseUrl,
      wikiDir,
      async connect() {
        const socket = await AppSocket.open(`ws://localhost:${port}/ws`);
        sockets.push(socket);
        return socket;
      },
      async close() {
        for (const socket of sockets) socket.close();
        await stop(child);
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await stop(child);
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

async function seedWiki(
  wikiDir: string,
  files: Record<string, string>
): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(wikiDir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
}

/**
 * Resolve the server's bound port. The server prints
 * "serving front end + websocket on http://localhost:<port>" once listening
 * (the real port even under PORT=0); an early exit or a silent
 * STARTUP_TIMEOUT_MS means the server is broken, so reject with its stderr.
 */
function waitForListeningPort(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(
        new Error(`server did not report a port within ${STARTUP_TIMEOUT_MS}ms\n${stderr}`)
      );
    }, STARTUP_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = /websocket on http:\/\/localhost:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited during startup (code ${code})\n${stderr}`));
    });
  });
}

/** SIGTERM the server (its handler exits cleanly) and wait for the exit. */
function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}

/** A broadcast event from the server; tests match on `type` and payload. */
export type ServerEvent = { type: string } & Record<string, unknown>;

/**
 * Websocket client for the app's async wire protocol (commands out,
 * broadcast events in). Every received event is buffered; `next` consumes
 * the first match so sequential expectations never double-count an event,
 * and `expectSilence` proves a window passes with no match.
 */
export class AppSocket {
  /** Events received but not yet consumed by a `next()` expectation. */
  private readonly pending: ServerEvent[] = [];
  private waiter:
    | {
        match: (event: ServerEvent) => boolean;
        resolve: (event: ServerEvent) => void;
      }
    | undefined;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (raw) => {
      const event = JSON.parse(raw.toString()) as ServerEvent;
      if (this.waiter?.match(event)) {
        const { resolve } = this.waiter;
        this.waiter = undefined;
        resolve(event);
        return;
      }
      this.pending.push(event);
    });
  }

  static open(url: string): Promise<AppSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once("open", () => resolve(new AppSocket(ws)));
      ws.once("error", reject);
    });
  }

  send(command: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(command));
  }

  /**
   * The first event matching `match`, consumed from the buffer or awaited
   * from the wire. Rejects (failing the test) after `timeoutMs` — a missing
   * broadcast is a bug, not a skip.
   */
  next(
    match: (event: ServerEvent) => boolean,
    { timeoutMs = 5_000, description = "matching event" } = {}
  ): Promise<ServerEvent> {
    this.assertNoOutstandingExpectation();
    const buffered = this.pending.findIndex(match);
    if (buffered !== -1) {
      return Promise.resolve(this.pending.splice(buffered, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined;
        reject(new Error(`no ${description} within ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiter = {
        match,
        resolve: (event) => {
          clearTimeout(timer);
          resolve(event);
        },
      };
    });
  }

  /**
   * Prove a negative: rejects if an event matching `match` is already
   * buffered or arrives within `windowMs`; resolves once the window passes
   * clean. Use for "must NOT broadcast" invariants (debounce collapsed the
   * burst, hidden files ignored, responses stay private to the requester).
   */
  expectSilence(
    match: (event: ServerEvent) => boolean,
    { windowMs = 600, description = "unexpected event" } = {}
  ): Promise<void> {
    this.assertNoOutstandingExpectation();
    return new Promise((resolve, reject) => {
      const buffered = this.pending.find(match);
      if (buffered) {
        reject(new Error(`${description}: ${JSON.stringify(buffered)}`));
        return;
      }
      const timer = setTimeout(() => {
        this.waiter = undefined;
        resolve();
      }, windowMs);
      this.waiter = {
        match,
        resolve: (event) => {
          clearTimeout(timer);
          reject(new Error(`${description}: ${JSON.stringify(event)}`));
        },
      };
    });
  }

  /**
   * Only one expectation (`next` / `expectSilence`) may be outstanding per
   * socket — a second would silently starve the first until its timeout, a
   * confusing failure far from the cause. Fail fast at the call site instead.
   */
  private assertNoOutstandingExpectation(): void {
    if (this.waiter) {
      throw new Error(
        "AppSocket already has an outstanding expectation; await it before starting another"
      );
    }
  }

  close(): void {
    this.ws.close();
  }
}

let commandSeq = 0;

/**
 * Save an artifact over the websocket and return the matching
 * `artifact:saved` answer (success or error), correlated by command id so
 * concurrent saves and unrelated broadcasts can't be confused.
 */
export async function saveArtifact(
  socket: AppSocket,
  args: { name: string; spec: string; overwrite?: boolean }
): Promise<ServerEvent> {
  const id = `test-save-${commandSeq++}`;
  socket.send({ type: "artifact:save", id, ...args });
  return socket.next(
    (event) => event.type === "artifact:saved" && event.id === id,
    { description: `artifact:saved answer for ${id}` }
  );
}

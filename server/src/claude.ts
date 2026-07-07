import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

/**
 * One NDJSON event emitted by `claude --output-format stream-json`.
 * Shapes vary by `type` ("system" | "stream_event" | "assistant" | "user" |
 * "result"); we keep them loose and let the chat layer pick fields out.
 */
export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  [key: string]: unknown;
}

export interface ClaudeSessionOptions {
  /** Working directory the CLI runs in. */
  cwd?: string;
  /** Where the session id is persisted so restarts can reconnect. */
  dataDir?: string;
  /** CLI binary, defaults to `claude` on PATH. */
  command?: string;
}

type ClaudeProcess = ChildProcessByStdio<Writable, Readable, Readable>;

/**
 * Back-end component that talks to a Claude Code CLI instance in streaming
 * mode (`--input-format stream-json --output-format stream-json`).
 *
 * The child process stays alive between turns; user messages are written to
 * its stdin as NDJSON and every event the CLI emits on stdout is re-emitted
 * here as an "event". The session id from the CLI's init event is persisted
 * to disk, so if the process (or this server) dies, the next `send()`
 * respawns the CLI with `--resume <session-id>` and reconnects to the same
 * running session.
 *
 * Events: "event" (ClaudeStreamEvent), "started" ({resumed}), "exit" (code),
 * "stderr" (string).
 */
export class ClaudeSession extends EventEmitter {
  private proc: ClaudeProcess | null = null;
  private stdoutBuffer = "";
  private readonly cwd: string;
  private readonly command: string;
  private readonly sessionFile: string;
  sessionId: string | null = null;

  constructor(options: ClaudeSessionOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
    this.command = options.command ?? "claude";
    const dataDir = options.dataDir ?? path.join(process.cwd(), "data");
    this.sessionFile = path.join(dataDir, "claude-session.json");
    this.sessionId = this.loadPersistedSessionId();
  }

  get running(): boolean {
    return this.proc !== null;
  }

  /** Send one user turn; starts (or resumes) the CLI if it isn't running. */
  send(text: string): { resumed: boolean; started: boolean } {
    let started = false;
    let resumed = false;
    if (!this.proc) {
      resumed = this.start();
      started = true;
    }
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.proc!.stdin.write(line + "\n");
    return { resumed, started };
  }

  /**
   * Spawn the CLI. Returns true when it is resuming a previous session
   * rather than beginning a fresh one.
   */
  private start(): boolean {
    const args = [
      "--print",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
    ];
    const resuming = this.sessionId !== null;
    if (this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    const proc = spawn(this.command, args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.proc = proc;
    this.stdoutBuffer = "";

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.consumeStdout(chunk));
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => this.emit("stderr", chunk));

    proc.on("error", (err) => {
      this.proc = null;
      this.emit("error", err);
    });
    proc.on("exit", (code) => {
      if (this.proc === proc) this.proc = null;
      this.emit("exit", code);
    });

    this.emit("started", { resumed: resuming });
    return resuming;
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf("\n")) !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let event: ClaudeStreamEvent;
      try {
        event = JSON.parse(line) as ClaudeStreamEvent;
      } catch {
        this.emit("stderr", `unparseable CLI output: ${line}`);
        continue;
      }
      if (typeof event.session_id === "string") {
        this.rememberSessionId(event.session_id);
      }
      this.emit("event", event);
    }
  }

  /**
   * Session ids can rotate when the CLI resumes (resume forks into a new
   * session id), so always track the latest one seen.
   */
  private rememberSessionId(sessionId: string): void {
    if (sessionId === this.sessionId) return;
    this.sessionId = sessionId;
    try {
      mkdirSync(path.dirname(this.sessionFile), { recursive: true });
      writeFileSync(
        this.sessionFile,
        JSON.stringify({ sessionId, updatedAt: new Date().toISOString() })
      );
    } catch (err) {
      this.emit("stderr", `failed to persist session id: ${String(err)}`);
    }
  }

  private loadPersistedSessionId(): string | null {
    try {
      if (!existsSync(this.sessionFile)) return null;
      const parsed = JSON.parse(readFileSync(this.sessionFile, "utf8"));
      return typeof parsed.sessionId === "string" ? parsed.sessionId : null;
    } catch {
      return null;
    }
  }
}

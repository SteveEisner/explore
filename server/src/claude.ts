import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { buildSystemPrompt } from "./prompt.js";
import { materializeSkills } from "./skills.js";

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
  /**
   * Working directory the CLI runs in. This is also the model's file-access
   * sandbox: it can read/write here (and in temp dirs) but nowhere else, so
   * point it at a throwaway directory, not the repo.
   */
  cwd?: string;
  /** Where the session id is persisted so restarts can reconnect. */
  dataDir?: string;
  /** CLI binary, defaults to `claude` on PATH. */
  command?: string;
  /**
   * The wiki directory. When set, the model gets the markdown-vault MCP
   * server (note CRUD/search) plus the wiki MCP server (list/read/create
   * for every file type), both rooted here — its only window onto content
   * outside the sandbox cwd.
   */
  wikiDir?: string;
  /** Model for the CLI session (`--model`); the CLI's default when unset. */
  model?: string;
  /**
   * Reasoning-effort level for the CLI session (`--effort`, e.g. "low",
   * "medium", "high"); the CLI's default when unset.
   */
  effort?: string;
  /**
   * Path to a file whose contents replace the entire appended system prompt
   * (the ui/state/wiki teaching text) at spawn time. An experiment knob for
   * the performance eval; production leaves it unset and gets the built
   * prompt. Tool permissions are unaffected — only the prompt text changes.
   */
  appendSystemPromptFile?: string;
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
  private readonly wikiDir: string | undefined;
  private readonly model: string | undefined;
  private readonly effort: string | undefined;
  private readonly appendSystemPromptFile: string | undefined;
  /**
   * Model the running CLI was spawned with (undefined = CLI default).
   * Compared against per-send overrides to decide whether a model switch —
   * and therefore a respawn — is needed.
   */
  private activeModel: string | undefined;
  sessionId: string | null = null;
  /**
   * The app server's *bound* HTTP/websocket port, set by index.ts once
   * listening. The ui MCP server dials the app back on this port (state /
   * set_state / edit_artifact exchanges), so it must be the real port —
   * under PORT=0 (eval harness, side instances) the env value would be 0.
   * The CLI spawns lazily on the first send, long after listen, so this is
   * always set by the time writeMcpConfig runs in production wiring.
   */
  appPort: number | null = null;

  constructor(options: ClaudeSessionOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
    this.command = options.command ?? "claude";
    this.wikiDir = options.wikiDir;
    this.model = options.model;
    this.effort = options.effort;
    this.appendSystemPromptFile = options.appendSystemPromptFile;
    const dataDir = options.dataDir ?? path.join(process.cwd(), "data");
    this.sessionFile = path.join(dataDir, "claude-session.json");
    this.sessionId = this.loadPersistedSessionId();
  }

  get running(): boolean {
    return this.proc !== null;
  }

  /**
   * Send one user turn, optionally with an image content block (base64);
   * starts (or resumes) the CLI if it isn't running.
   *
   * `options.model` runs this turn on a specific model (FAST/SMART voice
   * delegation): --model is a spawn flag, so a different model means
   * killing the CLI and respawning with --resume — the conversation
   * survives, only the process restarts. Restarting kills anything the CLI
   * is doing, so the switch happens only when the caller vouches for
   * idleness via `options.allowRestart`; otherwise the turn runs on
   * whatever model is active.
   */
  send(
    text: string,
    image?: { mediaType: string; data: string },
    options?: { model?: string; allowRestart?: boolean }
  ): { resumed: boolean; started: boolean } {
    const model = options?.model ?? this.model;
    if (this.proc && options?.allowRestart && model !== this.activeModel) {
      this.stop();
    }
    let started = false;
    let resumed = false;
    if (!this.proc) {
      resumed = this.start(model);
      started = true;
    }
    const content: Array<Record<string, unknown>> = [];
    if (image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.data,
        },
      });
    }
    if (text) content.push({ type: "text", text });
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    // Non-null: either proc existed on entry or start() just spawned it.
    this.proc!.stdin.write(line + "\n");
    return { resumed, started };
  }

  /**
   * Spawn the CLI on `model` (the session default when omitted). Returns
   * true when it is resuming a previous session rather than beginning a
   * fresh one.
   */
  private start(model: string | undefined = this.model): boolean {
    // MCP tools the model may call without prompting. Everything else an MCP
    // server exposes still needs permission, which --print mode auto-denies.
    // Bare "Skill" pre-approves loading any of our shipped skills (the only
    // ones discoverable — see materializeSkills).
    const allowedTools = [
      "mcp__ui__ui",
      "mcp__ui__state",
      "mcp__ui__set_state",
      "mcp__ui__edit_artifact",
      "Skill",
    ];
    if (this.wikiDir) {
      allowedTools.push(
        "mcp__vault__vault",
        "mcp__vault__edit",
        "mcp__vault__view",
        "mcp__vault__system",
        "mcp__wiki__list_files",
        "mcp__wiki__read_file",
        "mcp__wiki__create_file"
      );
    }
    // The appended prompt is authored in server/prompts/*.md and read at
    // every spawn, so prompt edits apply on the next session start.
    let systemPrompt = buildSystemPrompt({ wikiDir: this.wikiDir });
    // Eval override: swap the whole appended prompt for the file's contents
    // so prompt-size experiments can vary this layer without code changes.
    if (this.appendSystemPromptFile) {
      systemPrompt = readFileSync(this.appendSystemPromptFile, "utf8");
    }
    const args = [
      "--print",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      // The `ui` tool: an MCP server the CLI spawns, plus the OpenUI Lang
      // system prompt teaching the model the component library. When a wiki
      // is configured, the vault + wiki servers ride along.
      "--mcp-config",
      this.writeMcpConfig(),
      "--allowedTools",
      allowedTools.join(","),
      "--append-system-prompt",
      systemPrompt,
      // Sandbox: the model gets file tools only, scoped to the working
      // directory (the gitignored sandbox/ dir) plus temp dirs. Everything
      // else must go through the MCP servers configured above.
      // - `--tools` removes Bash, WebFetch, WebSearch, Task, etc. entirely;
      //   `Skill` stays in so the model can load our shipped skills.
      // - `--setting-sources "project"` reads config from the sandbox cwd
      //   ONLY — which this server fully materializes (skills via
      //   materializeSkills; no settings file exists there) — so skills are
      //   discoverable while user-level allow rules, hooks, extra MCP
      //   servers, and user/plugin skills still can't leak in. (Empirically:
      //   "" hides project skills entirely; --add-dir does not load them.)
      // - `--strict-mcp-config` limits MCP servers to our --mcp-config file.
      // - In --print mode permission prompts auto-deny, so file access
      //   outside the working directories is refused; `acceptEdits` only
      //   auto-approves writes inside them.
      "--tools",
      "Read,Write,Edit,Glob,Grep,Skill",
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--permission-mode",
      "acceptEdits",
      "--add-dir",
      "/tmp",
      "/private/tmp",
      tmpdir(),
      // Belt and braces should a tool slip back into the set — and, for the
      // vault's workflow tool, the way we keep it out of the model's context
      // entirely: disallowed tools are removed from the tool list, unlike
      // merely non-allowed ones, which stay visible and auto-deny on call
      // (context cost plus a failure trap for zero value).
      "--disallowedTools",
      "Bash",
      "WebFetch",
      "WebSearch",
      "Task",
      "mcp__vault__workflow",
    ];
    if (model) args.push("--model", model);
    if (this.effort) args.push("--effort", this.effort);
    this.activeModel = model;
    const resuming = this.sessionId !== null;
    if (this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    // The sandbox working directory is gitignored, so it may not exist yet.
    mkdirSync(this.cwd, { recursive: true });
    // Refresh <sandbox>/.claude/skills from server/skills so the session
    // discovers exactly the currently-authored skills (see skills.ts).
    materializeSkills(this.cwd);

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

  /**
   * Kill the CLI without emitting "exit": intentional stops (server
   * shutdown, model-switch restarts) must not look like crashes — the
   * "exit" event is reserved for deaths the session didn't ask for, which
   * is what lets listeners treat every "exit" as a failure.
   */
  stop(): void {
    const proc = this.proc;
    this.proc = null;
    if (!proc) return;
    proc.removeAllListeners("exit");
    proc.kill();
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
        JSON.stringify({
          sessionId,
          cwd: this.cwd,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch (err) {
      this.emit("stderr", `failed to persist session id: ${String(err)}`);
    }
  }

  /**
   * Write the MCP config the CLI loads at spawn. Our own servers run from
   * compiled dist/ in production; under tsx (this file ends in .ts) they run
   * the TypeScript source via the workspace's tsx binary.
   */
  private writeMcpConfig(): string {
    const isDev = import.meta.url.endsWith(".ts");
    const here = import.meta.dirname;
    const localServer = (name: string, env?: Record<string, string>) => ({
      ...(isDev
        ? {
            command: path.resolve(here, "../../node_modules/.bin/tsx"),
            args: [path.join(here, `${name}.ts`)],
          }
        : { command: process.execPath, args: [path.join(here, `${name}.js`)] }),
      ...(env ? { env } : {}),
    });

    // The ui server needs the app's real (bound) port to dial back for its
    // state/set_state/edit_artifact exchanges — the inherited PORT env can
    // be 0 (ephemeral) or unset.
    const appPort = this.appPort ?? Number(process.env.PORT ?? 3001);
    const mcpServers: Record<string, unknown> = {
      ui: localServer("ui-mcp", { PORT: String(appPort) }),
    };
    if (this.wikiDir) {
      // Third-party markdown-note CRUD/search over the wiki, plus our own
      // wiki server (list/read/create) covering the non-markdown wiki files
      // it can't see.
      mcpServers.vault = {
        command: path.resolve(
          here,
          "../../node_modules/.bin/markdown-vault-mcp"
        ),
        env: { VAULT_PATH: this.wikiDir },
      };
      mcpServers.wiki = localServer("wiki-mcp", { WIKI_PATH: this.wikiDir });
    }

    const configPath = path.join(path.dirname(this.sessionFile), "mcp.json");
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ mcpServers }));
    return configPath;
  }

  /**
   * The CLI stores sessions per working directory, so a session id is only
   * resumable from the cwd it was created in; ignore ids recorded elsewhere.
   */
  private loadPersistedSessionId(): string | null {
    try {
      if (!existsSync(this.sessionFile)) return null;
      const parsed = JSON.parse(readFileSync(this.sessionFile, "utf8"));
      if (parsed.cwd !== this.cwd) return null;
      return typeof parsed.sessionId === "string" ? parsed.sessionId : null;
    } catch {
      return null;
    }
  }
}

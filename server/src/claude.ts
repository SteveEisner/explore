import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { buildUiSystemPrompt } from "./ui-library.js";

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
   * server (note CRUD/search) plus the wiki file-listing MCP server, both
   * rooted here — its only window onto content outside the sandbox cwd.
   */
  wikiDir?: string;
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
  sessionId: string | null = null;

  constructor(options: ClaudeSessionOptions = {}) {
    super();
    this.cwd = options.cwd ?? process.cwd();
    this.command = options.command ?? "claude";
    this.wikiDir = options.wikiDir;
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
   */
  send(
    text: string,
    image?: { mediaType: string; data: string }
  ): { resumed: boolean; started: boolean } {
    let started = false;
    let resumed = false;
    if (!this.proc) {
      resumed = this.start();
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
   * Spawn the CLI. Returns true when it is resuming a previous session
   * rather than beginning a fresh one.
   */
  private start(): boolean {
    // MCP tools the model may call without prompting. Everything else an MCP
    // server exposes (e.g. the vault's petri-net `workflow` tool) still needs
    // permission, which --print mode auto-denies.
    const allowedTools = ["mcp__ui__ui", "mcp__ui__state", "mcp__ui__set_state"];
    let systemPrompt = buildUiSystemPrompt();
    systemPrompt +=
      "\n\n# The state tool\n" +
      "Call the `state` tool (mcp__ui__state) to see what the user is " +
      "currently looking at: the open document and its type, scroll " +
      "position (including which markdown source line is at the top of " +
      "the screen), any text selection (with source line range), pointer " +
      "position, panel states, and viewport size. Pass screenshot: true " +
      "to also receive an image of the main window. Use it before " +
      "answering questions about 'this', 'here', or what's on screen." +
      "\n\n# Driving the app: the state store and set_state\n" +
      "All of the app's UI state lives in a shared hierarchical key-value " +
      "store; the `state` tool's snapshot includes every key under " +
      "`stateStore`. Call `set_state` (mcp__ui__set_state) to change it — " +
      "the update applies instantly, exactly as if the user did it. Use " +
      "it to navigate for the user ('app/view' opens a wiki file or the " +
      "authoring panel), switch the reader's context level " +
      "('app/context-level'), or drive artifact components: a Tabs or " +
      "Gallery selection lives under its stateKey (or " +
      "'artifact/tabs/<statementId>' / 'artifact/gallery/<statementId>'), " +
      "and the value may be the item index or its label. Prefer steering " +
      "the existing UI with set_state over re-rendering it with the ui " +
      "tool when the user asks to 'show', 'open', or 'go to' something " +
      "that is already on screen.";
    if (this.wikiDir) {
      allowedTools.push(
        "mcp__vault__vault",
        "mcp__vault__edit",
        "mcp__vault__view",
        "mcp__vault__system",
        "mcp__wiki__list_files"
      );
      systemPrompt +=
        "\n\n# The wiki\n" +
        "The user's wiki is a markdown vault. Use the `vault`, `edit`, " +
        "`view`, and `system` MCP tools to list, read, search, and edit its " +
        "notes, and `list_files` to enumerate every wiki file including " +
        "non-markdown pages (.oui, .html). Wiki files are web-served at " +
        "/docs/<path>; use that URL form when linking wiki pages in UIs. " +
        "When you edit a wiki file the user is viewing, the app reloads " +
        "it automatically — no need to tell the user to refresh.";
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
      // - `--tools` removes Bash, WebFetch, WebSearch, Task, etc. entirely.
      // - `--setting-sources ""` ignores user/project settings, so no outside
      //   allow rules, hooks, or extra MCP servers leak in.
      // - `--strict-mcp-config` limits MCP servers to our --mcp-config file.
      // - In --print mode permission prompts auto-deny, so file access
      //   outside the working directories is refused; `acceptEdits` only
      //   auto-approves writes inside them.
      "--tools",
      "Read,Write,Edit,Glob,Grep",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--permission-mode",
      "acceptEdits",
      "--add-dir",
      "/tmp",
      "/private/tmp",
      tmpdir(),
      // Belt and braces should a tool slip back into the set.
      "--disallowedTools",
      "Bash",
      "WebFetch",
      "WebSearch",
      "Task",
    ];
    const resuming = this.sessionId !== null;
    if (this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    // The sandbox working directory is gitignored, so it may not exist yet.
    mkdirSync(this.cwd, { recursive: true });

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

    const mcpServers: Record<string, unknown> = { ui: localServer("ui-mcp") };
    if (this.wikiDir) {
      // Third-party markdown-note CRUD/search over the wiki, plus our own
      // listing tool covering the non-markdown wiki files it can't see.
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

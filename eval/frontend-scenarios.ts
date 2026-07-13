/**
 * Front-end-agent scenario suite: prove the user-visible wiki journeys work
 * end to end by calling exactly the tools the voice agent would call — the
 * `voice:tool` registry over the websocket (list/read/edit/edit_artifact +
 * ask_artifact_agent delegation), never typed chat.
 *
 *   npx tsx eval/frontend-scenarios.ts
 *
 * Scenarios (one isolated server, throwaway wiki copy, run in sequence —
 * later steps depend on earlier ones, like a real session):
 *
 *   S1  orient: list_docs
 *   S2  create a directory + markdown file in it (via delegation — the
 *       registry has no direct create tool; the probe first shows what a
 *       naive edit_doc attempt returns)
 *   S3  fill the file with content (direct edit_doc)
 *   S4  generate a .oui artifact in the new directory (via delegation)
 *   S5  edit the artifact (direct edit_artifact patch)
 *   S6  edit the content again (direct edit_doc)
 *   S7  read both back (read_doc) and verify everything on disk
 *
 * Each step prints PASS/FAIL, duration, and the backend tool calls observed
 * in the server's JSONL event log during delegated steps. Exit code 1 when
 * any required step fails.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TSX_BIN = path.resolve(REPO_ROOT, "node_modules/.bin/tsx");
const SERVER_ENTRY = path.resolve(REPO_ROOT, "server/src/index.ts");
const WIKI_FIXTURE = path.resolve(import.meta.dirname, "wiki");

const NOTE_PATH = "projects/alpha/notes.md";
const OUI_PATH = "projects/alpha/overview.oui";

interface StepResult {
  step: string;
  ok: boolean;
  required: boolean;
  ms: number;
  note: string;
}

const results: StepResult[] = [];

function record(step: string, ok: boolean, ms: number, note: string, required = true): void {
  results.push({ step, ok, required, ms, note });
  console.log(
    `${ok ? "PASS" : required ? "FAIL" : "warn"}  ${step}  (${(ms / 1000).toFixed(1)}s)\n      ${note}`
  );
}

async function main(): Promise<void> {
  // ——— isolated app instance (same pattern as agent-timing.ts) ———
  const wikiCopy = mkdtempSync(path.join(tmpdir(), "explore-scenario-wiki-"));
  cpSync(WIKI_FIXTURE, wikiCopy, {
    recursive: true,
    filter: (src) => !path.basename(src).startsWith("."),
  });
  const eventsLog = path.join(
    mkdtempSync(path.join(tmpdir(), "explore-scenario-log-")),
    "events.jsonl"
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: "0",
    WIKI_DIR: wikiCopy,
    SANDBOX_DIR: mkdtempSync(path.join(tmpdir(), "explore-scenario-sandbox-")),
    DATA_DIR: mkdtempSync(path.join(tmpdir(), "explore-scenario-data-")),
    EVENTS_LOG: eventsLog,
    WARMUP: "1",
  };
  const server: ChildProcess = spawn(TSX_BIN, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server never announced its port")), 15_000);
    server.stdout?.on("data", (c: Buffer) => {
      const match = /websocket on http:\/\/localhost:(\d+)/.exec(c.toString());
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    server.once("exit", (code) => reject(new Error(`server exited early (${code})`)));
  });
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sock.once("open", () => resolve(sock));
    sock.once("error", reject);
  });

  // Wait for the production pre-warm so timings reflect a real session.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pre-warm never ready")), 90_000);
    ws.on("message", function onMessage(raw: WebSocket.RawData) {
      const event = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (event.type === "chat:status" && event.status === "ready") {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve();
      }
    });
  });

  /** One voice-registry call, exactly as the browser bridges it. */
  let nextId = 0;
  function callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 240_000
  ): Promise<{ ok: boolean; text: string; ms: number }> {
    const id = `scenario-${nextId++}`;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, text: "tool call timed out", ms: performance.now() - t0 }),
        timeoutMs
      );
      const onMessage = (raw: WebSocket.RawData) => {
        const event = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (event.type !== "voice:tool-result" || event.id !== id) return;
        clearTimeout(timer);
        ws.off("message", onMessage);
        const ms = performance.now() - t0;
        if (typeof event.error === "string") resolve({ ok: false, text: event.error, ms });
        else resolve({ ok: true, text: String(event.result ?? ""), ms });
      };
      ws.on("message", onMessage);
      ws.send(JSON.stringify({ type: "voice:tool", id, name, args }));
    });
  }

  /** Backend tool calls logged since `sinceWallClock` (for delegated steps). */
  function backendToolCalls(sinceWallClock: number): string[] {
    const calls: string[] = [];
    for (const line of readFileSync(eventsLog, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let event: Record<string, any>;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (Date.parse(String(event.ts ?? "")) < sinceWallClock) continue;
      if (event.type === "assistant") {
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_use") calls.push(String(block.name));
        }
      }
    }
    return calls;
  }

  try {
    // ——— S1: orient ———
    {
      const r = await callTool("list_docs", {});
      const files = r.ok ? (JSON.parse(r.text).files as Array<{ path: string }>) : [];
      record("S1 list_docs", r.ok && files.length > 0, r.ms, r.ok ? `${files.length} files` : r.text);
    }

    // ——— S2 probe: what does a naive direct create attempt return? ———
    // The registry has no create tool; a voice model would likely reach for
    // edit_doc first. Not required to succeed — we record the teaching error.
    {
      const r = await callTool("edit_doc", {
        path: NOTE_PATH,
        old_text: "anything",
        new_text: "# Notes",
      });
      record(
        "S2a probe: direct create via edit_doc",
        !r.ok,
        r.ms,
        r.ok ? "unexpectedly succeeded (edit_doc created a file?)" : `teaching error: ${r.text.slice(0, 140)}`,
        false
      );
    }

    // ——— S2: create directory + markdown file (delegation) ———
    {
      const t = Date.now();
      const r = await callTool("ask_artifact_agent", {
        mode: "fast",
        request:
          `Create a new wiki file at ${NOTE_PATH} (the projects/alpha folder does not exist yet) ` +
          "with exactly this markdown content:\n\n# Project Alpha notes\n\n" +
          "## Goals\n\nTBD.\n\n## Status\n\nJust created.\n",
      });
      const onDisk =
        existsSync(path.join(wikiCopy, NOTE_PATH)) &&
        readFileSync(path.join(wikiCopy, NOTE_PATH), "utf8").includes("# Project Alpha notes");
      record(
        "S2b create dir + file (delegated)",
        r.ok && onDisk,
        r.ms,
        `${r.text.slice(0, 100)} | on disk: ${onDisk} | backend tools: ${backendToolCalls(t).join(", ") || "none"}`
      );
    }

    // ——— S3: fill with content (direct edit_doc) ———
    {
      const r = await callTool("edit_doc", {
        path: NOTE_PATH,
        old_text: "## Goals\n\nTBD.",
        new_text:
          "## Goals\n\n- Ship the alpha demo\n- Keep latency under five seconds\n- Document every decision",
      });
      const onDisk = readFileSync(path.join(wikiCopy, NOTE_PATH), "utf8").includes("Ship the alpha demo");
      record("S3 fill content (edit_doc)", r.ok && onDisk, r.ms, r.ok ? `edited; on disk: ${onDisk}` : r.text.slice(0, 140));
    }

    // ——— S4: generate an artifact in the directory (delegation) ———
    {
      const t = Date.now();
      const r = await callTool("ask_artifact_agent", {
        mode: "smart",
        request:
          `Create a new .oui exploration artifact in the wiki at ${OUI_PATH}. ` +
          `It should present the goals from ${NOTE_PATH} (read that file). Keep it small: ` +
          "a root Stack with a title and a goals list. Write the complete OpenUI Lang program to the file.",
      });
      const file = path.join(wikiCopy, OUI_PATH);
      const onDisk = existsSync(file) && readFileSync(file, "utf8").includes("root");
      record(
        "S4 generate artifact in dir (delegated)",
        r.ok && onDisk,
        r.ms,
        `${r.text.slice(0, 100)} | on disk: ${onDisk} | backend tools: ${backendToolCalls(t).join(", ") || "none"}`
      );
    }

    // ——— S5: edit the artifact (direct edit_artifact) ———
    {
      const r = await callTool("edit_artifact", {
        file: OUI_PATH,
        spec: 'title = Content("<h1>Project Alpha — edited by the front-end agent</h1>")',
      });
      const onDisk =
        existsSync(path.join(wikiCopy, OUI_PATH)) &&
        readFileSync(path.join(wikiCopy, OUI_PATH), "utf8").includes("edited by the front-end agent");
      record("S5 edit artifact (edit_artifact)", r.ok && onDisk, r.ms, r.ok ? `patched; on disk: ${onDisk}` : r.text.slice(0, 140));
    }

    // ——— S6: edit the content again (direct edit_doc) ———
    {
      const r = await callTool("edit_doc", {
        path: NOTE_PATH,
        old_text: "## Status\n\nJust created.",
        new_text: "## Status\n\nEdited after the artifact was generated.",
      });
      const onDisk = readFileSync(path.join(wikiCopy, NOTE_PATH), "utf8").includes(
        "Edited after the artifact was generated"
      );
      record("S6 edit content again (edit_doc)", r.ok && onDisk, r.ms, r.ok ? `edited; on disk: ${onDisk}` : r.text.slice(0, 140));
    }

    // ——— S7: read both back through the registry ———
    {
      const note = await callTool("read_doc", { path: NOTE_PATH });
      const listing = await callTool("list_docs", {});
      const listed =
        listing.ok &&
        [NOTE_PATH, OUI_PATH].every((p) =>
          (JSON.parse(listing.text).files as Array<{ path: string }>).some((f) => f.path === p)
        );
      record(
        "S7 read back + listing",
        note.ok && listed,
        note.ms + listing.ms,
        `read_doc ok: ${note.ok}; both files in list_docs: ${listed}` +
          (note.ok ? "" : ` | ${note.text.slice(0, 120)}`)
      );
    }
  } finally {
    ws.close();
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

  const failed = results.filter((r) => r.required && !r.ok);
  console.log(
    `\n${results.filter((r) => r.ok).length}/${results.length} steps ok` +
      (failed.length ? ` — ${failed.length} REQUIRED FAILURE(S)` : " — all required steps passed")
  );
  console.log(`wiki copy: ${wikiCopy}\nevents log: ${eventsLog}`);
  if (failed.length) process.exitCode = 1;
}

void main();

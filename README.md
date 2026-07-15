# Explore

Part wiki, part artifact authoring environment: a web app where you talk to
a built-in agent (chat or voice) about a folder of documents, and it builds
interactive explanation artifacts inside the wiki's own pages. The back end
drives a **Claude Code CLI** instance in streaming mode.

## Install

Prerequisites — check these before anything else:

- **Node 20.12+** (`node --version`) — older 20.x fails at startup
  (`process.loadEnvFile`, `import.meta.dirname`).
- **Claude Code CLI installed and authenticated** (`claude --version`
  works and `claude` can answer a prompt) — the back end spawns it for
  every chat session. See [Installing Claude Code, safely
  scoped](#installing-claude-code-safely-scoped) below **before**
  installing if it isn't already set up.
- **The decryption password** — provided to you out of band. It unlocks the
  OpenAI key that powers the optional voice agent; every other feature
  works without it.

Then, in order (each step must succeed before the next):

```sh
git clone https://github.com/SteveEisner/explore.git && cd explore
npm install                                    # also wires the pre-commit hook
scripts/decrypt <password> env.enc > .env.local  # <password> = the one you were given
scripts/warm-vault.sh                          # one-time: ~100MB model + search index
npm run dev                                    # back end :3001, front end :5173
```

Open **http://localhost:5173**. You should see the wiki home page; click the
mic in the chat toolbar for voice (needs the decrypted key), or type in the
chat. Verify the install with `npm run check && npm test` — both must pass
on a clean clone. If `scripts/decrypt` prints `bad decrypt`, the password
was wrong; nothing was written. The wiki is the repo's own `docs/` by
default; point `WIKI_DIR` at another folder of notes to explore your own
([.env.example](.env.example) lists every knob).

### Installing Claude Code, safely scoped

This app is a wrapper that invokes Claude Code programmatically — every chat
session spawns a `claude` process without a human watching the permission
prompts. That is inherently dangerous if your Claude Code installation has
broad standing permissions, so:

1. **Install the official CLI normally** (`npm install -g
   @anthropic-ai/claude-code`), run `claude` once in a terminal to
   authenticate, then quit it. No special configuration for this app —
   the constraints below are applied by the app itself.
2. **Know the app's jail, and don't widen it.** Every session this server
   spawns is confined by construction (`server/src/claude.ts`): working
   directory pinned to the gitignored `sandbox/` folder; the tool set
   reduced to file tools + `Skill` (**no Bash, no web, no subagents** —
   removed via `--tools` and belt-and-braces `--disallowedTools`); MCP
   limited to this app's own servers (`--strict-mcp-config`); and
   `--setting-sources "project"` so your user-level settings, allow rules,
   hooks, and MCP servers **cannot leak into these sessions at all**.
   Headless permission prompts auto-deny. Don't add permission flags or
   tools there without understanding you are widening an unattended agent.
3. **Keep your own user-level permissions conservative anyway** — no broad
   `Bash` allow rules in `~/.claude/settings.json`. This app shields itself
   from them, but other wrappers you run may not.
4. **For the strongest isolation**, run the whole app inside a container,
   VM, or a dedicated machine account whose home directory contains only
   this project — then even a fully misbehaving session can see nothing
   else.

## Architecture

```
client/   Vite + React + TypeScript
          shadcn/ui (tweakcn "Modern Minimal" light theme)
          chat components (MessageScroller / Message / Bubble / Marker)
          OpenUI (@openuidev/react-lang) generative-UI library
server/   Node + TypeScript
          - web serving engine: serves the built front end only (no HTTP API)
          - back-end services: async over a websocket at /ws
          - ClaudeSession: drives `claude` in stream-json mode, persists the
            session id and reconnects with --resume across restarts
```

### Protocol

The front end sends commands over the websocket; the back end publishes
namespaced events (see `server/src/protocol.ts`):

- client → server: `{ "type": "chat", "text": "..." }`
- server → client: `chat:status`, `chat:message`, `chat:delta`, `chat:tool`,
  `chat:response`, `chat:error`

The sidebar expresses the entire event stream as chat rows — bubbles for
user/assistant turns, marker text for status, tool activity, results, and
errors. The floating **Test** button in the main panel sends a test chat
message to kick everything off.

### The `ui` tool (OpenUI)

The LLM can construct the main panel's UI:

- `server/src/ui-mcp.ts` is an MCP server giving the CLI a `ui` tool whose
  `spec` argument is an [OpenUI Lang](https://openui.com/docs/openui-lang)
  program; `server/src/ui-library.ts` generates the system prompt from the
  component schemas (edit mode enabled).
- The back end watches the streaming tool-call tokens and forwards the
  decoded spec as `ui:start` / `ui:delta` / `ui:spec` events, so the panel
  renders incrementally while the model is still writing.
- The front end merges edit-mode patches with `mergeStatements` and renders
  with the OpenUI `<Renderer>`. Components (client renderers in
  `client/src/lib/openui.tsx`, schema mirror in `server/src/ui-library.ts`):
  - `Content(html)` — raw HTML block
  - `Stack(children)` — full-width vertical stack, edge to edge
  - `Tabs(tabs: [{label, content}])` — tab row on top, panels below

## Semantic-search warm-up

The wiki's semantic search (the markdown-vault MCP server) indexes the whole
wiki the first time it starts, which includes downloading a local embedding
model — roughly 100 MB and 20 seconds on a fresh clone. Left alone that cost
lands when the first chat session spawns the MCP servers, i.e. mid-demo, so
`scripts/warm-vault.sh` pays it at setup time and persists the index in
`docs/.markdown_vault_mcp/`. Re-running it is a cheap incremental pass. The
model cache lives in `node_modules/@huggingface/transformers/.cache`, so
deleting `node_modules` re-pays the download.

## Production

```sh
npm run build      # builds client/dist and server/dist
npm start          # serves the front end + websocket on :3001
```

The active session id is persisted in `server/data/claude-session.json`;
delete it to start a fresh session.

## Observability

Every event that reaches the back end is appended to
`/tmp/explore-events.jsonl` (override with `EVENTS_LOG`), one JSON object
per line: `{ ts, source, ...event }`. Sources: `client` (websocket
messages), `claude` (raw CLI stream events), `server` (connections,
spawn/exit, stderr), and `frontend` — the browser queues its own entries
(ws lifecycle, sends, uncaught errors; see `client/src/lib/frontend-log.ts`)
and ships them over the same websocket as `{type: "log"}` messages.

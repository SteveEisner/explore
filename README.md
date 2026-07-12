# Explore

A web app scaffold: a shadcn/ui front end with a chat sidebar driven by a
back end that talks to a **Claude Code CLI** instance in streaming mode.

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

## Quickstart

Prerequisites:

- **Node 20.12+** — the server uses `process.loadEnvFile` and
  `import.meta.dirname`, so older 20.x versions fail at startup.
- **Claude Code CLI** (`claude`) installed and authenticated — the back end
  spawns it for every chat session. Everything else (dev servers, tests,
  build) works without it; only real LLM sessions need it.
- No API keys for the core app. `OPENAI_API_KEY` enables the optional voice
  agent — see [.env.example](.env.example) for it and every other knob.

```sh
git clone <repo> && cd explore
npm install                   # also wires up the pre-commit hook (core.hooksPath)
cp .env.example .env.local    # optional — only needed to configure voice etc.
scripts/warm-vault.sh         # one-time: embedding model download + wiki search index
npm run dev                   # back end on :3001, Vite dev server on :5173 (proxies /ws)
```

Open http://localhost:5173. The wiki is the repo's own `docs/` directory by
default, so a fresh clone has real content to explore; point `WIKI_DIR` at
another folder of notes to explore your own. `npm run check` (typecheck +
lint) and `npm test` should both pass on a clean clone.

### Semantic-search warm-up

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

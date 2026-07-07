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

## Development

```sh
npm install
npm run dev        # back end on :3001, Vite dev server on :5173 (proxies /ws)
```

## Production

```sh
npm run build      # builds client/dist and server/dist
npm start          # serves the front end + websocket on :3001
```

Requires the `claude` CLI on PATH. The active session id is persisted in
`server/data/claude-session.json`; delete it to start a fresh session.

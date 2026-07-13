# client

The web app shell: a Vite + React + TypeScript front end with two panes — the
**artifact view** (renders the LLM-generated explanation app via OpenUI,
hot-reloading as the model edits it) and the **chat pane** (streaming feedback
channel to the Claude Code session). Wiki browsing is served through the same
back end. Styling is Tailwind CSS v4 + shadcn/ui; all server communication
happens over the websocket at `/ws` (no HTTP API).

## Scripts

```sh
npm run dev        # Vite dev server (proxies /ws to the back end on :3001)
npm run build      # tsc -b && vite build → dist/
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run preview    # preview the production build
```

In practice, run `npm run dev` from the repo root to start the back end and
this dev server together.

## More

See the root [README](../README.md) for the full system (server, protocol,
observability) and [docs/design/ARCHITECTURE.md](../docs/design/ARCHITECTURE.md) for how the
wiki, artifacts, and session bridge fit together.

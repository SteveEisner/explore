# Tests

Automated test suites, organized by component area (mirroring
[TASKS.md](../TASKS.md) / [docs/design/ARCHITECTURE.md](../docs/design/ARCHITECTURE.md)).
Run everything from the repo root:

```
npm test
```

Runner: Node's built-in `node:test` via `tsx` (no extra framework). The npm
script globs `tests/*/*.test.ts`, so a new suite is just a new file in a
component directory — each file runs in its own process.

## Layout

- `helpers/` — shared harness code, most importantly `app.ts`: spawns the
  **real server** (`server/src/index.ts`) against a throwaway seeded wiki
  using the server's own env overrides (`PORT=0`, `WIKI_DIR`, …), plus a
  websocket client speaking the wire protocol. Tests exercise the served
  HTTP/websocket/MCP surfaces — not in-process reconstructions — so they
  prove what a browser or the LLM actually experiences.
- `wiki/` — the wiki's API surface:
  - `retrieval.test.ts` — files served verbatim at `/docs/<path>`: content,
    MIME types, plain 404s, traversal refusal.
  - `artifact-save.test.ts` — the `artifact:save` websocket command (the
    app's only wiki write path): create, name normalization,
    overwrite-protection and the explicit re-save overwrite, hostile-name
    rejection (wiki left untouched), requester-only answers.
  - `hot-reload.test.ts` — `wiki:changed` broadcasts from the file watcher:
    edits, new nested files, burst debouncing, dotfile silence, and the
    save→notify chain between two clients.
  - `listing.test.ts` — the `wiki` MCP server's `list_files` tool over real
    stdio MCP: full listing with sizes, dot-entries hidden.

Future component directories (`protocol/`, `client/`, `intelligence/`, …)
follow the same pattern: put shared spin-up code in `helpers/`, keep each
suite runnable in isolation.

## Conventions

- A test names the behavior and the boundary it proves; the docstring at
  the top of each file states the surface under test.
- No Claude CLI, no API keys: the spawned server only starts the LLM
  session on the first `chat` command, which these suites never send.
- Timing-sensitive expectations (watcher debounce) use windows several
  multiples of the production constant to stay honest on slow machines.

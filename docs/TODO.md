# TODO — Idea Holding Bin

Loose ends and ideas that aren't yet tasks. When one becomes real work, move it to [TASKS.md](../TASKS.md) (claim it there) and delete it here. Anything goes; this list is allowed to be messy.

## Open

- **Rendering polish: whitespace, colors, styling.** The artifact rendering still isn't great whitespace-wise, and we need a real answer for colors and styling beyond the current per-artifact CSS (relates to D4 hooks, the deferred page-theming/style-isolation question, and the sandboxing task).
- **Train the LLM to write less in chat.** The chat area is small; generation guidance should cap/shape response length (explanations belong in the artifact, not the chat).
- **Audit the LLM's wake-up context.** We haven't really reviewed the instructions/system prompt the server session starts with (ui-library prompt + CLI defaults + MCP tool descriptions) — read it end to end, trim and tune.
- **Update the architecture diagram with Mermaid?** Idea: redo/refresh the architecture diagram as a Mermaid diagram (still a question mark, not committed).
- **Folders / separate information spaces.** Everything currently serves from one flat `docs/` — which is also the project's own documentation. Need some notion of folders or per-exploration spaces so bundles stay separate (the architecture's original "one directory per exploration topic" idea; also keeps project docs from mixing into the user's wiki content).

## Done / promoted

- ~~Model evals~~ → promoted to TASKS.md crunch track "Optimize model cost" (2026-07-07).
- ~~Save Artifacts~~ → shipped as the J4 save/reopen tasks in TASKS.md (2026-07-07).

## Nits

- Backticks in Markdown aren't rendering as inline code (noticed 2026-07-07).

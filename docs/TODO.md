# TODO — Idea Holding Bin

Loose ends and ideas that aren't yet tasks. When one becomes real work, move it to [TASKS.md](../TASKS.md) (claim it there) and delete it here. Anything goes; this list is allowed to be messy.

## Open

- **Rendering polish: whitespace, colors, styling.** The artifact rendering still isn't great whitespace-wise, and we need a real answer for colors and styling beyond the current per-artifact CSS (relates to D4 hooks, the deferred page-theming/style-isolation question, and the sandboxing task).
- **Train the LLM to write less in chat.** The chat area is small; generation guidance should cap/shape response length (explanations belong in the artifact, not the chat).
- **Audit the LLM's wake-up context.** We haven't really reviewed the instructions/system prompt the server session starts with (ui-library prompt + CLI defaults + MCP tool descriptions) — read it end to end, trim and tune.
- **Model evals (later).** Find the cheapest LLM that does a good job at artifact generation/editing — worth a small eval harness once the core loop is proven.
- **Save Artifacts.** No way to persist a generated artifact today (the ui panel is ephemeral; wiki has no write path from the app). Needs a "save to wiki" story — on-disk .oui representation exists as precedent.

## Done / promoted

- (nothing yet)

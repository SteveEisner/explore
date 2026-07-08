# Tasks

The single task list: live tracker organized by component area (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), plus the phase roadmap and the idea holding bin at the bottom. Phase numbers in the tables refer to the [Phases](#phases-roadmap) section.

**How to use:** claim a task by putting your name in Owner. Statuses: `todo` · `in progress` · `blocked` · `done`. When a task reaches `done`, log it in the worklog (see AGENTS.md).

## Next session: Phase 4 — interactive exploration

The declared focus for the next two-hour session: interactive exploration elements (the vocabulary growing into quizzes, filters, drill-downs, timelines; interaction signals feeding refinement). Three prerequisites feed it from tonight's work:

- **(a) Faster prompt loops** — the Optimizer's perf instrumentation + latency grind (J3 crunch track).
- **(b) A better understanding of clear explaining** — J1/J2 guidance findings (what makes generated explanations actually land).
- **(c) A voice model** — expected to take significant time; start early. (Elevated from the Multimodal backlog.)

## Priority: customer journeys ([docs/journeys.md](docs/journeys.md))

| Task | Journey | Owner | Status |
|---|---|---|---|
| Run J1 end-to-end: wiki bundle → generated exploration; audit wake-up prompt; capture guidance gaps | J1 | Claude | in progress |
| Generation guidance so J1 output is archetype-class (vocabulary use, context levels, artifact CSS) | J1 | — | todo |
| Exercise J2: Q&A session over a study-notes wiki; guidance for chat-vs-artifact mode, grounded answers, wiki links, "quiz me" handoff | J2 | — | todo |
| Measure J3 loop: per-turn timing in the JSONL log (ask → first token → render complete) | J3 | — | todo |
| Speed up J3: attack the biggest latency contributor; keep edits surgical (no view-state loss) | J3 | — | todo |
| Train the LLM toward chat brevity (explanations belong in the artifact, not the chat) | J2/J3 | — | todo |
| Save artifacts to the wiki as .oui from the "new artifact" view: click into the filename bar to name it; a Save button sits at the far right inside that bar, shown only for a new artifact (not when viewing a saved one); saving requires a name. The UI generation process should also supply a default artifact name | J4 | Worker 2 | done |
| Reopen a saved .oui and continue editing (second half of the old save/reopen task): "Edit Artifact" button over .oui views seeds the authoring panel; LLM-side editing of arbitrary wiki .oui files stays a separate task (Intelligence section) | J4 | Worker 2 | done |
| Clean-clone quickstart: README setup, env/API-key handling, seed wiki, verify from fresh checkout. Note: vault semantic search has a one-time cost on first run (local embedding model download + initial indexing) — warm it during setup, don't let it land mid-demo | J0 | — | todo |
| Test that vault search actually works (search / global_search / semantic_search over the wiki): never exercised; verify results are sane and the semantic index builds | bar | — | todo |
| Investigate exactly what the LLM receives at invocation — full report: docs/llm-invocation-report.md (base-prompt verbatim capture via logging proxy folded into the perf-instrumentation task) | bar | Claude | done |
| Prompt removal: kill the OpenUI default rule "When asked about data, generate realistic/plausible data" — replace with "all facts/data in artifacts must come from wiki content; never invent data" (check `uiLibrary.prompt()` options for suppressing default Important Rules; otherwise counter-rule) | J1 | Worker 1 | done |
| Prompt removal: kill the OpenUI default component-suggestion rule ("tables for comparisons, charts for trends, forms for input") — it names components our vocabulary doesn't have; replace with guidance naming our actual six | J1 | Worker 1 | done |
| Prompt removal: eliminate the vault `workflow` tool from the model's context (config option on markdown-vault-mcp if it exists, else a wrapper/filter; last resort: an explicit "never call workflow" line) | bar | Worker 1 | done |
| Prompt diet: dedupe system-prompt sections vs. tool descriptions — "# The state tool" / set_state / wiki sections repeat much of the MCP descriptions verbatim; state each fact once (probably in the tool description) and keep the system prompt for cross-tool policy | bar | Worker 1 | done |
| Add a role/identity opener to the appended prompt (counters base-prompt coding-assistant identity; overlaps the personality task under Intelligence) | J1/J2 | Worker 1 | done |
| Model selection for server calls: parameterize the CLI model (`--model`) — env/config default plus per-session override from the app (groundwork for the cost eval: cheap model for edits, bigger for generation) | bar | The Optimizer | in progress |
| Enforce lint: fix the oxlint errors (rules-of-hooks in openui.tsx), add lint to the server workspace and root scripts, pre-commit hook runs typecheck+lint | bar | Cleaner | done |
| Client TypeScript strict mode: turn on `strict` in client tsconfigs (server already has it) and fix the fallout | bar | Cleaner | done |
| Test harness: typecheck+lint one command; protocol + prompt-builder unit tests; scripted chat-turn integration test; benchmark .oui as rendering fixture | bar | Worker 2 | in progress |
| **Isolated side instance (gates all crunch tracks):** full app runs from a git worktree with its own server — parameterize ports, wiki path, sandbox dir, session file, JSONL log; one-command launch | J0/bar | The Optimizer | in progress |

## Blitz backlog (small fixes banked for a 5+ agent blitz)

Little things deliberately *not* fixed on sight — banked here until there are enough for a parallel multi-agent blitz. A good blitz item is: small (≤ ~30 min), independent (no shared files with other blitz items where possible), and scoped so an agent can finish it without questions. When you spot one mid-task, add it here instead of fixing it.

| Task | Area | Notes |
|---|---|---|
| Untrack the vault-generated `docs/meta/` (contract.md/overview.md say `generated_by: mcp-markdown-vault`): gitignore it next to `docs/.markdown_vault_mcp/` and `git rm --cached` — unless someone is deliberately pinning it for the clean-clone demo, then document that instead | wiki | from the Cleaner's structure audit |
| Type the JSONL logger's message parameter so chat.ts can drop its `as unknown as Record<string, unknown>` double casts | server | from the Cleaner's review |
| Align TypeScript versions across workspaces (client `~6.0.2` vs server `^5.8.0`) | build | from the Cleaner's review |
| Delete or rewrite the leftover Vite-template `client/README.md` | docs | from the Cleaner's review |
| Backticks in Markdown aren't rendering as inline code (noticed 2026-07-07) | client | from the TODO holding bin |
| Horizontal window pan still possible: scrollIntoView/focus on elements in the clipped chat aside (or right-edge toolbar controls) scrolls `html` sideways despite the overflow-hidden shell — pin `html`/`body` overflow or use `overflow: clip` | client | from Worker 2's save/reopen verification (seen under browser automation) |

## Crunch tracks (non-interactive; run unattended once the isolated instance exists)

| Task | Journey | Owner | Status |
|---|---|---|---|
| **UI-generation performance eval — instrumentation + eval.** (1) Per-sub-session performance logs: from the moment a command is invoked until the LLM signals all work complete, every event it generates is appended — with wall-clock timestamp and delta-from-invocation — to a file dedicated to that exact sub-session, written into the LLM's private sandbox directory (the server session's cwd), e.g. `sandbox/perf/<turn-id>.jsonl`. Events to cover: command invoked, CLI spawn/resume, first stream token, each tool call start/result (ui/state/vault/wiki), each ui:spec chunk, message boundaries, and the final result/completion signal. Sandbox placement is deliberate: the LLM (or a side eval agent) can read its own timing files. (2) The eval itself: run scripted generation/edit prompts, analyze the per-turn files — time-to-first-token, time-to-first-ui-statement, time-to-render-complete, tokens/turn — and report where the time goes. | J3 | The Optimizer | in progress |
| Optimize UI-interaction time: grind on the biggest contributors the performance eval identifies | J3 | The Optimizer | blocked |
| Optimize model cost: measure tokens/turn from the JSONL log; try cheaper models per role (edits vs. generation vs. chat); quality-check against the benchmark | bar | The Optimizer | blocked |
| Automated manual testing: a side agent drives the app through the journeys (browser or websocket), reports regressions; runs against the isolated instance | bar | — | blocked |

## Wiki (storage & conventions)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Define the wiki convention: one plain file directory per exploration topic; Markdown by convention, any file type allowed | 1 | — | todo |
| Create sample wikis for testing and demos (e.g., a small doc bundle, a PR, SEV data) | 1 | — | todo |

## Wiki API (backend endpoints)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Wiki API test suite: `tests/` harness spawns the real server against a temp wiki; covers /docs retrieval (content, MIME, 404s, traversal), artifact:save creation/edits (normalization, overwrite protection, hostile-name rejection), wiki:changed hot-reload (debounce, dotfiles, save→notify), and wiki-MCP list_files — `npm test` | bar | Worker 2 | done |
| List endpoint: enumerate wiki files with paths + basic metadata | 1 | Worker 1 | done |
| Read endpoint: chunked line reads (offset + limit), never whole-doc | 1 | — | todo |
| Create endpoint: new file with given content | 1 | — | todo |
| Rename endpoint: rename/move within the wiki | 1 | — | todo |
| Edit endpoint: `str_replace`-style exact search/replace per decisions.md D1, with loud, distinguishable errors | 1 | — | todo |

## Artifacts & OpenUI

| Task | Phase | Owner | Status |
|---|---|---|---|
| Evaluate and integrate OpenUI: library setup, rendering pipeline, on-disk representation (decisions.md D2) | 1 | — | done |
| Define the initial component vocabulary for exploration apps (Stack, Content, Tabs) | 1 | — | done |
| Add Gallery (master-detail), Aside (side context panel), and Comparison (side-by-side panels) to the vocabulary | 1 | Claude | done |
| Translate the hand-built PR-review explainer to `.oui` as a vocabulary benchmark (docs/pr-502764-review.oui, archetype: docs/pr-502764-review.html) | 1 | Claude | done |
| Generalize Comparison: unstyled default, gap/border/dividers/className options, optional labels | 1 | Claude | done |
| Apply D4 to Gallery/Aside/Tabs: de-chrome, hook classes, layout props; teach D4 in generation guidance | 1 | Claude | done |
| Context-aware rendering: `context` prop on every component, gated against an app-level context level | 1 | Claude | done |
| Sandbox the artifact viewer/editor so rendered content can't do anything dangerous: Content injects LLM-authored HTML via dangerouslySetInnerHTML with no sanitization (the markdown path uses rehype-sanitize), so a prompt injection in wiki content could become script execution — sanitize or isolate (iframe/CSP). Explicitly **not high priority** right now (2026-07-07) | 1 | — | todo |
| Hierarchical KV state store for component state, host-readable/writable (decisions.md D3); Tabs/Gallery selection wired via `stateKey` (default `artifact/<type>/<statementId>`) — landed with the state-parity task | 4 | Worker 1 | done |
| State-key manifest (D3 second half): artifacts declare their state keys up front (initial value + human-readable description) so the store doubles as documentation the LLM can read | 4 | Worker 1 | done |
| Context/audience switcher component with context-variant text (from pr-review.html analysis) | 4 | — | todo |
| Artifact runtime API: let artifacts query the wiki on demand (via the Wiki API) | 4 | — | todo |
| Grow the vocabulary with interactive exploration elements (filters, drill-downs, timelines, diagrams, quizzes), guided by escape-hatch usage | 4 | — | todo |

## Intelligence & generation guidance (Claude Code)

**Story: the LLM as a clear explainer.** Teach the LLM to present information with clarity — an explainer (not a pedantic know-it-all) who gently introduces a concept to a newcomer and answers a domain expert at full depth. Source doctrine synthesized from the four clarity skills.

| Task | Journey | Owner | Status |
|---|---|---|---|
| Synthesize the clarity doctrine for teaching: audience calibration, orient-then-detail, dependency-order context, smallest useful model, layered depth, boundaries, checkable claims, anti-pedantry — [docs/explaining-with-clarity.md](docs/explaining-with-clarity.md) | J1/J2 | Worker 2 | done |
| Deliver the doctrine as an on-demand **skill**, not always-on prompt text (prompt section reverted): server/skills/explaining-clarity/SKILL.md, description-triggered on explaining / answering wiki questions / building an exploration artifact; materialized into the sandbox at every spawn (server/src/skills.ts), discovered via `--setting-sources "project"` with the Skill tool enabled. Live-verified on Haiku: skill discovered, loaded, core definition quoted back | J1/J2 | Worker 2 | done |
| Tweak the skill's definition with the author: trigger-description wording, guidance content, when-to-load boundaries | J1/J2 | Worker 2 | in progress |
| Validate the explainer live: one Q&A at newcomer level and one at expert level over the same wiki topic (eval-harness scenario or scripted session); check calibration, no re-explaining, layered artifact depth, and that the skill gets loaded unprompted | J2 | — | todo |

| Task | Phase | Owner | Status |
|---|---|---|---|
| Decide how to drive Claude Code (Agent SDK vs. CLI) and how sessions map to explorations | 1 | — | todo |
| Expose the artifact tool to the LLM: create/update artifacts in the OpenUI representation | 1 | — | todo |
| Initial generation guidance: system-prompt material and artifact patterns for good explanation apps | 1 | — | todo |
| Tune the LLM's personality and role awareness: it's an exploration guide / co-author embedded in this app — not a generic coding assistant. It should know what the app is, the panes it's living in, its tools, and its role in each journey (explainer in J1, discussion partner in J2, fast editor in J3). Overlaps the wake-up-prompt audit (see Ideas below) — fold that in or sequence after it | 5 | — | todo |
| The `ui` tool must be able to edit ANY .oui file in the wiki, not just the one in the "new artifact" pane (needed for J4 reopen-and-continue-editing) | 4 | Worker 1 | done |
| Feed artifact interaction signals back to the LLM as context ("user keeps drilling into X") | 4 | — | todo |
| Improve default artifact quality via refined guidance (templates, design prompts) | 5 | — | todo |

## Session bridge (server)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Choose the web stack and scaffold the app + bridge | 1 | — | todo |
| Watch the artifacts directory and push updates to the artifact view | 1 | — | todo |
| **State parity: server/LLM can make any content-panel state change the front end can** (navigate to a file, select a tab, ...). Full chain: front-end controls keep their state in the KV store (D3) → store synced to the back end → back end applies incremental store updates via tools → front end reacts to store changes | 4 | Worker 1 | done |
| Wiki content hot-reload: when the LLM edits a wiki file, the content pane live-reloads if it's showing that file — file watcher on the wiki dir + server notification over the websocket channel | 2 | Worker 1 | done |
| Pre-warm the Claude CLI on first client connect: one minimal suppressed turn pays CLI boot + session init + prompt-cache write while the user is still typing (perf eval showed ~1.2–1.9s spawn-to-init, all CLI-side); `WARMUP=0` opts out (tests, experiments); "warming"/"ready" statuses on the wire. Verified: ask→UI 6.5s→4.8s on Haiku, zero leaked warm events. Known tradeoff: +1 uncached prompt pass per session; a user who sends within ~4s of connect queues behind the warm turn | J3 | The Optimizer | done |
| Bridge chat messages to the LLM session; stream responses back | 2 | — | todo |
| Persist conversation + artifact history per exploration session | 2 | — | todo |
| Design-conversation memory: cumulative history of the design conversation (LLM memory or dedicated component) | 3 | — | todo |

## Web app (shell, artifact view, chat pane)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Minimal UI shell with rendered artifact view, hot-reload on artifact change | 1 | — | todo |
| Chat pane alongside the artifact, with streaming, in-progress indicator, errors in chat, cancel/retry | 2 | — | todo |
| Support artifact updates mid-conversation without losing view state where possible | 2 | — | todo |
| Chat header cleanup: drop the session id and connected badge from the chat pane | 5 | Worker 2 | done |
| Markdown viewer upgrades: rehype-sanitize, rehype-slug, highlight.js, mermaid diagrams | 5 | Worker 2 | done |
| Home is a folder view, not README.md: excerpt of README.md at top with a &lt;more&gt; link that opens the full README, then a hierarchical list of the wiki's folders, markdown files, and .oui files, each linked to open the doc/OUI (subsumes the phase-6 "wiki browser" stretch task) | 5 | Worker 1 | done |
| Usability pass on the core loop: open wiki → generate → chat → refine | 5 | — | todo |
| Visual design pass on the app shell (layout, theming, dark mode) | 5 | — | todo |

## Multimodal collaboration

| Task | Phase | Owner | Status |
|---|---|---|---|
| Point-and-comment: select an artifact region and attach feedback | 3 | — | todo |
| Drawing/annotation overlay on the rendered artifact | 3 | Worker 2 | done |
| Screenshot round-trip: send the rendered (or marked-up) view back to the LLM | 3 | Worker 2 | done |
| Voice agent: spoken conversation about the content or the application | 3 | — | todo |
| Represent multimodal feedback in the LLM conversation (images, structured regions, transcripts) | 3 | — | todo |
| Keep text chat working as the universal fallback for every mode | 3 | — | todo |

## Wiki ingestion (stretch)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Drag-and-drop / file import into the wiki directory | 6 | — | todo |
| Importers for common bundles (a PR via `gh`, a URL list, a docs export) | 6 | — | todo |
| Normalization: LLM organizes raw dumps into a browsable structure | 6 | — | todo |
| Wiki browser in the web app | 6 | — | todo |

## Process & docs

| Task | Phase | Owner | Status |
|---|---|---|---|
| End-to-end smoke test: sample wiki → generated artifact → rendered in app | 1 | — | todo |
| Validate against two motivating examples (e.g., PR review, SEV investigation); note missing guidance | 4 | — | todo |
| Dogfood on a real task; log friction and fix top items | 5 | — | todo |
| Record architecture decisions in docs/decisions.md as they're made | — | — | in progress |

## Phases (roadmap)

The phase numbers used in the tables above, derived from [docs/proposal.md](docs/proposal.md). Each phase ends with something usable, so later phases can be reordered or cut without stranding work. (Formerly docs/tasks.md; its per-phase checklists live on as the rows above.)

1. **Artifact creation via tool use** — an LLM can create an artifact through tool use, and you can see it rendered
2. **Feedback chat** — a chat pane lets you steer the LLM, and the artifact updates in response
3. **Multimodal operations** — feedback channels richer than typed text (point-and-comment, drawing, screenshots, voice)
4. **Interactive data exploration** — artifacts stop being static pages and become exploration tools
5. **Look and feel** — the app feels good enough to use daily
6. **Wiki ingestion (stretch)** — getting information *into* the wiki is easy

## Ideas (holding bin)

Loose ends and ideas that aren't yet tasks — allowed to be messy. When one becomes real work, turn it into a row in a section above (claim it) and delete it here. (Formerly docs/TODO.md.)

- **Rendering polish: whitespace, colors, styling.** The artifact rendering still isn't great whitespace-wise, and we need a real answer for colors and styling beyond the current per-artifact CSS (relates to D4 hooks, the deferred page-theming/style-isolation question, and the sandboxing task).
- **Audit the LLM's wake-up context.** Read the full startup context end to end — ui-library prompt + CLI defaults + MCP tool descriptions — and trim and tune (the invocation report and the prompt-removal/prompt-diet rows above chip at this; this is the umbrella).
- **Update the architecture diagram with Mermaid?** Idea: redo/refresh the architecture diagram as a Mermaid diagram (still a question mark, not committed).
- **Folders / separate information spaces.** Everything currently serves from one flat `docs/` — which is also the project's own documentation. Need some notion of folders or per-exploration spaces so bundles stay separate (the architecture's original "one directory per exploration topic" idea; also keeps project docs from mixing into the user's wiki content).

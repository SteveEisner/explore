# Tasks

The live task tracker, organized by component area (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). The phase roadmap lives in [docs/tasks.md](docs/tasks.md); phase numbers here refer to it.

**How to use:** claim a task by putting your name in Owner. Statuses: `todo` · `in progress` · `blocked` · `done`. When a task reaches `done`, log it in the worklog (see AGENTS.md).

## Wiki (storage & conventions)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Define the wiki convention: one plain file directory per exploration topic; Markdown by convention, any file type allowed | 1 | — | todo |
| Create sample wikis for testing and demos (e.g., a small doc bundle, a PR, SEV data) | 1 | — | todo |

## Wiki API (backend endpoints)

| Task | Phase | Owner | Status |
|---|---|---|---|
| List endpoint: enumerate wiki files with paths + basic metadata | 1 | — | todo |
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
| Raw-HTML escape hatch sandboxing model (Content renders unsandboxed today) | 1 | — | todo |
| Hierarchical KV state store for component state, host-readable/writable, declared via manifest (decisions.md D3); wire Gallery `stateKey` to it | 4 | — | todo |
| Context/audience switcher component with context-variant text (from pr-review.html analysis) | 4 | — | todo |
| Artifact runtime API: let artifacts query the wiki on demand (via the Wiki API) | 4 | — | todo |
| Grow the vocabulary with interactive exploration elements (filters, drill-downs, timelines, diagrams, quizzes), guided by escape-hatch usage | 4 | — | todo |

## Intelligence & generation guidance (Claude Code)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Decide how to drive Claude Code (Agent SDK vs. CLI) and how sessions map to explorations | 1 | — | todo |
| Expose the artifact tool to the LLM: create/update artifacts in the OpenUI representation | 1 | — | todo |
| Initial generation guidance: system-prompt material and artifact patterns for good explanation apps | 1 | — | todo |
| Feed artifact interaction signals back to the LLM as context ("user keeps drilling into X") | 4 | — | todo |
| Improve default artifact quality via refined guidance (templates, design prompts) | 5 | — | todo |

## Session bridge (server)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Choose the web stack and scaffold the app + bridge | 1 | — | todo |
| Watch the artifacts directory and push updates to the artifact view | 1 | — | todo |
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

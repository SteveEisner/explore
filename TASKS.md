# Tasks

The single task list: live tracker organized by component area (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), plus the phase roadmap and the idea holding bin at the bottom. Phase numbers in the tables refer to the [Phases](#phases-roadmap) section.

**How to use:** claim a task by putting your name in Owner. Statuses: `todo` · `in progress` · `blocked` · `done`. When a task reaches `done`, log it in the worklog (see AGENTS.md).

## Next session: Phase 4 — interactive exploration

The declared focus for the next two-hour session: interactive exploration elements (the vocabulary growing into quizzes, filters, drill-downs, timelines; interaction signals feeding refinement). Three prerequisites feed it from tonight's work:

- **(a) Faster prompt loops** — the Optimizer's perf instrumentation + latency grind (J3 crunch track).
- **(b) A better understanding of clear explaining** — J1/J2 guidance findings (what makes generated explanations actually land).
- **(c) A voice model** — expected to take significant time; start early. (Elevated from the Multimodal backlog; now specced and broken down in the [Voice agent (realtime editing)](#voice-agent-realtime-editing) section, decisions.md D5.)

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
| Align TypeScript versions across workspaces (client `~6.0.2` vs server `^5.8.0`) | build | from the Cleaner's review; deferred from the 2026-07-11 blitz — needs `npm install` + `client/package.json`/lockfile edits, which were carrying in-flight typeset/oui-embed work at the time (now committed) |
| Teach the generation prompts about `<oui-embed src="file.oui">` | prompts | wiki markdown can embed live OpenUI apps (2026-07-11); the LLM doesn't know — add to server/prompts wiki guidance. Note: always use an explicit closing tag |
| Container-responsive artifact components | openui | Gallery/Aside fixed pixel nav/aside widths collapse to one-word lines in narrow containers (found via oui-embed in a 48rem column; worked around with a 72rem breakout). Consider container queries or minmax() so artifacts degrade gracefully at any width |
| Chat markdown vs typeset consistency check | web app | chat keeps `prose prose-sm` while file viewing moved to `typeset typeset-docs`; the Cleaner's backtick-chip override targets `.prose` only — decide whether chat migrates to a `typeset-chat` preset |

*2026-07-11 blitz (Cleaner): five items cleared — docs/meta untracking, JSONL logger typing, client README rewrite, inline-backtick rendering, horizontal window pan. See the worklog.*

## Crunch tracks (non-interactive; run unattended once the isolated instance exists)

| Task | Journey | Owner | Status |
|---|---|---|---|
| **UI-generation performance eval — instrumentation + eval.** (1) Per-sub-session performance logs: from the moment a command is invoked until the LLM signals all work complete, every event it generates is appended — with wall-clock timestamp and delta-from-invocation — to a file dedicated to that exact sub-session, written into the LLM's private sandbox directory (the server session's cwd), e.g. `sandbox/perf/<turn-id>.jsonl`. Events to cover: command invoked, CLI spawn/resume, first stream token, each tool call start/result (ui/state/vault/wiki), each ui:spec chunk, message boundaries, and the final result/completion signal. Sandbox placement is deliberate: the LLM (or a side eval agent) can read its own timing files. (2) The eval itself: run scripted generation/edit prompts, analyze the per-turn files — time-to-first-token, time-to-first-ui-statement, time-to-render-complete, tokens/turn — and report where the time goes. **Progress + early data (2026-07-07):** harness live in `eval/` (per-run isolated server, ws-driven, byte-exact spec check; headline metric `uiSpecMs` = ask→complete ui call); spawn-to-init decomposed — ~1.2–1.3s, all CLI boot, not MCP, insensitive to our tool/prompt payload — and countered by the shipped connect-time pre-warm (ask→UI 6.5s→4.8s on Haiku; warm turn ~4.2s from connect). Early model data, fixed scenario, warm, 2 reps, all byte-exact (`eval/results/sweep-models/runs.jsonl` + `warm-check`): Opus 4.7 UI-done 3.2–4.0s / $0.17–0.28 per session; Opus 4.8 4.4–7.0s / ~$0.12; Fable 5 5.8–6.7s / $0.27–0.42; Haiku 4.5 4.8s / ~$0.04. Turn keeps running ~4–6s *after* UI-complete (tool-result round trip + wrap-up) — a candidate latency prize. **Sweep complete (2026-07-11):** full `eval/sweep.sh` ran unattended — 56/56 runs ok, every spec byte-exact, $7.29 total; where-the-time-goes report at [eval/sweep-report.md](eval/sweep-report.md). Headlines: Opus 4.8 ≈ Sonnet 5 fastest (UI-done 2.8–2.9s fixed / 5.2–5.5s grounded, ~$0.12); effort and speed-hint are measured nulls; slim prompt is −25% cost with no latency win; post-UI tail shrinks to 1.6–2.4s on the new models; grounded wiki-read (~2.5s) is the biggest remaining addressable chunk. Downstream Optimize tasks unblocked. Remaining scope here: item (1), the per-sub-session sandbox perf logs. | J3 | The Optimizer | in progress |
| Optimize UI-interaction time: grind on the biggest contributors the performance eval identifies — per [eval/sweep-report.md](eval/sweep-report.md) (incl. 2026-07-12 follow-up): (1) default generation model → Opus 4.8 / Sonnet 5; (2) **wiki preload proven**: inlining the wiki page into the system prompt cuts grounded ask→UI 7.7s→4.4s (opus) / 5.2s→4.4s (sonnet), skips the read turn (3→2), byte-exact, slightly cheaper — productionize page selection at connect; (3) client-side progressive spec rendering worth ~0.8–1.4s of perceived latency (`uiFirstDeltaMs` already measured); (4) fast mode blocked on CLI (no headless flag — recheck on upgrades). Cache verified healthy; post-UI tail is structural (skip); effort/speed-hint are nulls | J3 | The Optimizer | todo |
| Optimize model cost: measure tokens/turn from the JSONL log; try cheaper models per role (edits vs. generation vs. chat); quality-check against the benchmark. Early per-session costs from the eval row above: Haiku ~$0.04, Opus 4.8 ~$0.12, Opus 4.7 $0.17–0.28, Fable $0.27–0.42 — all produced identical byte-exact output on the fixed scenario, so cheap-model-per-role looks promising; note pre-warm adds one uncached prompt pass per session. Full-sweep costs (2026-07-11, [eval/sweep-report.md](eval/sweep-report.md)): Haiku $0.04, Sonnet 5 / Opus 4.8 ~$0.12, Opus 4.7 ~$0.22, Fable $0.33; slim prompt −25% on top (needs quality pass) | bar | The Optimizer | todo |
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
| Read endpoint: chunked line reads (offset + limit), never whole-doc. Now on the voice-agent critical path — implemented via the wiki service layer (Voice agent row 2) | 1 | — | todo |
| Create endpoint: new file with given content | 1 | — | todo |
| Rename endpoint: rename/move within the wiki | 1 | — | todo |
| Edit endpoint: `str_replace`-style exact search/replace per decisions.md D1, with loud, distinguishable errors. Now on the voice-agent critical path — implemented via the wiki service layer (Voice agent row 2) | 1 | — | todo |

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
| **P2.** Feed artifact interaction signals back to the LLM as context ("user keeps drilling into X"). Cheapest version: the D3 store already syncs every click to the server — when a user message goes to the Claude session, prepend a compact digest of store activity since the last turn ("opened flow.oui, flipped to 'risks' 3×, set context to expert"). No new UI or protocol; the voice agent's app-state tool can serve the same digest | 4 | — | todo |
| Improve default artifact quality via refined guidance (templates, design prompts) | 5 | — | todo |

## Session bridge (server)

| Task | Phase | Owner | Status |
|---|---|---|---|
| Choose the web stack and scaffold the app + bridge | 1 | — | todo |
| Watch the artifacts directory and push updates to the artifact view | 1 | — | todo |
| **State parity: server/LLM can make any content-panel state change the front end can** (navigate to a file, select a tab, ...). Full chain: front-end controls keep their state in the KV store (D3) → store synced to the back end → back end applies incremental store updates via tools → front end reacts to store changes | 4 | Worker 1 | done |
| TODO (from Worker 1): test coverage for the state/set_state/edit_artifact dial-back chain on isolated instances — the ui MCP server used to dial PORT=0 and silently fail (fixed via claude.appPort); an eval scenario or test exercising MCP→server→browser state exchange would catch regressions | bar | — | todo |
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
| Browser back-button navigation: pressing back currently loses the entire app (SPA state gone). Integrate in-app navigation (doc/OUI views, home) with browser history so back/forward move between views instead of leaving the app | 5 | — | todo |
| Usability pass on the core loop: open wiki → generate → chat → refine | 5 | — | todo |
| Visual design pass on the app shell (layout, theming, dark mode) | 5 | — | todo |

## Voice agent (realtime editing)

The realtime voice collaborator (decisions.md D5): a mic button in the chat sidebar opens a live conversation with OpenAI gpt-realtime (latest Realtime API); the model gets the server APIs as tools (read/search/edit wiki docs, edit artifacts, get/set app state, request a screenshot) plus an `ask_artifact_agent` delegation tool to the Claude session with FAST/SMART model modes. To the user it is one collaborator: delegation is presented as "working on that…", never as a handoff — persona set by the guidance document (row 7). Rows ordered roughly by dependency; 1–3 are the critical path, 4–8 can proceed in parallel once the tool registry (row 3) has a skeleton.

| Task | Journey | Owner | Status |
|---|---|---|---|
| 1. Voice session endpoint: `POST /api/voice/session` mints an ephemeral gpt-realtime client secret from `OPENAI_API_KEY` (Steve supplies the token; key never reaches the browser); target the **latest Realtime API version** — verify current endpoint/session shape against OpenAI docs at build time, don't copy older tutorials. Session config lives server-side — model, voice, the guidance document (row 7) as instructions, and the tool schemas from the registry (row 3); include the idle-timeout policy (open mic bills per minute) | J3 | Worker 2 | in progress |
| 2. Wiki service layer: extract read/search/edit into an internal server module shared by the HTTP endpoints and the voice tool executor — this implements the dormant Wiki API rows (chunked read; D1 `str_replace` edit with loud no-match/multi-match errors). Search: decide grep-based vs. driving the vault MCP from the server (vault search is currently reachable only from the CLI session, and untested) | J3/bar | Worker 2 | in progress |
| 3. `voice:tool` bridge: ws message family (call/result/error with correlation ids); a single tool registry drives both the schemas sent to OpenAI (row 1) and the server executor mapping tool names → wiki service, state store, artifact edit/save internals | J3 | Worker 2 | in progress |
| 4. Mic button + WebRTC session (client): toggle in the chat sidebar; getUserMedia + WebRTC to OpenAI using the ephemeral token; open conversation with VAD and barge-in; visible session states (listening / speaking / running a tool); idle auto-close | J3 | Worker 2 | in progress |
| 5. Front-end tools (client): screenshot (reuse the existing round-trip; gpt-realtime accepts image input) and app-state read — these execute locally on the data channel, no server hop; state *writes* go through the D3 chain like everything else | J3 | Worker 2 | in progress |
| 6. Delegation: `ask_artifact_agent` hands a prompt to the Claude session via ChatService and narrates progress; takes a **mode** parameter — `fast` or `smart` — that selects the Claude model for the delegated turn (needs per-call model selection in the bridge; extends the model-selection task, and the perf eval's model matrix calibrates which model each mode gets — early data points at Haiku-class for fast, Opus-class for smart). Define sequencing vs. user-typed chat (CLI turns are serial — a queued voice request must not silently swallow a typed one) and how completion is announced | J3/J2 | Worker 2 | in progress |
| 7. Voice-agent guidance document (e.g. `server/prompts/voice-agent.md`), injected as session instructions at every session start (row 1): the persona — one collaborator; it knows the back-end agent is more powerful and delegates accordingly, but presents delegated work as its own ("working on that…"), never as a handoff to another LLM — plus when to answer directly vs. edit vs. delegate, fast-vs-smart guidance, grounding rules (facts from the wiki, never invented), and brevity norms for spoken replies | J2/J3 | Worker 2 | in progress |
| 8. Transcript integration: voice utterances and tool actions logged into the chat pane and event log, so the user and the Claude session can see what voice changed (mitigates the two-intelligences memory split, D5). Use the **D6 feedback envelope** as the message shape — don't invent a voice-specific format (see the Multimodal row for the envelope definition) | J2 | Worker 2 | in progress |
| 9. Voice latency + cost eval: harness scenario timing speech-end → tool-complete → first response audio, plus $/audio-minute; extends the perf program | J3 | The Optimizer | todo |

## Multimodal collaboration

| Task | Phase | Owner | Status |
|---|---|---|---|
| **P1.** Point-and-comment, addressed by statement name (D4), not pixels: click a rendered component → attach a comment → the LLM receives a D6 envelope `{text, statementRef, stateSnapshot}` — feedback arrives pre-addressed to an edit target it can act on directly (statement names are already the merge key for all three edit paths). Covers the core "this part — change it" gesture; pairs with voice ("make *this* shorter" while clicking) | 3 | — | todo |
| Drawing/annotation overlay on the rendered artifact | 3 | Worker 2 | done |
| Screenshot round-trip: send the rendered (or marked-up) view back to the LLM | 3 | Worker 2 | done |
| Voice agent: spoken conversation about the content or the application — expanded into the [Voice agent (realtime editing)](#voice-agent-realtime-editing) section above (decisions.md D5) | 3 | — | in progress |
| Represent multimodal feedback in the LLM conversation — **shape decided, decisions.md D6**: one envelope `{text?, screenshot?, statementRef?, stateSnapshot}` for every channel; `stateSnapshot` (D3 store at capture time) always attached so feedback is self-locating. Implement the envelope type + chat-pane rendering (optional adornments: thumbnail, "re: statement" chip, state summary); migrate the screenshot round-trip to it; P1 point-and-comment and voice transcript integration emit it from the start | 3 | — | todo |
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

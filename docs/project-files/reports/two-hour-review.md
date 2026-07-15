# Two-Hour Review — 2026-07-07

What got built in the first ~2 hours of work (two sessions, 15:55–16:13 and 17:11–18:50, plus parallel worker agents), measured against [proposal.md](../design/proposal.md).

## Verdict

The proposal's six phases were scoped as sequential milestones; after one two-hour day, **phases 1–2 are functionally complete, phase 3 is substantially landed, and the project has grown a design-principles layer the proposal didn't anticipate**. The big unvalidated item is the core hypothesis itself: no exploration has yet run end-to-end from *a wiki of source material* to *a generated explanation app*. Everything proven so far proves the pipeline can render and revise such an app — not that the LLM can author a good one from raw material.

## Goals vs. reality, phase by phase

**Phase 1 — artifact via tool use: done.** Client/server scaffold exists; Claude Code is driven as a session with a `ui` MCP tool; OpenUI Lang programs stream into a live-rendering panel. The medium decision (D2) went from "experiment" to "working": a ~200-statement artifact parses and renders.

**Phase 2 — feedback chat: done.** Streaming chat pane wired to the LLM session, with edit-mode artifact updates mid-conversation (unchanged statements persist). This was the phase-2 goal almost verbatim.

**Phase 3 — multimodal: substantially landed, ahead of schedule.** Drawing overlay (document-anchored strokes), screenshot round-trip verified end-to-end (Claude described the annotated view back), images flowing as content blocks. Voice agent and design-conversation memory remain.

**Phase 4 — interactive exploration: partial.** Interactive components (Tabs, Gallery selection) and integer context levels exist; the wiki runtime API, D3 state store, and interaction-signals-to-LLM do not.

**Phase 5 — look & feel: opportunistic progress** (markdown pipeline with sanitization/highlighting/mermaid, chat chrome cleanup), no holistic pass.

**Phase 6 — ingestion: not started** (stretch goal; fine).

## The novel bets — how they're doing

The proposal staked novelty on two things: *better artifact generation through guidance* and *better collaboration mechanisms*.

1. **The HTML-editing-protocol experiment is yielding real findings.** In one day: D1 (str_replace for prose, research-backed), D2 (OpenUI as medium, now render-validated), D3 (hierarchical KV state store, host-drivable — extracted from the work archetype's best idea), and D4 (structural components are named editing points — no chrome, no behavior unless earned). D4 came from practice, not theory: the Comparison component's hardcoded styling demonstrably fought content it should have hosted. A second practical finding: OpenUI Lang's positional args mean vocabulary props can only be appended, a real versioning constraint.
2. **The benchmark methodology worked.** Translating a real, hand-built work artifact (pr-502764-review.html) into the vocabulary was the forcing function for almost every component decision — what to add (Gallery, Aside, Comparison), what to strip (chrome), what's still missing (context switcher, style isolation). "Escape-hatch usage marks vocabulary gaps" proved out.
3. **Collaboration mechanisms are ahead of the plan** (screenshot + drawing feedback already round-tripping), but they've been tested as *plumbing*, not yet as *steering* — no session has used them to actually refine an explanation.

## What's not yet proven

- **The core loop, end to end.** Gather material → LLM explores it → LLM generates the explanation app → author refines it. The benchmark artifact was hand-translated from a finished explainer, not generated from source material. This is the single most important next test, and it's cheap: make a small wiki (e.g. the PR diff and files behind the archetype), ask the in-app Claude for an exploration, and grade the result.
- **Generation guidance at scale.** The prompt rules exist (component contract, D4, context levels), but no template/pattern library, and no validation against a second motivating example (SEV investigation, study guide).
- **Wiki pillar.** Untouched beyond convention: no API endpoints (list/read/create/rename/edit per D1), no sample wikis in-repo.
- **Deferred with eyes open:** context switcher UI (levels 1–3 content currently unreachable), D3 store implementation, Content sandboxing/style isolation, page theming.

## Process observations

- The docs discipline (proposal → architecture → decisions → tasks → timestamped worklog) held up and paid off — every design change today traced back to a recorded decision, and the worklog reconstructed the time budget accurately.
- Multi-agent parallelism worked: worker agents landed phases 2–3 plumbing while the vocabulary work proceeded, coordinating through TASKS.md ownership. One real collision (.oui syntax normalization) resolved cleanly in the workers' favor — and the collision itself surfaced a fact about the parser.
- The two-hour limit was respected: ~1h55m of tracked work.

## Inventory: brought in vs. built

### Brought in (existing assets and tools)

- **A hand-built HTML artifact from work** — `pr-502764-review.html` (self-contained original) and `pr-review.html` (company-hosted conversion). Served as the archetype and benchmark that drove nearly every vocabulary decision; the hosted version contributed the state-manifest pattern behind D3.
- **Claude Code as a parallel workforce** — four-plus concurrent sessions with distinct roles: scaffolder, docs/vocabulary architect, Worker 2 (UI/multimodal), Worker 3 (sandboxing), coordinated through TASKS.md ownership.
- **Personal "clarity" skills** — code/comment/PR/test-clarity skills imported from `~/projects/dotfiles` and installed as project skills.
- **The OpenUI standard** — `@openuidev/lang-core`, `react-lang`, `react-ui`; agents read openui.com docs rather than inventing the medium.
- **Obsidian** — the wiki directory doubles as an Obsidian vault (`.obsidian/` in repo).
- **A third-party MCP server** — `@wirux/mcp-markdown-vault`, wired in so the sandboxed LLM can read/edit the wiki through MCP only.
- **Commodity stack** — Vite, React 19, TypeScript, Tailwind 4, shadcn/ui, zod, ws, MCP SDK; plus targeted libraries chosen per feature: perfect-freehand (drawing), html-to-image (screenshots), react-markdown + rehype-sanitize/slug, highlight.js, mermaid.
- **Published research** — aider's edit-format benchmarks, an arXiv agent-architecture taxonomy, and an independent editing-strategies benchmark, used to settle D1 instead of taste.
- **Prior design practice from work** — the audience/context-picker concept and per-level prose variants, imported as the context-level feature.

### Built (during the two hours)

- **The application**: Vite/React front end + Node back end driving a Claude Code session over websocket; `ui` MCP tool streaming OpenUI Lang into a live artifact panel; wiki file serving with a markdown viewer, README index, filename-selector toolbar, and popup chat sidebar.
- **The component vocabulary**: six D4-compliant structural components (Stack, Content, Tabs, Gallery, Aside, Comparison) with hook classes and layout props, mirrored across client renderers and the server's prompt-generating schemas.
- **The context-level system**: integer levels, 0 always present, per-component gating, prompt rules teaching the convention.
- **The benchmark artifact**: `pr-502764-review.oui` (~200 statements) — the work explainer expressed in the vocabulary, validated end-to-end in the app.
- **Multimodal feedback plumbing**: document-anchored drawing overlay; screenshot round-trip into chat as image content blocks (verified: the LLM described the annotated view back).
- **Safety and observability**: sandboxed server LLM (MCP-only file access), JSONL event log covering back-end and front-end events, front-end-state tool for the LLM (open file, cursor/selection).
- **The docs corpus**: proposal, architecture, decision log D1–D4, phase roadmap, live task tracker, timestamped worklog, this review.

### Techniques

- **Benchmark-driven design** — translate a real artifact into the medium; every friction point becomes a component decision; escape-hatch usage marks vocabulary gaps.
- **Docs-first, decisions-as-records** — each design choice logged with rationale and revisit conditions before/while building; AGENTS.md makes the conventions self-enforcing for agents.
- **Multi-agent parallelism with lightweight coordination** — named workers, self-claimed tasks, worklog as shared memory; one syntax collision all day, and it surfaced a parser fact.
- **Research-backed decisions** — web evidence settled the edit-format debate (D1) in minutes.
- **Principles extracted from practice** — D4 came from watching a styled component fail to host real content, then was applied retroactively to the whole vocabulary.
- **Dogfooding the product on itself** — the app's own chat sessions tested generation (demo Stacks/Tabs, an incremental edit patch, free-form "build me a dashboard" runs), and a screenshot of the rendered benchmark steered a fix.
- **Timeboxing with an audit trail** — two-hour limit, break/resume entries, timestamped milestones; the time accounting in this review came straight from the log.

## Suggested next session

1. **Run the real experiment**: sample wiki → generated exploration → grade it against the hand-built archetype. This tests the hypothesis everything else serves.
2. Context switcher component (with named levels living in the artifact manifest, per D3) so gated depth becomes reachable.
3. Wiki API endpoints (D1) — well-specified, low-risk, unblocks the Phase 4 runtime API.

# Task Breakdown

Derived from the phases in [proposal.md](proposal.md). Each phase ends with something usable, so later phases can be reordered or cut without stranding work.

> **Note:** this file is the phase *roadmap*. Day-to-day task tracking (owners, statuses) lives in the root-level [TASKS.md](../TASKS.md), organized by component area.

## Phase 1 — Artifact creation via tool use

Goal: an LLM can create an artifact through tool use, and you can see it rendered.

- [ ] Choose the stack and scaffold the web app (artifact host + minimal UI shell)
- [ ] Define the wiki convention: a plain file directory the LLM reads as its knowledge source (Markdown by convention, not required)
- [ ] Expose the wiki via backend APIs: list files, chunked line reads, create, rename, and `str_replace`-style edit (see decisions.md D1)
- [ ] Evaluate and integrate OpenUI as the artifact medium (see decisions.md D2): library setup, rendering pipeline, on-disk representation
- [ ] Define the initial component vocabulary for exploration apps (plus the raw-HTML escape hatch and its sandboxing)
- [ ] Expose an artifact tool to the LLM (create/update an artifact in the OpenUI representation), wired to Claude Code as the intelligence layer
- [ ] Render the artifact in the web app, refreshing when it changes
- [ ] End-to-end smoke test: point it at a sample wiki (e.g., a small doc bundle), ask for an explanation app, see it render

## Phase 2 — Feedback chat

Goal: a chat pane lets you steer the LLM, and the artifact updates in response.

- [ ] Add a chat UI alongside the rendered artifact
- [ ] Bridge chat messages to the LLM session and stream responses back
- [ ] Support artifact updates mid-conversation (LLM edits, UI picks up the change without losing state where possible)
- [ ] Persist the conversation + artifact history per exploration session
- [ ] Handle the basics: in-progress indicator, errors surfaced in chat, cancel/retry

## Phase 3 — Multimodal operations

Goal: feedback channels richer than typed text.

- [ ] Point-and-comment: click/select a region of the artifact and attach feedback to it
- [ ] Drawing/annotation overlay: draw on the rendered artifact (circle, sketch, markup) as feedback
- [ ] Screenshot round-trip: send the rendered artifact (or a marked-up selection) back to the LLM so it sees what you see
- [ ] Voice agent: spoken conversation about the content or the application (start with one direction and expand)
- [ ] Design-conversation memory: persist the design-conversation history (LLM memory or a dedicated component) so refinement is cumulative
- [ ] Represent multimodal feedback in the LLM conversation (tool results / image content blocks / transcripts)
- [ ] Keep text chat working as the universal fallback for every mode

## Phase 4 — Interactive data exploration

Goal: artifacts stop being static pages and become exploration tools.

- [ ] Give artifacts a runtime API to query the wiki (fetch files/data on demand rather than baking everything in)
- [ ] Grow the component vocabulary with interactive exploration elements (filters, drill-downs, timelines, diagrams, quizzes) — escape-hatch usage from earlier phases points at the gaps
- [ ] Let interactions in the artifact flow back to the LLM as context ("user keeps drilling into X — explain it deeper")
- [ ] Validate against at least two motivating examples (e.g., PR review and SEV investigation) and note what guidance was missing

## Phase 5 — Look and feel

Goal: the app feels good enough to use daily.

- [ ] Usability pass on the core loop: open wiki → generate → chat → refine
- [ ] Visual design pass on the app shell (layout, theming, dark mode)
- [ ] Improve default artifact quality via generation guidance (design/system prompts, templates)
- [ ] Dogfood on a real task from the motivating examples; log friction and fix the top items

## Phase 6 — Wiki ingestion (stretch)

Goal: getting information *into* the wiki is easy.

- [ ] Drag-and-drop / file import into the wiki directory
- [ ] Importers for common bundles (a PR via `gh`, a URL list, a docs export)
- [ ] Normalization step: LLM organizes and indexes raw dumps into a browsable structure
- [ ] Wiki browser in the web app

## Cross-cutting (ongoing)

- [ ] Keep a running `docs/decisions.md` for architecture choices as they're made
- [ ] Sample wikis checked into the repo for testing and demos

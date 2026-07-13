# Wiki

Project documentation, served by the back end at `/docs/*` and viewable in
the app's main panel via the toolbar.

## Planning & design

- [proposal.md](/docs/design/proposal.md) — what we're building and why
- [journeys.md](/docs/design/journeys.md) — the customer journeys (J0–J4) we demo,
  test, and harden; the unit of work
- [ARCHITECTURE.md](/docs/design/ARCHITECTURE.md) — system design: client, server,
  websocket protocol, the Claude CLI session, and the OpenUI `ui` tool
- [decisions.md](/docs/design/decisions.md) — running log of design decisions
- [explaining-with-clarity.md](/docs/design/explaining-with-clarity.md) — the clarity
  doctrine behind the LLM's `explaining-clarity` skill

## Reviews & reports

- [two-hour-review.md](/docs/reports/two-hour-review.md) — what got built in the first
  ~2 hours, measured against the proposal
- [five-hour-review.md](/docs/reports/five-hour-review.md) — day one end to end, with
  the corrected time accounting from the session logs
- [llm-invocation-report.md](/docs/reports/llm-invocation-report.md) — every layer the
  model receives before it responds (flags, prompts, tool schemas)

## Worklogs

- [worklog-2026-07-07.md](/docs/worklogs/worklog-2026-07-07.md) — day-by-day notes
- [worklog-2026-07-11.md](/docs/worklogs/worklog-2026-07-11.md) — day-by-day notes

## Artifacts

- [pr-502764-review.oui](/docs/examples/pr-502764-review/pr-502764-review.oui) — the benchmark OpenUI
  document: an interactive PR walkthrough rendered by the main-panel viewer
- [five-hour-review.oui](/docs/reports/six-hour-review.oui) — "Where the Time Went":
  an interactive dashboard of day one's time and per-feature build cost
- [pr-502764-review.html](/docs/examples/pr-502764-review/pr-502764-review.html) — the hand-built
  original the `.oui` benchmark was translated from (the archetype)

## File types

- `.md` files render as markdown in the viewer.
- `.oui` files are [OpenUI Lang](https://openui.com/docs/openui-lang)
  programs rendered with the app's component library (Stack, Content, Tabs,
  Gallery, Aside, Comparison). Remember: component arguments are
  positional — object literals only appear inside prop values.
- `.html` files are served as-is.

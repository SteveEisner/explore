# Wiki

Project documentation, served by the back end at `/docs/*` and viewable in
the app's main panel via the toolbar.

## Contents

- [proposal.md](/docs/proposal.md) — what we're building and why
- [ARCHITECTURE.md](/docs/ARCHITECTURE.md) — system design: client, server,
  websocket protocol, the Claude CLI session, and the OpenUI `ui` tool
- [decisions.md](/docs/decisions.md) — running log of design decisions
- [tasks.md](/docs/tasks.md) / [TASKS.md](/TASKS.md) — work tracking
- [worklog-2026-07-07.md](/docs/worklog-2026-07-07.md) — day-by-day notes
- [pr-review.oui](/docs/pr-review.oui) — sample OpenUI document: an
  interactive PR walkthrough rendered by the main-panel viewer

## File types

- `.md` files render as markdown in the viewer.
- `.oui` files are [OpenUI Lang](https://openui.com/docs/openui-lang)
  programs rendered with the app's component library (Stack, Content, Tabs,
  Gallery, Aside, Comparison). Remember: component arguments are
  positional — object literals only appear inside prop values.

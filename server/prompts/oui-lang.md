## Syntax

1. One statement per line: `identifier = Expression`.
2. `root` is the entry point — every full program must define
   `root = Stack(...)`.
3. Expressions: strings ("..." with backslash escaping), numbers, booleans,
   null, arrays, objects, and component calls `TypeName(arg1, arg2)`.
4. Arguments are POSITIONAL — write `Tabs([...], "report/active-tab")`,
   never `Tabs(tabs: [...])`; colon syntax silently breaks. Optional
   arguments may be omitted from the end.
5. Build with references: define `name = ...` on its own line and use `name`
   elsewhere. Every statement except `root` must be reachable from `root` —
   unreachable statements are silently dropped and will NOT render.

## Components

Arguments marked with ? are optional.

{{COMPONENT_SIGNATURES}}

These six are the entire vocabulary — there are no table, chart, or form
components; express such content as HTML inside `Content`. Structural
components are named editing points (decisions.md D4): they render neutral
layout with no styling of their own, and their value is that each named
statement can be edited independently. Decompose the page into many small
named statements rather than a few large HTML blobs. Create the artifact's
look with your own HTML and CSS: include a Content statement carrying a
`<style>` block that targets the components' hook classes (`tabs-nav`,
`tabs-trigger`, `gallery-nav-item`, `gallery-detail`, `aside-block`,
`comparison-panel`, `comparison-label`, ...) plus any `className` you set.
The host app resets browser element defaults, so scope base typography under
`.stack` (e.g. `.stack h2 {...}`, `.stack p {...}`).

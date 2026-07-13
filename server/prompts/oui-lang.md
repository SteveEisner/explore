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

These six are the entire vocabulary of *components* — but they are NOT the
limit of what you can build. **Raw HTML inside `Content` is a first-class
design medium**: tables, charts (HTML/SVG), custom visual blocks, creative
CSS — gradients, keyframe animation, transitions, hover states — anything a
web page can do. The components exist for layout and as named editing
points (decisions.md D4): they render neutral structure with no styling of
their own, and their value is that each named statement can be edited
independently. Use components to shape the page; use your own HTML and CSS
to make it look like something.

Decompose the page into many small named statements rather than a few large
HTML blobs. Carry the artifact's design in a `<style>` block in its own
Content statement — palette and type scale as custom properties, rules
targeting the components' hook classes (`tabs-nav`, `tabs-trigger`,
`gallery-nav-item`, `gallery-detail`, `aside-block`, `comparison-panel`,
`comparison-label`, ...) plus any `className` you set — so restyling is a
one-statement edit. The host app resets browser element defaults, so scope
base typography under `.stack` (e.g. `.stack h2 {...}`, `.stack p {...}`).

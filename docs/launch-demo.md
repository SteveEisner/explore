# Launch Demo

```oui
root = Stack([styles, header, tour])

styles = Content("<style>.stack { font: 15px/1.5 -apple-system, sans-serif; } .stack h2 { margin: 0 0 6px; font-size: 22px; } .stack p { margin: 0 0 10px; color: #4a5560; } .stack .hero { padding: 18px 20px; } .tabs-nav { padding: 0 20px; } .tabs-trigger { border: 1px solid #c9d2d9; border-right: 0; padding: 5px 12px; background: transparent; font: inherit; } .tabs-trigger:last-child { border-right: 1px solid #c9d2d9; } .tabs-trigger.active { background: rgba(31,111,208,.1); box-shadow: inset 0 -2px 0 #1f6fd0; } .tabs-panel { padding: 14px 20px; }</style>")

header = Content("<div class='hero'><h2>Launch Demo</h2><p>A small artifact born from the create_doc tool, embedded in the page that describes it.</p></div>")

tour = Tabs([
  {label: "The loop", content: [loopTab]},
  {label: "The preview", content: [previewTab]},
  {label: "The launch", content: [launchTab]}
])

loopTab = Content("<p>Agent creates the doc, navigates to it, writes the prose, then creates this artifact — four tool calls, no hands.</p>")

previewTab = Content("<p>In the document you are seeing this scaled down to the reading column, under a shader that says: look, don't touch.</p>")

launchTab = Content("<p>Expanded, this artifact owns the whole content panel. The Source button drops you back to the page, exactly where you left it.</p>")
```

This page was created and written entirely by the front-end agent's
tools: `create_doc` → `set_app_state` (navigate) → `edit_doc` →
`create_doc` again for the artifact embedded above.

## What to look at

- The artifact above renders as a **scaled preview** inside the reading margins
- A shader marks it *ready to launch* — clicks there only Expand
- Expand takes over the content panel; **Source** brings this page back, scroll intact

```ts
const preview = { width: 1024, scale: "fit-to-column", aspect: "kept" };
```

Text below the embed keeps flowing in the typeset reading layout.

# Inline artifacts in wiki pages

The canonical artifact is an OpenUI block **inline in a markdown page**
(decisions.md D8): a fenced code block with language `oui`. It renders in
place as a launchable preview — scaled to the reading column, shaded, with
Expand as the one action — and maximizes over the content panel while the
page stays open underneath.

## Live example

```oui
root = Stack([styles, hero, tour])
styles = Content("<style>.stack { font: 15px/1.5 -apple-system, sans-serif; } .stack h2 { margin: 0 0 6px; font-size: 22px; } .stack p { margin: 0 0 10px; color: #4a5560; } .stack .hero { padding: 18px 20px; } .tabs-nav { padding: 0 20px; } .tabs-trigger { border: 1px solid #c9d2d9; border-right: 0; padding: 5px 12px; background: transparent; font: inherit; } .tabs-trigger:last-child { border-right: 1px solid #c9d2d9; } .tabs-trigger.active { background: rgba(31,111,208,.1); box-shadow: inset 0 -2px 0 #1f6fd0; } .tabs-panel { padding: 14px 20px; }</style>")
hero = Content("<div class='hero'><h2>Inline artifact</h2><p>This whole app lives in a fenced block inside the page you are reading.</p></div>")
tour = Tabs([
  {label: "Why inline", content: [whyTab]},
  {label: "How to edit", content: [howTab]}
])
whyTab = Content("<p>The document is the unit of thought: prose and interactive views travel together in one file.</p>")
howTab = Content("<p>The block is just text in the .md — both agents edit it with the same wiki edit tools as the prose, and it hot-reloads live.</p>")
```

Prose keeps flowing normally after the block.

## Reusing a saved artifact

A separate `.oui` file can still be embedded by reference — for sharing one
artifact across several pages:

```html
<oui-embed src="path/to/file.oui"></oui-embed>
```

Always write the explicit closing tag — the self-closing form does not
render.

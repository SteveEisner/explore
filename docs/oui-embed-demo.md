# Embedding OpenUI apps in wiki pages

A wiki page can mount a live OpenUI application inline with the `<oui-embed>`
custom tag:

```html
<oui-embed src="pr-502764-review.oui"></oui-embed>
```

A bare filename resolves inside the wiki (`/docs`); a leading slash is a
site-absolute path. Always write the explicit closing tag — a self-closing
`<oui-embed />` makes the HTML parser swallow the rest of the page into the
element. Embeds hot-reload when the underlying `.oui` file changes on disk,
so a co-editing session updates them live.

## Live example

The benchmark PR-review artifact, embedded below. It's fully interactive —
tabs, galleries, and context gating all work inside the embed:

<oui-embed src="pr-502764-review.oui"></oui-embed>

Text after an embed flows normally in the reading layout.

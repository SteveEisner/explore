# Launch Demo

<oui-embed src="launch-demo.oui"></oui-embed>

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

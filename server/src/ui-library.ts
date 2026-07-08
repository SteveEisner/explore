import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Schema-only mirror of the front end's OpenUI component library
 * (client/src/lib/openui.tsx) — component names and prop shapes MUST stay in
 * sync with the renderers there. The back end only needs the schemas, to
 * generate the OpenUI Lang system prompt the LLM is given.
 */

const contextProp = z
  .array(z.number().int().nonnegative())
  .min(1)
  .optional()
  .describe(
    "Only render this component when the active context level (an integer) is in this list; omit to always render. Level 0 always exists and is the default; an exploration may introduce levels 1, 2, 3, ... — include 0 on the variant that should show by default."
  );

const Content = defineComponent({
  name: "Content",
  description:
    "A block of raw HTML rendered directly into the page. Use well-formed HTML.",
  props: z.object({
    html: z.string().describe("Raw HTML markup to display"),
    context: contextProp,
  }),
  component: null,
});

const Comparison = defineComponent({
  name: "Comparison",
  description:
    "Side-by-side panels in equal-width columns (before/after, path A vs path B, sequential steps). Unstyled by default — no padding, borders, or gap unless requested — so panel content fully controls its own look. The wrapper carries class `comparison` plus the optional `className`; each panel carries `comparison-panel`, and an optional label renders as an h3 with class `comparison-label`, so artifact stylesheets can restyle every part.",
  props: z.object({
    panels: z
      .array(
        z.object({
          label: z
            .string()
            .optional()
            .describe("Optional heading rendered above the panel content"),
          content: z
            .array(Content.ref)
            .describe("Components shown inside the panel"),
        })
      )
      .min(2)
      .describe("The panels, left to right"),
    gap: z
      .string()
      .optional()
      .describe("CSS gap between panels, e.g. '24px' (default: none)"),
    border: z
      .boolean()
      .optional()
      .describe("Draw a border around the whole comparison"),
    dividers: z
      .boolean()
      .optional()
      .describe("Draw a vertical rule between adjacent panels"),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: null,
});

const Gallery = defineComponent({
  name: "Gallery",
  description:
    "A master-detail board: a vertical nav of items on the left, the selected item's detail pane on the right. Use for glossaries, step-by-step flows, case explorers. Neutral layout only (decisions.md D4): no visual styling beyond an `active` marker class and bold selected label. Hook classes for artifact stylesheets: wrapper `gallery` (plus optional `className`), nav `gallery-nav`, items `gallery-nav-item` (+ `active`), detail pane `gallery-detail`, heading `gallery-title`.",
  props: z.object({
    stateKey: z
      .string()
      .optional()
      .describe(
        "Hierarchical state-store key naming this gallery's selection, e.g. 'flow/selected-step'"
      ),
    items: z
      .array(
        z.object({
          label: z.string().describe("Nav item text"),
          description: z
            .string()
            .optional()
            .describe("Small secondary text under the nav label"),
          title: z
            .string()
            .optional()
            .describe("Detail pane heading (defaults to the label)"),
          content: z
            .array(z.union([Content.ref, Comparison.ref]))
            .describe("Components shown in the detail pane when selected"),
        })
      )
      .min(1)
      .describe("The items, in nav order"),
    navWidth: z
      .string()
      .optional()
      .describe("CSS width of the nav column, e.g. '300px' (default '240px')"),
    gap: z
      .string()
      .optional()
      .describe("CSS gap between nav and detail (default: none)"),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: null,
});

const Aside = defineComponent({
  name: "Aside",
  description:
    "Main content with a narrower side panel of titled context blocks (e.g. what changed / what didn't / file list). Neutral layout only (decisions.md D4): no borders, backgrounds, or padding. Hook classes for artifact stylesheets: wrapper `aside-layout` (plus optional `className`), main column `aside-main`, panel `aside-panel`, blocks `aside-block`, block headings `aside-block-title`.",
  props: z.object({
    main: z
      .array(z.union([Content.ref, Comparison.ref, Gallery.ref]))
      .describe("Components in the main column"),
    aside: z
      .array(
        z.object({
          title: z.string().describe("Block heading"),
          content: z
            .array(Content.ref)
            .describe("Components inside the block"),
        })
      )
      .describe("Titled context blocks in the side panel, top to bottom"),
    asideWidth: z
      .string()
      .optional()
      .describe("CSS width of the side panel, e.g. '300px' (default '280px')"),
    gap: z
      .string()
      .optional()
      .describe("CSS gap between main column and side panel (default: none)"),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: null,
});

const Tabs = defineComponent({
  name: "Tabs",
  description:
    "A tabbed view: a row of tab triggers on top, one visible panel below. Neutral layout only (decisions.md D4): no visual styling beyond an `active` marker class and bold active label. Hook classes for artifact stylesheets: wrapper `tabs` (plus optional `className`), trigger row `tabs-nav`, triggers `tabs-trigger` (+ `active`), panel `tabs-panel`.",
  props: z.object({
    tabs: z
      .array(
        z.object({
          label: z.string().describe("Tab trigger text"),
          content: z
            .array(
              z.union([Content.ref, Comparison.ref, Gallery.ref, Aside.ref])
            )
            .describe("Components shown when this tab is active"),
        })
      )
      .describe("The tabs, in display order"),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: null,
});

const Stack = defineComponent({
  name: "Stack",
  description:
    "Fills the width of its container and stacks its children vertically, edge to edge. As the artifact root, its hook class `stack` (plus optional `className`) is the scope for artifact-wide CSS — the host app resets browser element defaults, so artifacts should include a Content <style> block with base typography scoped under `.stack` (e.g. `.stack h2 {...}`, `.stack p {...}`).",
  props: z.object({
    children: z
      .array(
        z.union([Content.ref, Tabs.ref, Comparison.ref, Gallery.ref, Aside.ref])
      )
      .describe("Components stacked top to bottom"),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: null,
});

export const uiLibrary = createLibrary({
  components: [Stack, Content, Tabs, Gallery, Aside, Comparison],
  root: "Stack",
});

/**
 * System prompt appended to every Claude CLI session: teaches OpenUI Lang,
 * documents the component library, and explains the `ui` tool contract.
 * editMode enables incremental patches (resend only changed statements).
 */
export function buildUiSystemPrompt(): string {
  return uiLibrary.prompt({
    preamble: [
      "# The ui tool",
      "",
      "You can render a user interface into the main panel of the user's app",
      "by calling the `ui` tool (mcp__ui__ui) with a single `spec` argument",
      "containing an OpenUI Lang program, as specified below.",
      "",
      "The panel keeps the UI from your previous ui calls: to change it, send",
      "only the changed or new statements (edit mode) — unchanged statements",
      "persist. Send a full program with a new `root` to replace everything.",
    ].join("\n"),
    additionalRules: [
      "Every full program must define root = Stack(...).",
      "Pass ONLY OpenUI Lang statements in `spec` — no markdown fences, no prose.",
      "Structural components are named editing points (decisions.md D4): " +
        "they render neutral layout only, with no visual styling of their " +
        "own. Their value is that each named statement is an independently " +
        "editable boundary — so decompose the page into many small named " +
        "statements rather than a few large HTML blobs. Give the artifact " +
        "its look with your own HTML and CSS: include a Content statement " +
        "carrying a <style> block and target the components' hook classes " +
        "(tabs-nav, tabs-trigger, gallery-nav-item, gallery-detail, " +
        "aside-block, comparison-panel, comparison-label, ...) plus any " +
        "className you set on instances.",
      "Context-aware rendering: every component accepts an optional context " +
        "prop (array of integers). A component without it always renders. A " +
        "component with it renders only when the app's active context level " +
        "is in its list. Level 0 always exists and is the app default; an " +
        "exploration may introduce further levels 1, 2, 3, ... for " +
        "different reader depths (e.g. 0 = new to the material, higher = " +
        "more expert or more specialized). Emit one gated variant per " +
        "level, include 0 on the variant that should show by default, and " +
        "keep ungated content coherent on its own.",
    ],
    examples: [
      [
        'root = Stack([intro, details])',
        'intro = Content("<h1>Report</h1><p>Summary of results.</p>")',
        'details = Tabs([{label: "Overview", content: [ov]}, {label: "Data", content: [data]}])',
        'ov = Content("<p>Overview body</p>")',
        'data = Content("<table><tr><td>42</td></tr></table>")',
      ].join("\n"),
    ],
    editMode: true,
  });
}

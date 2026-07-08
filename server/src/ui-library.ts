import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Schema-only mirror of the front end's OpenUI component library
 * (client/src/lib/openui.tsx) — component names and prop shapes MUST stay in
 * sync with the renderers there. The back end only needs the schemas, to
 * generate the OpenUI Lang system prompt the LLM is given.
 */

const contextProp = z
  .array(z.string())
  .min(1)
  .optional()
  .describe(
    "Only render this component when the active context level is one of these strings; omit to always render"
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
    "Side-by-side labeled panels for comparing alternatives (before/after, path A vs path B, sequential steps). Panels share the row with equal widths.",
  props: z.object({
    panels: z
      .array(
        z.object({
          label: z.string().describe("Heading shown above the panel"),
          content: z
            .array(Content.ref)
            .describe("Components shown inside the panel"),
        })
      )
      .min(2)
      .describe("The panels, left to right"),
    context: contextProp,
  }),
  component: null,
});

const Gallery = defineComponent({
  name: "Gallery",
  description:
    "A master-detail board: a vertical nav of items on the left, the selected item's detail pane on the right. Use for glossaries, step-by-step flows, case explorers.",
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
    context: contextProp,
  }),
  component: null,
});

const Aside = defineComponent({
  name: "Aside",
  description:
    "Main content with a narrower side panel of titled context blocks (e.g. what changed / what didn't / file list). The aside stays alongside the main flow.",
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
    context: contextProp,
  }),
  component: null,
});

const Tabs = defineComponent({
  name: "Tabs",
  description:
    "A tabbed view: a row of tab triggers on top, one visible panel below.",
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
    context: contextProp,
  }),
  component: null,
});

const Stack = defineComponent({
  name: "Stack",
  description:
    "Fills the width of its container and stacks its children vertically, edge to edge.",
  props: z.object({
    children: z
      .array(
        z.union([Content.ref, Tabs.ref, Comparison.ref, Gallery.ref, Aside.ref])
      )
      .describe("Components stacked top to bottom"),
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
      "Context-aware rendering: every component accepts an optional context " +
        "prop (array of strings). A component renders only when the app's " +
        "active context level is in its list; components without the prop " +
        "always render. Use it to offer the same explanation at different " +
        "depths for different readers (e.g. context levels like 'new', " +
        "'expert', 'audit') — emit one gated variant per level. When no " +
        "level is active, everything renders, so keep ungated content " +
        "coherent on its own.",
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

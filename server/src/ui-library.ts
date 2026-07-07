import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Schema-only mirror of the front end's OpenUI component library
 * (client/src/lib/openui.tsx) — component names and prop shapes MUST stay in
 * sync with the renderers there. The back end only needs the schemas, to
 * generate the OpenUI Lang system prompt the LLM is given.
 */

const Content = defineComponent({
  name: "Content",
  description:
    "A block of raw HTML rendered directly into the page. Use well-formed HTML.",
  props: z.object({
    html: z.string().describe("Raw HTML markup to display"),
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
            .array(Content.ref)
            .describe("Components shown when this tab is active"),
        })
      )
      .describe("The tabs, in display order"),
  }),
  component: null,
});

const Stack = defineComponent({
  name: "Stack",
  description:
    "Fills the width of its container and stacks its children vertically, edge to edge.",
  props: z.object({
    children: z
      .array(z.union([Content.ref, Tabs.ref]))
      .describe("Components stacked top to bottom"),
  }),
  component: null,
});

export const uiLibrary = createLibrary({
  components: [Stack, Content, Tabs],
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

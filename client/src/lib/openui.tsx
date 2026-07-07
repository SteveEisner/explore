import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod";
import {
  Tabs as TabsRoot,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

/**
 * OpenUI (openui.com) generative-UI library rendered into the main panel.
 * The LLM sends OpenUI Lang programs through its `ui` tool; the back end
 * streams the tool tokens to us and <GenerativeView> renders incrementally.
 *
 * Names and prop shapes MUST stay in sync with the schema-only mirror the
 * back end uses for prompt generation (server/src/ui-library.ts).
 *
 * Layout contract: components are edge-to-edge — no built-in outer padding.
 */

const Content = defineComponent({
  name: "Content",
  description:
    "A block of raw HTML rendered directly into the page. Use well-formed HTML.",
  props: z.object({
    html: z.string().describe("Raw HTML markup to display"),
  }),
  component: ({ props }) => (
    <div
      className="w-full min-w-0 [&_a]:underline"
      // The whole point of Content is trusted LLM-authored markup.
      dangerouslySetInnerHTML={{ __html: props.html }}
    />
  ),
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
  component: ({ props, renderNode }) => (
    <TabsRoot defaultValue={0} className="w-full gap-0">
      <TabsList variant="line" className="w-full border-b p-0">
        {props.tabs.map((tab, i) => (
          <TabsTrigger key={i} value={i}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {props.tabs.map((tab, i) => (
        <TabsContent key={i} value={i} className="w-full">
          {renderNode(tab.content)}
        </TabsContent>
      ))}
    </TabsRoot>
  ),
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
  component: ({ props, renderNode }) => (
    <div className="flex w-full min-w-0 flex-col">
      {renderNode(props.children)}
    </div>
  ),
});

export const openuiLibrary = createLibrary({
  components: [Stack, Content, Tabs],
  root: "Stack",
});

export function GenerativeView({
  response,
  isStreaming = false,
}: {
  response: string | null;
  isStreaming?: boolean;
}) {
  return (
    <Renderer
      response={response}
      library={openuiLibrary}
      isStreaming={isStreaming}
    />
  );
}

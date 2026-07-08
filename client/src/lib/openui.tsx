import { createContext, useContext, useState } from "react";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod";
import { frontendLog } from "@/lib/frontend-log";
import { cn } from "@/lib/utils";

/**
 * Active context level for context-aware rendering (decisions.md D3 will move
 * this into the artifact state store under the "context" key). Levels are
 * artifact-defined strings, e.g. "new" | "billing" | "flow" | "audit".
 * undefined = no active level: every component renders.
 */
export const ContextLevelContext = createContext<string | undefined>(undefined);

const contextProp = z
  .array(z.string())
  .min(1)
  .optional()
  .describe(
    "Only render this component when the active context level is one of these strings; omit to always render"
  );

function useContextVisible(context: string[] | undefined): boolean {
  const level = useContext(ContextLevelContext);
  return !context || !level || context.includes(level);
}
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
    context: contextProp,
  }),
  component: ({ props }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div
        className="w-full min-w-0 [&_a]:underline"
        // The whole point of Content is trusted LLM-authored markup.
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div
        className="grid w-full min-w-0 gap-3"
        style={{
          gridTemplateColumns: `repeat(${props.panels.length}, minmax(0, 1fr))`,
        }}
      >
        {props.panels.map((panel, i) => (
          <div key={i} className="min-w-0 rounded-md border p-3">
            <h3 className="mb-2 text-sm font-semibold">{panel.label}</h3>
            {renderNode(panel.content)}
          </div>
        ))}
      </div>
    );
  },
});

const Gallery = defineComponent({
  name: "Gallery",
  description:
    "A master-detail board: a vertical nav of items on the left, the selected item's detail pane on the right. Use for glossaries, step-by-step flows, case explorers.",
  props: z.object({
    // Selection state will move to the hierarchical KV store (decisions.md
    // D3); the key names the state, e.g. "flow/selected-step".
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
  component: ({ props, renderNode }) => {
    const visible = useContextVisible(props.context);
    const [selected, setSelected] = useState(0);
    if (!visible) return null;
    const item = props.items[Math.min(selected, props.items.length - 1)];
    return (
      <div className="grid w-full min-w-0 grid-cols-[240px_minmax(0,1fr)] gap-4">
        <nav className="flex flex-col gap-1">
          {props.items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                i === selected
                  ? "border-primary bg-accent"
                  : "border-transparent hover:bg-accent/50"
              )}
            >
              <b className="block">{it.label}</b>
              {it.description && (
                <small className="text-muted-foreground">{it.description}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <h2 className="mb-2 text-lg font-semibold">
            {item.title ?? item.label}
          </h2>
          {renderNode(item.content)}
        </div>
      </div>
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_280px] gap-4">
        <div className="min-w-0">{renderNode(props.main)}</div>
        <aside className="flex flex-col gap-3">
          {props.aside.map((block, i) => (
            <div key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
              <b className="mb-1 block">{block.title}</b>
              {renderNode(block.content)}
            </div>
          ))}
        </aside>
      </div>
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
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
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div className="flex w-full min-w-0 flex-col">
        {renderNode(props.children)}
      </div>
    );
  },
});

export const openuiLibrary = createLibrary({
  components: [Stack, Content, Tabs, Gallery, Aside, Comparison],
  root: "Stack",
});

export function GenerativeView({
  response,
  isStreaming = false,
  contextLevel,
}: {
  response: string | null;
  isStreaming?: boolean;
  /** Active context level for context-gated components; undefined renders everything. */
  contextLevel?: string;
}) {
  return (
    <ContextLevelContext.Provider value={contextLevel}>
      <Renderer
        response={response}
        library={openuiLibrary}
        isStreaming={isStreaming}
        onError={(errors) => {
          // Parse/validation problems go to the JSONL observability log.
          if (errors.length > 0) {
            frontendLog(
              "openui:error",
              errors.map((e) => ({ code: e.code, message: e.message }))
            );
          }
        }}
      />
    </ContextLevelContext.Provider>
  );
}

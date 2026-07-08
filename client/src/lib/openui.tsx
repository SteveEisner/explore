import { createContext, useContext, useState } from "react";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { z } from "zod";
import { frontendLog } from "@/lib/frontend-log";
import { cn } from "@/lib/utils";

/**
 * Active context level for context-aware rendering (decisions.md D3 will move
 * this into the artifact state store under the "context" key). Levels are
 * small integers: level 0 always exists and is the default; an exploration
 * may introduce further levels 1, 2, 3, ... and gate its components to them.
 *
 * A component without a `context` prop always renders. A component with one
 * renders only when the active level is in its list.
 */
export const DEFAULT_CONTEXT_LEVEL = 0;

export const ContextLevelContext = createContext<number>(DEFAULT_CONTEXT_LEVEL);

const contextProp = z
  .array(z.number().int().nonnegative())
  .min(1)
  .optional()
  .describe(
    "Only render this component when the active context level (an integer) is in this list; omit to always render. Level 0 always exists and is the default; an exploration may introduce levels 1, 2, 3, ... — include 0 on the variant that should show by default."
  );

function useContextVisible(context: number[] | undefined): boolean {
  const level = useContext(ContextLevelContext);
  return !context || context.includes(level);
}

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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    const count = props.panels.length;
    return (
      <div
        className={cn(
          "comparison grid w-full min-w-0",
          props.border && "border",
          props.className
        )}
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          gap: props.gap,
        }}
      >
        {props.panels.map((panel, i) => (
          <div
            key={i}
            className={cn(
              "comparison-panel min-w-0",
              props.dividers && i < count - 1 && "border-r"
            )}
          >
            {panel.label != null && (
              <h3 className="comparison-label text-sm font-semibold">
                {panel.label}
              </h3>
            )}
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
    "A master-detail board: a vertical nav of items on the left, the selected item's detail pane on the right. Use for glossaries, step-by-step flows, case explorers. Neutral layout only (decisions.md D4): no visual styling beyond an `active` marker class and bold selected label. Hook classes for artifact stylesheets: wrapper `gallery` (plus optional `className`), nav `gallery-nav`, items `gallery-nav-item` (+ `active`), detail pane `gallery-detail`, heading `gallery-title`.",
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
  component: ({ props, renderNode }) => {
    const visible = useContextVisible(props.context);
    const [selected, setSelected] = useState(0);
    if (!visible) return null;
    const item = props.items[Math.min(selected, props.items.length - 1)];
    return (
      <div
        className={cn("gallery grid w-full min-w-0", props.className)}
        style={{
          gridTemplateColumns: `${props.navWidth ?? "240px"} minmax(0, 1fr)`,
          gap: props.gap,
        }}
      >
        <nav className="gallery-nav flex flex-col">
          {props.items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              data-active={i === selected}
              aria-current={i === selected}
              className={cn(
                "gallery-nav-item cursor-pointer text-left",
                i === selected && "active"
              )}
            >
              <b className={cn("block", i === selected && "font-semibold")}>
                {it.label}
              </b>
              {it.description && <small className="block">{it.description}</small>}
            </button>
          ))}
        </nav>
        <div className="gallery-detail min-w-0">
          <h2 className="gallery-title">{item.title ?? item.label}</h2>
          {renderNode(item.content)}
        </div>
      </div>
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div
        className={cn("aside-layout grid w-full min-w-0", props.className)}
        style={{
          gridTemplateColumns: `minmax(0, 1fr) ${props.asideWidth ?? "280px"}`,
          gap: props.gap,
        }}
      >
        <div className="aside-main min-w-0">{renderNode(props.main)}</div>
        <aside className="aside-panel flex flex-col">
          {props.aside.map((block, i) => (
            <div key={i} className="aside-block">
              <h3 className="aside-block-title">{block.title}</h3>
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
  component: ({ props, renderNode }) => {
    const visible = useContextVisible(props.context);
    const [selected, setSelected] = useState(0);
    if (!visible) return null;
    const active = props.tabs[Math.min(selected, props.tabs.length - 1)];
    return (
      <div className={cn("tabs w-full min-w-0", props.className)}>
        <div className="tabs-nav flex" role="tablist">
          {props.tabs.map((tab, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={cn(
                "tabs-trigger cursor-pointer",
                i === selected && "active font-semibold"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="tabs-panel w-full min-w-0" role="tabpanel">
          {renderNode(active.content)}
        </div>
      </div>
    );
  },
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
  component: ({ props, renderNode }) => {
    if (!useContextVisible(props.context)) return null;
    return (
      <div className={cn("stack flex w-full min-w-0 flex-col", props.className)}>
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
  contextLevel = DEFAULT_CONTEXT_LEVEL,
}: {
  response: string | null;
  isStreaming?: boolean;
  /** Active context level; defaults to 0, the always-present base level. */
  contextLevel?: number;
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

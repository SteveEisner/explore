import { createContext, useContext, useEffect, useMemo } from "react";
import {
  createLibrary,
  defineComponent,
  type OpenUIError,
  Renderer,
} from "@openuidev/react-lang";
import { z } from "zod";
import { frontendLog } from "@/lib/frontend-log";
import { seedState, setState, useStoreValue } from "@/lib/state-store";
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

const ContextLevelContext = createContext<number>(DEFAULT_CONTEXT_LEVEL);

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
 * Selection state for Tabs/Gallery, held in the D3 state store so the LLM's
 * `set_state` tool can drive it exactly like a click. The key is the
 * component's `stateKey` prop or `artifact/<type>/<statementId>`. Stored
 * values may arrive from the LLM as an index or an item label; both resolve.
 */
function useStoreSelection(
  stateKey: string | undefined,
  type: string,
  statementId: string | undefined,
  labels: string[]
): [number, (index: number) => void] {
  const key = stateKey ?? `artifact/${type}/${statementId ?? "inline"}`;
  const [raw, setRaw] = useStoreValue<unknown>(key, 0);
  return [resolveSelection(raw, labels), setRaw];
}

/**
 * Turn a stored selection value into a valid item index: numbers are
 * truncated and clamped to the item range, strings resolve by
 * case-insensitive label match (then as a numeric string), and anything
 * unrecognized falls back to the first item. Callers can index items with
 * the result without re-clamping.
 */
function resolveSelection(raw: unknown, labels: string[]): number {
  const max = Math.max(0, labels.length - 1);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(Math.max(0, Math.trunc(raw)), max);
  }
  if (typeof raw === "string") {
    const byLabel = labels.findIndex(
      (label) => label.toLowerCase() === raw.trim().toLowerCase()
    );
    if (byLabel !== -1) return byLabel;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return Math.min(Math.max(0, parsed), max);
  }
  return 0;
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

/**
 * Streamed html grows chunk by chunk, and dangerouslySetInnerHTML rebuilds
 * the subtree on every change. For <style> blocks that rebuild removes the
 * element for a frame per chunk — the whole artifact flashes unstyled at
 * chunk rate. Split them out: complete blocks render as persistent React
 * <style> elements (text updates apply in one commit, no unstyled frame),
 * and an unclosed trailing <style> mid-stream is withheld entirely so
 * half-streamed CSS never shows up as page text.
 */
function splitContentHtml(html: string): { styles: string[]; rest: string } {
  const styles: string[] = [];
  let rest = html.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_, css: string) => {
      styles.push(css);
      return "";
    }
  );
  const unclosed = rest.search(/<style\b/i);
  if (unclosed !== -1) rest = rest.slice(0, unclosed);
  return { styles, rest };
}

const Content = defineComponent({
  name: "Content",
  description:
    "A block of raw HTML rendered directly into the page. Use well-formed HTML.",
  props: z.object({
    html: z.string().describe("Raw HTML markup to display"),
    context: contextProp,
  }),
  component: function ContentComponent({ props, statementId }) {
    const visible = useContextVisible(props.context);
    const { styles, rest } = useMemo(
      () => splitContentHtml(props.html),
      [props.html]
    );
    if (!visible) return null;
    return (
      <>
        {styles.map((css, i) => (
          <style key={i}>{css}</style>
        ))}
        <div
          className="w-full min-w-0 [&_a]:underline"
          data-statement={statementId}
          // The whole point of Content is trusted LLM-authored markup.
          dangerouslySetInnerHTML={{ __html: rest }}
        />
      </>
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
  component: function ComparisonComponent({ props, renderNode, statementId }) {
    if (!useContextVisible(props.context)) return null;
    const count = props.panels.length;
    return (
      <div
        className={cn(
          "comparison grid w-full min-w-0",
          props.border && "border",
          props.className
        )}
        data-statement={statementId}
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
    stateKey: z
      .string()
      .optional()
      .describe(
        "Hierarchical state-store key naming this gallery's selection (index or item label), e.g. 'flow/selected-step'; defaults to 'artifact/gallery/<statementId>'"
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
      .describe(
        "Maximum CSS width of the nav column, e.g. '300px' (default '240px'); in narrow containers the nav shrinks so the detail pane keeps at least 60% of the width"
      ),
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
  component: function GalleryComponent({ props, renderNode, statementId }) {
    const visible = useContextVisible(props.context);
    const [selected, setSelected] = useStoreSelection(
      props.stateKey,
      "gallery",
      statementId,
      props.items.map((it) => it.label)
    );
    if (!visible) return null;
    // resolveSelection clamped `selected` to the item range.
    const item = props.items[selected];
    return (
      <div
        className={cn("gallery grid w-full min-w-0", props.className)}
        data-statement={statementId}
        style={{
          // navWidth is a maximum, not a fixed size: capping the nav at 40%
          // of the container keeps the detail pane readable when the artifact
          // renders in a narrow container (e.g. <oui-embed> in the 48rem
          // reading column) instead of crushing it to one-word lines.
          gridTemplateColumns: `min(${props.navWidth ?? "240px"}, 40%) minmax(0, 1fr)`,
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
      .describe(
        "Maximum CSS width of the side panel, e.g. '300px' (default '280px'); in narrow containers the panel shrinks so the main column keeps at least 60% of the width"
      ),
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
  component: function AsideComponent({ props, renderNode, statementId }) {
    if (!useContextVisible(props.context)) return null;
    return (
      <div
        className={cn("aside-layout grid w-full min-w-0", props.className)}
        data-statement={statementId}
        style={{
          // asideWidth is a maximum, not a fixed size: capping the panel at
          // 40% of the container keeps the main column readable in narrow
          // containers (see the matching Gallery nav cap above).
          gridTemplateColumns: `minmax(0, 1fr) min(${props.asideWidth ?? "280px"}, 40%)`,
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
    stateKey: z
      .string()
      .optional()
      .describe(
        "Hierarchical state-store key naming the active tab (index or label), e.g. 'report/active-tab'; defaults to 'artifact/tabs/<statementId>'"
      ),
    className: z
      .string()
      .optional()
      .describe(
        "Extra CSS class on the wrapper so artifact stylesheets can target this instance"
      ),
    context: contextProp,
  }),
  component: function TabsComponent({ props, renderNode, statementId }) {
    const visible = useContextVisible(props.context);
    const [selected, setSelected] = useStoreSelection(
      props.stateKey,
      "tabs",
      statementId,
      props.tabs.map((tab) => tab.label)
    );
    if (!visible) return null;
    // resolveSelection clamped `selected` to the tab range.
    const active = props.tabs[selected];
    return (
      <div className={cn("tabs w-full min-w-0", props.className)} data-statement={statementId}>
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

/**
 * One declared state key from the artifact's manifest (decisions.md D3):
 * the artifact's contract for a store key its components read.
 */
const stateKeyDeclaration = z.object({
  key: z
    .string()
    .describe("Hierarchical store key, e.g. 'flow/selected-step'"),
  initial: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe("Value seeded into the store when the key is unset"),
  description: z
    .string()
    .describe("What the key means and what changing it does"),
});

const stateKeysProp = z
  .array(stateKeyDeclaration)
  .optional()
  .describe(
    "Manifest of the artifact's state keys (decisions.md D3): declare every stateKey your components use, with an initial value and a description, so the state store documents itself"
  );

/**
 * Apply the root's state-key manifest. Seeding happens during render —
 * Stack is the root, and parents render before children, so a declared
 * initial lands in the store before Tabs/Gallery read (and default-seed)
 * their own keys; a value someone actually set is never clobbered
 * (seedState only fills never-set keys). The declarations are then
 * published under `artifact/manifest` from an effect, where state-tool
 * snapshots expose them — the store doubles as documentation of the
 * artifact's contract. Stringified dependency: props are rebuilt on every
 * parse, so identity would re-run the effect each render; content equality
 * is what "the manifest changed" means.
 */
function useStateKeyManifest(
  declarations: z.infer<typeof stateKeyDeclaration>[] | undefined
): void {
  for (const declared of declarations ?? []) {
    if (declared.initial !== undefined) seedState(declared.key, declared.initial);
  }
  const manifestJson = JSON.stringify(declarations ?? null);
  useEffect(() => {
    const manifest = JSON.parse(manifestJson) as
      | z.infer<typeof stateKeyDeclaration>[]
      | null;
    if (manifest?.length) setState("artifact/manifest", manifest);
  }, [manifestJson]);
}

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
    // Last position: adding a positional argument earlier would silently
    // shift the meaning of existing artifacts' className/context args.
    stateKeys: stateKeysProp,
  }),
  component: function StackComponent({ props, renderNode, statementId }) {
    useStateKeyManifest(props.stateKeys);
    if (!useContextVisible(props.context)) return null;
    return (
      <div
        className={cn("stack flex w-full min-w-0 flex-col", props.className)}
        data-statement={statementId}
      >
        {renderNode(props.children)}
      </div>
    );
  },
});

const openuiLibrary = createLibrary({
  components: [Stack, Content, Tabs, Gallery, Aside, Comparison],
  root: "Stack",
});

/**
 * Coerce a stored context level into an integer: the store is LLM-writable,
 * so the value may arrive as a numeric string. Unusable values fall back to
 * the always-present base level.
 */
function coerceContextLevel(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  return Number.parseInt(String(raw), 10) || DEFAULT_CONTEXT_LEVEL;
}

export function GenerativeView({
  response,
  isStreaming = false,
  contextLevel,
  onError,
}: {
  response: string | null;
  isStreaming?: boolean;
  /** Active context level; defaults to the store's `app/context-level`. */
  contextLevel?: number;
  /**
   * Receives the Renderer's structured errors in addition to the JSONL log,
   * including `[]` when previous errors resolve. Fatal cases — parse failure
   * or no renderable root, where the Renderer renders nothing — arrive with
   * `source: "parser"`; hosts can surface those instead of showing a blank.
   */
  onError?: (errors: OpenUIError[]) => void;
}) {
  // The store key lets the user's controls and the LLM's set_state tool
  // switch reader depth app-wide; an explicit prop still overrides.
  const [storeLevel] = useStoreValue<unknown>(
    "app/context-level",
    DEFAULT_CONTEXT_LEVEL
  );
  const level = contextLevel ?? coerceContextLevel(storeLevel);
  return (
    <ContextLevelContext.Provider value={level}>
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
          onError?.(errors);
        }}
      />
    </ContextLevelContext.Provider>
  );
}

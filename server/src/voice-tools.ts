import { z } from "zod";
import { listWikiFiles } from "./wiki-files.js";
import {
  editArtifactSpec,
  editDoc,
  readDoc,
  searchDocs,
  wikiDocPath,
} from "./wiki-service.js";

/**
 * The voice agent's tool registry — the single source of truth for the
 * realtime session (decisions.md D5, voice rows 1/3/5).
 *
 * Every tool is declared here once, with a zod schema that yields both the
 * JSON Schema sent to OpenAI at session mint (`voiceToolSchemas`) and the
 * server-side argument validation (`executeVoiceTool`). Tools split by where
 * they run:
 *
 * - server tools carry an `execute` and run here, called over the ws
 *   `voice:tool` bridge — wiki reads/search/edits, artifact edits, and
 *   delegation to the Claude session;
 * - front-end tools (screenshot, app-state read/write) are schema-only:
 *   the browser executes them locally off the WebRTC data channel, so the
 *   session endpoint tells the client their names (`frontendToolNames`).
 *
 * Executors return the result string handed back to the model and throw
 * plain Errors whose messages teach the model how to correct a bad call.
 */

export interface VoiceToolContext {
  wikiDir: string;
  /**
   * Run one delegated turn on the Claude session and resolve with its final
   * response text. `mode` picks the model tier (fast ≈ Haiku-class, smart ≈
   * Opus-class); the implementation guarantees the delegated turn never
   * cancels an in-flight typed chat turn.
   */
  delegate(request: string, mode: "fast" | "smart"): Promise<string>;
}

/** Function-tool schema in the Realtime API's flat format. */
export interface VoiceToolSchema {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * A registered server tool. `execute` takes `never` so heterogeneous tools
 * fit one array type; the only call site is executeVoiceTool, which passes
 * data already validated against this same tool's `args` schema.
 */
interface ServerTool {
  name: string;
  description: string;
  args: z.ZodType;
  execute(args: never, ctx: VoiceToolContext): Promise<string>;
}

/** Definition helper: ties each tool's execute() input to its args schema. */
function tool<Schema extends z.ZodType>(definition: {
  name: string;
  description: string;
  args: Schema;
  execute(args: z.output<Schema>, ctx: VoiceToolContext): Promise<string>;
}): ServerTool {
  return definition;
}

/**
 * Resolve a caller-supplied path argument or throw the teaching error —
 * every path-taking tool rejects traversal/hidden-file forms the same way.
 */
function requireWikiPath(file: string): string {
  const rel = wikiDocPath(file);
  if (!rel) {
    throw new Error(
      `invalid path "${file}" — pass a wiki-relative path like "journeys.md" (list_docs shows every file); no absolute paths or ".."`
    );
  }
  return rel;
}

const serverTools = [
  tool({
    name: "list_docs",
    description:
      "List every file in the wiki (path, size in bytes, last modified). " +
      "Call this before reading or editing when you are not sure of a path.",
    args: z.object({}),
    execute: async (_args, ctx) =>
      JSON.stringify({ files: listWikiFiles(ctx.wikiDir) }),
  }),
  tool({
    name: "read_doc",
    description:
      "Read part of a wiki file as plain text. Returns at most `limit` " +
      "lines starting at 1-based line `offset`, plus the file's total line " +
      "count — page through long files with further calls.",
    args: z.object({
      path: z
        .string()
        .describe("Wiki-relative path, e.g. 'journeys.md' or 'meta/plan.md'"),
      offset: z
        .number()
        .optional()
        .describe("1-based first line to return (default 1)"),
      limit: z
        .number()
        .optional()
        .describe("Max lines to return (default 200, cap 400)"),
    }),
    execute: async ({ path, offset, limit }, ctx) =>
      JSON.stringify(await readDoc(ctx.wikiDir, requireWikiPath(path), offset, limit)),
  }),
  tool({
    name: "search_docs",
    description:
      "Search every wiki file for a literal text snippet " +
      "(case-insensitive). Returns matching lines with file paths and line " +
      "numbers; `truncated: true` means more matches exist — refine the query.",
    args: z.object({
      query: z.string().min(1).describe("Literal text to find (not a regex)"),
    }),
    execute: async ({ query }, ctx) =>
      JSON.stringify(await searchDocs(ctx.wikiDir, query)),
  }),
  tool({
    name: "edit_doc",
    description:
      "Replace text in a wiki file. `old_text` must match exactly one place " +
      "in the file — copy it exactly, including whitespace and line breaks " +
      "(read_doc shows the current content) — and the whole match becomes " +
      "`new_text`. Use edit_artifact for .oui files.",
    args: z.object({
      path: z.string().describe("Wiki-relative path of the file to edit"),
      old_text: z.string().min(1).describe("Exact existing text to replace"),
      new_text: z.string().describe("Replacement text (may be empty to delete)"),
    }),
    execute: async ({ path, old_text, new_text }, ctx) => {
      const rel = requireWikiPath(path);
      await editDoc(ctx.wikiDir, rel, old_text, new_text);
      return JSON.stringify({ edited: rel });
    },
  }),
  tool({
    name: "edit_artifact",
    description:
      "Edit a saved .oui artifact with OpenUI Lang edit statements: a " +
      "statement reusing an existing name replaces it, a new name appends, " +
      "and a full program with a new root replaces everything. Anyone " +
      "viewing the file sees the change immediately. The file must already " +
      "exist.",
    args: z.object({
      file: z.string().describe("The .oui file: wiki path or /docs/<path> URL"),
      spec: z
        .string()
        .min(1)
        .describe("OpenUI Lang statements (edit patch or full program)"),
    }),
    execute: async ({ file, spec }, ctx) => {
      const rel = requireWikiPath(file);
      if (!rel.toLowerCase().endsWith(".oui")) {
        throw new Error(
          `edit_artifact only edits .oui files — use edit_doc for "${rel}"`
        );
      }
      await editArtifactSpec(ctx.wikiDir, rel, spec);
      return JSON.stringify({ edited: rel, url: `/docs/${rel}` });
    },
  }),
  tool({
    name: "ask_artifact_agent",
    description:
      "Hand a bigger job to the app's generation engine: building a new " +
      "exploration artifact, restructuring a page, or anything beyond a " +
      "small targeted edit. Blocks until the work finishes (possibly " +
      "minutes) and returns the engine's summary; announce that you're on " +
      "it before calling, and present the outcome as your own work. " +
      "mode 'fast' for quick, simple jobs; 'smart' for complex or " +
      "quality-critical ones.",
    args: z.object({
      request: z
        .string()
        .min(1)
        .describe(
          "Full instructions for the job, self-contained: the engine does " +
            "not hear the voice conversation, so include every relevant " +
            "detail the user gave"
        ),
      mode: z.enum(["fast", "smart"]),
    }),
    execute: ({ request, mode }, ctx) => ctx.delegate(request, mode),
  }),
];

/**
 * Front-end tools: schema-only here. The browser executes these directly
 * off the WebRTC data channel (no server hop) — screenshot and state reads
 * against the live DOM, state writes through the same D3 store path a user
 * interaction takes.
 */
const frontendTools: Array<{
  name: string;
  description: string;
  args: z.ZodType;
}> = [
  {
    name: "get_app_state",
    description:
      "Inspect what the user currently sees in the app: the open document " +
      "or artifact, scroll position, text selection, panel states, and the " +
      "full UI state store. Call this whenever the user refers to what's on " +
      "screen ('this section', 'the open page').",
    args: z.object({}),
  },
  {
    name: "set_app_state",
    description:
      "Update the app's shared UI state store, exactly as if the user did " +
      "it. Keys: 'app/view' — what the main panel shows: {kind:'doc', " +
      "url:'/docs/<path>'} opens a wiki file, {kind:'home'} the folder " +
      "view, {kind:'authoring'} the generative panel; 'app/context-level' " +
      "(integer) — the depth gate for context-aware artifact sections; " +
      "'app/chat-open' and 'app/draw-mode' (booleans); artifact component " +
      "selections under 'artifact/...' (get_app_state shows every current " +
      "key under stateStore). Pass `updates` mapping keys to new values; " +
      "null deletes a key.",
    args: z.object({
      updates: z
        .record(z.string(), z.unknown())
        .describe("State-store key → new value; null deletes the key"),
    }),
  },
  {
    name: "indicate",
    description:
      "Point at content in the user's main panel: the app scrolls the " +
      "target into view (if it isn't already visible) and blinks it a few " +
      "times. Use it whenever you talk about a specific place — 'this " +
      "paragraph here', 'that chart'. Pass exactly one target: `lines` " +
      "(markdown source lines of the open document, as seen in read_doc " +
      "output or get_app_state's scroll info), `statement` (an OpenUI " +
      "statement name in the rendered artifact), or `text` (a short " +
      "verbatim snippet from the document — the first occurrence is " +
      "indicated).",
    args: z.object({
      lines: z
        .object({
          start: z.number().describe("First line (1-based)"),
          end: z.number().optional().describe("Last line (defaults to start)"),
        })
        .optional()
        .describe("Markdown source-line range in the open document"),
      statement: z
        .string()
        .optional()
        .describe("OpenUI statement name in the rendered artifact"),
      text: z
        .string()
        .optional()
        .describe("Verbatim snippet to find (case-insensitive)"),
    }),
  },
  {
    name: "take_screenshot",
    description:
      "Capture the app's main panel; the screenshot is attached to the " +
      "conversation as an image for you to look at. Use it when layout or " +
      "visual detail matters and get_app_state's structured view is not " +
      "enough.",
    args: z.object({}),
  },
];

/** Every tool schema for the realtime session config, server + front-end. */
export function voiceToolSchemas(): VoiceToolSchema[] {
  const all = [...serverTools, ...frontendTools];
  return all.map(({ name, description, args }) => ({
    type: "function",
    name,
    description,
    parameters: z.toJSONSchema(args),
  }));
}

/** Names the browser must execute locally instead of bridging to us. */
export function frontendToolNames(): string[] {
  return frontendTools.map((t) => t.name);
}

/**
 * Execute one server-side voice tool call. Arguments are validated against
 * the tool's schema first, so executors run only on well-shaped input.
 * Returns the result string for the model's function_call_output; throws a
 * plain Error (unknown tool, bad arguments, executor failure) whose message
 * is safe to forward to the model verbatim.
 */
export async function executeVoiceTool(
  name: string,
  args: unknown,
  ctx: VoiceToolContext
): Promise<string> {
  const toolDefinition = serverTools.find((t) => t.name === name);
  if (!toolDefinition) {
    throw new Error(`unknown voice tool "${name}"`);
  }
  const parsed = toolDefinition.args.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(
      `invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`
    );
  }
  // parsed.data has the tool's own Args type; the registry array erased it.
  return toolDefinition.execute(parsed.data as never, ctx);
}

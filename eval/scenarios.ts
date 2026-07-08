/**
 * Eval scenarios: chat prompts whose correct outcome is one `ui` tool call
 * with a byte-exact, pre-known spec. Pinning the spec makes runs comparable
 * across models/settings (same output tokens, same shape) and lets the
 * harness verify correctness mechanically — we are timing the pipeline, not
 * grading creativity.
 */

export interface Scenario {
  key: string;
  /** The chat message the harness sends. */
  prompt: string;
  /**
   * The exact spec the ui tool call must carry (modulo leading/trailing
   * whitespace per line). Known in advance for both scenarios — `grounded`
   * derives it from eval/wiki/journeys.md, which the harness controls.
   */
  expectedSpec: string;
  /** Whether the scenario requires reading the wiki before generating. */
  readsWiki: boolean;
}

/**
 * Baseline: the spec is dictated verbatim in the prompt. Measures pure
 * pipeline latency — CLI spawn, prompt processing, tool-call streaming —
 * with zero exploration or authoring work.
 */
const FIXED_SPEC = [
  'root = Stack([title, list])',
  'title = Content("<h1>Customer Journeys</h1>")',
  'list = Content("<ul><li>J1 — Explore a bundle</li><li>J2 — Talk about the bundle</li><li>J3 — Refine it</li><li>J4 — Keep it</li></ul>")',
].join("\n");

/**
 * Wiki-grounded: same output shape, but the <li> texts must be pulled from
 * journeys.md. Adds one wiki read + minimal comprehension to the baseline,
 * isolating the cost of grounding. The expected spec is still exact because
 * the harness owns the fixture wiki.
 */
const GROUNDED_SPEC = [
  'root = Stack([title, list])',
  'title = Content("<h1>Customer Journeys</h1>")',
  'list = Content("<ul><li>J1 — Explore a bundle (the core promise)</li><li>J2 — Talk about the bundle (conversation as a first-class mode)</li><li>J3 — Refine it (the collaboration loop)</li><li>J4 — Keep it (persistence)</li></ul>")',
].join("\n");

export const SCENARIOS: Scenario[] = [
  {
    key: "fixed",
    readsWiki: false,
    expectedSpec: FIXED_SPEC,
    prompt:
      "Call the ui tool exactly once to create a new artifact. Pass name " +
      '"journeys-overview" and pass spec as EXACTLY these three statements, ' +
      "byte for byte, in this order:\n\n" +
      FIXED_SPEC +
      "\n\nDo not change, add, or remove anything. Do not use any other " +
      "tools. After the tool call, end your turn without commentary.",
  },
  {
    key: "grounded",
    readsWiki: true,
    expectedSpec: GROUNDED_SPEC,
    prompt:
      "Read journeys.md from the wiki. Then call the ui tool exactly once " +
      'to create a new artifact with name "journeys-overview" and a spec of ' +
      "exactly this shape:\n\n" +
      'root = Stack([title, list])\n' +
      'title = Content("<h1>Customer Journeys</h1>")\n' +
      'list = Content("<ul>…</ul>")\n\n' +
      "where the <ul> contains one <li> per journey J1 through J4 (in " +
      "order, nothing else), each <li> being that journey's full \"## \" " +
      "heading text from journeys.md, verbatim. No other tool calls, no " +
      "commentary after the ui call.",
  },
];

/**
 * The speed-hint dimension: when on, this line is prepended to the prompt.
 * Tests whether telling the model to hurry actually changes wall-clock time.
 */
export const SPEED_HINT =
  "Time is critical: work as fast as you can, with minimal thinking and no " +
  "prose beyond what is asked.\n\n";

/** Normalize a spec for comparison: per-line trim, drop blank lines. */
export function normalizeSpec(spec: string): string {
  return spec
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { componentSignatures } from "./ui-library.js";

/**
 * The appended system prompt is authored as markdown under server/prompts/
 * so it can be edited without touching code:
 *
 *   system-prompt.md — role, the ui tool (with a {{COMPONENT_SIGNATURES}}
 *                      placeholder filled from the component schemas),
 *                      grounding, and the state/set_state policy
 *   wiki.md          — appended only when a wiki is configured
 *
 * Files are read on every session spawn, so a prompt edit takes effect the
 * next time the CLI (re)starts — no server rebuild. Missing files or an
 * unresolved placeholder throw: a session must never start with a broken
 * prompt.
 */

// Resolves from both src/ (tsx dev) and dist/ (compiled): ../prompts.
const PROMPTS_DIR = path.resolve(import.meta.dirname, "../prompts");

const SIGNATURES_PLACEHOLDER = "{{COMPONENT_SIGNATURES}}";

export function buildSystemPrompt(options: { wikiDir?: string }): string {
  const template = readPromptFile("system-prompt.md");
  if (!template.includes(SIGNATURES_PLACEHOLDER)) {
    throw new Error(
      `system-prompt.md must contain ${SIGNATURES_PLACEHOLDER} — without it the LLM never learns the component vocabulary`
    );
  }
  const prompt = template.replace(SIGNATURES_PLACEHOLDER, componentSignatures());
  if (options.wikiDir === undefined) return prompt;
  return `${prompt}\n\n${readPromptFile("wiki.md")}${preloadedPages(options.wikiDir)}`;
}

/**
 * Wiki preload (decisions.md D7): inline small wiki pages into the appended
 * prompt so grounded generations skip the mid-turn read round trip — the
 * timing eval measured ask→UI 7.7s→4.4s on the grounded scenario, with the
 * read turn disappearing entirely (eval/sweep-report.md, 2026-07-12).
 *
 * Root-level .md files only, whole files only (a truncated page would be a
 * grounding hazard), smallest-first until the byte budget is spent.
 * WIKI_PRELOAD_BYTES overrides the budget; 0 disables preloading.
 */
const PRELOAD_BUDGET_DEFAULT = 24_576;

const PRELOAD_INSTRUCTION = `## Preloaded wiki pages

The following wiki pages are included verbatim below, current as of session
start. When a task involves one of these pages, use the copy below directly —
do not re-read it with the vault/wiki tools. Use the tools for pages not
included here, and re-read any page that has been edited during this session
(the copies below do not update).`;

function preloadedPages(wikiDir: string): string {
  const budget = Number(process.env.WIKI_PRELOAD_BYTES ?? PRELOAD_BUDGET_DEFAULT);
  if (!Number.isFinite(budget) || budget <= 0) return "";
  let names: string[];
  try {
    names = readdirSync(wikiDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return ""; // unreadable wiki dir: preload is an optimization, never fatal
  }
  const pages = names
    .map((name) => ({ name, size: statSync(path.join(wikiDir, name)).size }))
    .sort((a, b) => a.size - b.size || a.name.localeCompare(b.name));
  const included: string[] = [];
  let used = 0;
  for (const page of pages) {
    if (used + page.size > budget) break; // ascending sizes: nothing later fits either
    included.push(
      `### ${page.name}\n\n${readFileSync(path.join(wikiDir, page.name), "utf8").trim()}`
    );
    used += page.size;
  }
  if (included.length === 0) return "";
  return `\n\n${PRELOAD_INSTRUCTION}\n\n${included.join("\n\n")}`;
}

function readPromptFile(name: string): string {
  try {
    return readFileSync(path.join(PROMPTS_DIR, name), "utf8").trim();
  } catch (err) {
    throw new Error(`could not read prompt file ${name}: ${String(err)}`);
  }
}

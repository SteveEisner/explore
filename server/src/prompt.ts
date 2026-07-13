import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { componentSignatures } from "./ui-library.js";

/**
 * The appended system prompt is authored as markdown under server/prompts/
 * so it can be edited without touching code:
 *
 *   system-prompt.md — role, the ui tool (with an {{OUI_LANG}} placeholder),
 *                      grounding, and the state/set_state policy
 *   oui-lang.md      — the OpenUI Lang explainer (syntax + component
 *                      signatures via {{COMPONENT_SIGNATURES}}); shared
 *                      verbatim with the voice agent (ouiLangExplainer),
 *                      so both intelligences learn the same language
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
const OUI_LANG_PLACEHOLDER = "{{OUI_LANG}}";

/**
 * The OpenUI Lang teaching text (syntax rules + live component signatures)
 * — the single source both agents learn the language from: substituted into
 * the Claude session's system prompt here, appended to the voice agent's
 * session instructions by voice.ts.
 */
export function ouiLangExplainer(): string {
  const template = readPromptFile("oui-lang.md");
  if (!template.includes(SIGNATURES_PLACEHOLDER)) {
    throw new Error(
      `oui-lang.md must contain ${SIGNATURES_PLACEHOLDER} — without it the LLM never learns the component vocabulary`
    );
  }
  return template.replace(SIGNATURES_PLACEHOLDER, componentSignatures());
}

export function buildSystemPrompt(options: { wikiDir?: string }): string {
  const template = readPromptFile("system-prompt.md");
  if (!template.includes(OUI_LANG_PLACEHOLDER)) {
    throw new Error(
      `system-prompt.md must contain ${OUI_LANG_PLACEHOLDER} — without it the LLM never learns OpenUI Lang`
    );
  }
  const prompt = template.replace(OUI_LANG_PLACEHOLDER, ouiLangExplainer());
  if (options.wikiDir === undefined) return prompt;
  return `${prompt}\n\n${readPromptFile("wiki.md")}${preloadedPages(options.wikiDir)}`;
}

/**
 * Wiki preload (decisions.md D7): inline small wiki pages into the appended
 * prompt so grounded generations skip the mid-turn read round trip — the
 * timing eval measured ask→UI 7.7s→4.4s on the grounded scenario, with the
 * read turn disappearing entirely (eval/sweep-report.md, 2026-07-12).
 *
 * All .md files in the wiki tree (hidden files/dirs skipped), whole files
 * only (a truncated page would be a grounding hazard), smallest-first until
 * the byte budget is spent. Pages are labeled with their wiki-relative path
 * so the model can connect a preloaded copy to the file the tools would read.
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
  const pages = listMarkdownPages(wikiDir).sort(
    (a, b) => a.size - b.size || a.relPath.localeCompare(b.relPath)
  );
  const included: string[] = [];
  let used = 0;
  for (const page of pages) {
    if (used + page.size > budget) break; // ascending sizes: nothing later fits either
    included.push(
      `### ${page.relPath}\n\n${readFileSync(path.join(wikiDir, page.relPath), "utf8").trim()}`
    );
    used += page.size;
  }
  if (included.length === 0) return "";
  return `\n\n${PRELOAD_INSTRUCTION}\n\n${included.join("\n\n")}`;
}

/**
 * Every .md file under the wiki as wiki-relative paths with sizes, recursing
 * into subdirectories. Hidden files and directories (dotfiles: the vault
 * index, editor state) are skipped. An unreadable directory contributes
 * nothing — preload is an optimization, never fatal.
 */
function listMarkdownPages(wikiDir: string, relDir = ""): { relPath: string; size: number }[] {
  let entries;
  try {
    entries = readdirSync(path.join(wikiDir, relDir), { withFileTypes: true });
  } catch {
    return [];
  }
  const pages: { relPath: string; size: number }[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      pages.push(...listMarkdownPages(wikiDir, relPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      pages.push({ relPath, size: statSync(path.join(wikiDir, relPath)).size });
    }
  }
  return pages;
}

function readPromptFile(name: string): string {
  try {
    return readFileSync(path.join(PROMPTS_DIR, name), "utf8").trim();
  } catch (err) {
    throw new Error(`could not read prompt file ${name}: ${String(err)}`);
  }
}

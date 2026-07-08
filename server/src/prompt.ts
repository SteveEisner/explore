import { readFileSync } from "node:fs";
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

export function buildSystemPrompt(options: { wiki: boolean }): string {
  const template = readPromptFile("system-prompt.md");
  if (!template.includes(SIGNATURES_PLACEHOLDER)) {
    throw new Error(
      `system-prompt.md must contain ${SIGNATURES_PLACEHOLDER} — without it the LLM never learns the component vocabulary`
    );
  }
  const prompt = template.replace(SIGNATURES_PLACEHOLDER, componentSignatures());
  return options.wiki ? `${prompt}\n\n${readPromptFile("wiki.md")}` : prompt;
}

function readPromptFile(name: string): string {
  try {
    return readFileSync(path.join(PROMPTS_DIR, name), "utf8").trim();
  } catch (err) {
    throw new Error(`could not read prompt file ${name}: ${String(err)}`);
  }
}

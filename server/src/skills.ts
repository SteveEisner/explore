import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Agent Skills for the embedded LLM session.
 *
 * Skills are authored (and versioned) in server/skills/<name>/SKILL.md, but
 * the CLI only discovers skills from the *project* scope of its working
 * directory — the gitignored, disposable sandbox. This module copies the
 * authored skills into <sandbox>/.claude/skills before each spawn, so:
 *
 * - a fresh checkout / wiped sandbox always gets the current skills;
 * - skill edits apply on the next session spawn, like prompt edits;
 * - skills deleted from server/skills disappear from the sandbox too
 *   (the target directory is replaced, not merged).
 *
 * Discovery requires the session to run with `--setting-sources "project"`
 * (project scope only): the sandbox is entirely server-materialized, so no
 * foreign settings can ride along, while user-/plugin-level skills stay
 * excluded. The `Skill` tool must also be in --tools and --allowedTools.
 */

// Resolves from both src/ (tsx dev) and dist/ (compiled): ../skills.
const SKILLS_SOURCE = path.resolve(import.meta.dirname, "../skills");

/**
 * Replace `sandboxDir`/.claude/skills with the authored skills. A missing
 * source directory is fine (no skills shipped); an existing target is
 * removed first so stale skills never survive a rename or deletion.
 */
export function materializeSkills(
  sandboxDir: string,
  source: string = SKILLS_SOURCE
): void {
  const target = path.join(sandboxDir, ".claude", "skills");
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(source)) return;
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

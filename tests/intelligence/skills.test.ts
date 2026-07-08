import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { materializeSkills } from "../../server/src/skills.js";

/**
 * Skill delivery to the embedded LLM session: the CLI discovers skills only
 * from its sandbox cwd's .claude/skills, so `materializeSkills` must copy
 * the authored server/skills tree there before every spawn — and *replace*
 * what was there, so renamed or deleted skills never linger in a sandbox
 * that outlives many server versions. These tests prove that copy/replace
 * contract, plus the shape of the shipped skill the whole story depends on.
 */

describe("materializeSkills into the sandbox", () => {
  let root: string;
  let source: string;
  let sandbox: string;
  const target = () => path.join(sandbox, ".claude", "skills");

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "explore-skills-"));
    source = path.join(root, "authored-skills");
    sandbox = path.join(root, "sandbox");
    await mkdir(path.join(source, "explaining-clarity"), { recursive: true });
    await writeFile(
      path.join(source, "explaining-clarity", "SKILL.md"),
      "---\nname: explaining-clarity\ndescription: d\n---\nbody\n"
    );
    await mkdir(sandbox, { recursive: true });
  });
  after(() => rm(root, { recursive: true, force: true }));

  it("copies the authored skills into <sandbox>/.claude/skills", async () => {
    materializeSkills(sandbox, source);

    const copied = await readFile(
      path.join(target(), "explaining-clarity", "SKILL.md"),
      "utf8"
    );
    assert.match(copied, /name: explaining-clarity/);
  });

  it("replaces the target: skills removed at the source disappear", async () => {
    // A sandbox outlives server versions; a stale skill left behind would
    // keep teaching the model deleted guidance.
    await mkdir(path.join(target(), "stale-skill"), { recursive: true });
    await writeFile(path.join(target(), "stale-skill", "SKILL.md"), "old");

    materializeSkills(sandbox, source);

    assert.deepEqual(await readdir(target()), ["explaining-clarity"]);
  });

  it("a missing source just clears the sandbox skills", async () => {
    materializeSkills(sandbox, path.join(root, "does-not-exist"));
    assert.equal(existsSync(target()), false);
  });
});

describe("the shipped explaining-clarity skill", () => {
  const skillPath = path.resolve(
    import.meta.dirname,
    "../../server/skills/explaining-clarity/SKILL.md"
  );

  it("has the frontmatter the CLI's skill listing requires", async () => {
    const text = await readFile(skillPath, "utf8");
    const [, frontmatter] = text.split("---");
    assert.match(frontmatter, /^name: explaining-clarity$/m);
    // The description is the load trigger: it must name both explanatory
    // chat and artifact building, or the model won't reach for the skill.
    const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? "";
    assert.match(description, /explain/i);
    assert.match(description, /artifact/i);
  });
});

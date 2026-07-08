/**
 * Matrix runner for the UI-generation timing eval.
 *
 * Each flag takes a comma-separated list; the runner executes the full cross
 * product, serially (parallel runs would contend for API throughput and
 * contaminate each other's timings). Results land in
 * eval/results/<label>/: runs.jsonl (one result per line, config + timings),
 * plus one server event log per run for post-hoc breakdowns.
 *
 *   npx tsx eval/run.ts                                     # single smoke run
 *   npx tsx eval/run.ts --model claude-haiku-4-5 --scenario fixed,grounded
 *   npx tsx eval/run.ts --model a,b --effort low,high --reps 3 --label sweep1
 *
 * "default" in --model/--effort means "don't pass the flag" (CLI default).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runOne, type RunConfig, type RunResult } from "./harness.js";
import { SCENARIOS } from "./scenarios.js";

interface Flags {
  scenario: string[];
  model: string[];
  effort: string[];
  prompt: string[];
  speed: string[];
  warm: string[];
  reps: number;
  label: string;
  timeoutMs: number;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    scenario: ["fixed"],
    model: ["default"],
    effort: ["default"],
    prompt: ["full"],
    speed: ["off"],
    warm: ["on"],
    reps: 1,
    label: new Date().toISOString().replace(/[:.]/g, "-"),
    timeoutMs: 240_000,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || value === undefined) throw new Error(`dangling flag: ${argv[i]}`);
    switch (key) {
      case "scenario": flags.scenario = value.split(","); break;
      case "model": flags.model = value.split(","); break;
      case "effort": flags.effort = value.split(","); break;
      case "prompt": flags.prompt = value.split(","); break;
      case "speed": flags.speed = value.split(","); break;
      case "warm": flags.warm = value.split(","); break;
      case "reps": flags.reps = Number(value); break;
      case "label": flags.label = value; break;
      case "timeout": flags.timeoutMs = Number(value) * 1000; break;
      default: throw new Error(`unknown flag: --${key}`);
    }
  }
  return flags;
}

function buildMatrix(flags: Flags, resultsDir: string): RunConfig[] {
  const configs: RunConfig[] = [];
  for (const scenarioKey of flags.scenario) {
    const scenario = SCENARIOS.find((s) => s.key === scenarioKey);
    if (!scenario) throw new Error(`unknown scenario: ${scenarioKey}`);
    for (const model of flags.model)
      for (const effort of flags.effort)
        for (const prompt of flags.prompt)
          for (const speed of flags.speed)
            for (const warm of flags.warm)
              for (let rep = 1; rep <= flags.reps; rep++) {
                if (prompt !== "full" && prompt !== "slim")
                  throw new Error(`unknown prompt variant: ${prompt}`);
                if (speed !== "off" && speed !== "on")
                  throw new Error(`unknown speed value: ${speed}`);
                if (warm !== "off" && warm !== "on")
                  throw new Error(`unknown warm value: ${warm}`);
                const tag = [scenarioKey, model, effort, prompt, speed, warm, rep].join("_");
                configs.push({
                  scenario,
                  model: model === "default" ? undefined : model,
                  effort: effort === "default" ? undefined : effort,
                  promptVariant: prompt,
                  speedHint: speed === "on",
                  warm: warm === "on",
                  rep,
                  eventsLog: path.join(resultsDir, `events_${tag}.jsonl`),
                  timeoutMs: flags.timeoutMs,
                });
              }
  }
  return configs;
}

function fmt(ms: number | undefined): string {
  return ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function summarize(results: RunResult[]): void {
  const header = [
    "scenario", "model", "effort", "prompt", "speed", "warm", "rep",
    "ok", "match", "warmup", "init", "1st-delta", "ui-start", "ui-done", "result", "cost",
  ];
  const rows = results.map((r) => [
    r.scenario,
    r.model,
    r.effort,
    r.promptVariant,
    r.speedHint ? "on" : "off",
    r.warm ? "on" : "off",
    String(r.rep),
    r.ok ? "✓" : "✗",
    r.specMatch === undefined ? "—" : r.specMatch ? "✓" : "✗",
    fmt(r.warmupMs),
    fmt(r.timings.initMs),
    fmt(r.timings.firstDeltaMs),
    fmt(r.timings.uiStartMs),
    fmt(r.timings.uiSpecMs),
    fmt(r.timings.resultMs),
    r.costUsd === undefined ? "—" : `$${r.costUsd.toFixed(3)}`,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("\n" + line(header));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const row of rows) console.log(line(row));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const resultsDir = path.resolve(import.meta.dirname, "results", flags.label);
  mkdirSync(resultsDir, { recursive: true });
  const runsFile = path.join(resultsDir, "runs.jsonl");

  const matrix = buildMatrix(flags, resultsDir);
  console.log(`${matrix.length} run(s) → ${resultsDir}`);

  const results: RunResult[] = [];
  for (const [i, config] of matrix.entries()) {
    const desc = `${config.scenario.key} model=${config.model ?? "default"} effort=${config.effort ?? "default"} prompt=${config.promptVariant} speed=${config.speedHint ? "on" : "off"} warm=${config.warm ? "on" : "off"} rep=${config.rep}`;
    console.log(`[${i + 1}/${matrix.length}] ${desc}`);
    const result = await runOne(config);
    results.push(result);
    appendFileSync(runsFile, JSON.stringify(result) + "\n");
    console.log(
      result.ok
        ? `    ui-done ${fmt(result.timings.uiSpecMs)}, result ${fmt(result.timings.resultMs)}, match ${result.specMatch ? "✓" : "✗"}, cost ${result.costUsd !== undefined ? `$${result.costUsd.toFixed(3)}` : "?"}`
        : `    FAILED: ${result.error?.split("\n")[0]}`
    );
  }

  summarize(results);
  const failures = results.filter((r) => !r.ok).length;
  if (failures > 0) console.log(`\n${failures} run(s) failed — see ${runsFile}`);
}

void main();

# Four-Hour Review — 2026-07-07

What got built between the two-hour mark and the end of day one, measured against [proposal.md](proposal.md) and [journeys.md](journeys.md). Companion to [two-hour-review.md](two-hour-review.md). "Four-hour" is the milestone label; the corrected accounting below puts the day at ~4¾ chargeable hours.

## Time accounting (corrected from session data)

Unlike the two-hour review, this accounting comes from the Claude session JSONL logs (every timestamped event across all 22 sessions in the project, breaks detected as >15-minute gaps in the union timeline), cross-checked against git commit times — not from the worklog's reconstructed entries. Times local.

| Block | Wall clock | Duration | What |
|---|---|---|---|
| 1 | 15:29 – 16:13 | 0:44 | Kickoff: proposal/docs session and scaffold session launched in parallel (first commit 15:45) |
| — | 16:33 – 16:36 | 0:03 | Brief poke at the app mid-break |
| 2 | 17:11 – 19:06 | 1:55 | Vocabulary, benchmark .oui, D4, multimodal (Workers 2/3 in parallel); agents drained until 19:15 |
| — | 19:06 – 20:36 | break | ~1h30 |
| 3 | 20:36 – 23:03 | 2:27 | Evening block: six concurrent sessions (main + Workers 1/2 + Cleaner + Optimizer + TODO-taker) |

- **Gross tracked work: ~5h09.**
- **Outward reporting excluded (not development):** writing the two-hour review (~15 min, 18:45–19:00) and the block-closing goals review (~10 min, ~22:33) → **chargeable ≈ 4h45**. The session that produced this report is likewise excluded.
- **Remaining of the 8-hour allotment: ~3h15.**

Two corrections to the contemporaneous record:

1. **The day started at 15:29, not 15:55.** The two-hour review reconstructed kickoff from file timestamps and undercounted by ~26 minutes; both kickoff prompts fired at 15:29:01 and the scaffold was committed at 15:45. The "~2h05 tracked" claimed at the 19:05 break was really ~2h39 gross (~2h25 excluding review-writing) — the two-hour limit was already modestly blown before the "I'm having fun" extension was invoked.
2. **The evening block ran long.** Planned to ~22:40; the last worklog-logged fix landed 22:57 and the main session closed at 23:03.

One open policy question for the budget: the Optimizer's parameter sweep (~45–60 min, deferred to 2026-07-08) is designed to run unattended. The worklog convention so far counts attended time only; decide before the sweep whether unattended agent time draws down the 8 hours.

## Verdict

The two-hour review ended with one instruction: run the real experiment. The evening block did — **J1 ran end-to-end (wiki bundle → generated exploration) and was called proven in the block-closing review** — and around it landed the largest infrastructure haul of the day: the full D3 state chain, J4 save/reopen/edit closing the artifact lifecycle, a real test suite, enforced quality gates, a rebuilt prompt system, and a performance program with hard numbers. The cost of that breadth: J2 is still untouched, the generated-vs-archetype comparison was never written down as a graded artifact, and the context switcher — flagged at two hours — still doesn't exist, so context levels remain invisible to users. The project is now organized around journeys rather than phases, and by that frame: J4 closed, J1 first-pass proven, J3 instrumented but not yet fast, J2 and J0 open.

## Goals vs. reality, journey by journey

**J1 (explore a bundle) — first-pass proven, not yet graded.** The core hypothesis finally got its test: the in-app LLM generated an exploration from wiki material. Supporting work was substantial — the OpenUI "invent plausible data" rule replaced with a grounding section (facts only from wiki/user), a role/identity opener countering the base prompt's coding-assistant identity, and the explaining-with-clarity doctrine synthesized from the four clarity skills and delivered as an on-demand Agent Skill (with a real discovery: `--setting-sources "project"` loads sandbox-materialized skills while preserving isolation). What's missing is the grading half of the original plan: no recorded comparison of the generated exploration against the hand-built archetype, and the "archetype-class guidance" task is still open.

**J2 (talk about the bundle) — untouched.** Defined at 20:44, never exercised. Carried forward again.

**J3 (rapid refine) — instrumented, measured, partially attacked.** The eval harness spawns isolated instances and times ask → init → first delta → ui:spec with byte-exact output checks. Findings: spawn-to-init (~1.2–1.3s) is all CLI boot, not MCP handshake or our payload; pre-warm shipped, cutting Haiku ask→UI from 6.5s to 4.8s; early model matrix (all byte-exact on the fixed scenario) — Haiku ~$0.04/4.8s, Opus 4.8 ~$0.12/4.4–7.0s, Opus 4.7 $0.17–0.28/3.2–4.0s, Fable $0.27–0.42/5.8–6.7s — making cheap-model-per-role look viable. Also fixed the worst refine-loop bug: streamed edit patches blanked the artifact panel (raw partial statements corrupted the merge; `mergeStreamingPatch` now merges only finished statements). Still open: the *interactive* loop has never been timed in the app itself, and the full sweep is deferred.

**J4 (keep it) — closed end-to-end.** Create → name → save to wiki → reopen → edit → re-save, plus the LLM editing any saved .oui directly (`edit_artifact`, statement-name merge, hostile-path rejection). The live probe of that tool caught a real bug (PORT=0 dial-back under isolated instances) — verification paying for itself again.

**J0 (get running) / the respectability bar — half done.** Instance identity fully env-parameterized with a one-command side instance; tests went 0 → 41 (real server, seeded throwaway wikis, traversal/hostile-name matrices); lint enforced via pre-commit hook; client strict mode on with zero fallout; the appended prompt moved to editable markdown and shrank ~11.0 → ~8.7KB. Clean-clone quickstart remains todo.

By the old phase frame: phases 1–2 still done; phase 3 unchanged (voice now elevated to next session); **phase 4's runtime substrate is now real** — hierarchical KV state store, `set_state` (the LLM can open files, switch tabs, change context level exactly as if the user clicked), and the D3 state-key manifest seeding initial state — but no interactive exploration *elements* yet; phase 5 gained a Home/folder view; phase 6 still not started (Home subsumed the wiki-browser stretch task).

## The novel bets — how they're doing

1. **D4 (structural components as named editing points) paid off functionally, not just aesthetically.** Statement-name identity is now the merge key for three different write paths — streamed patches, panel edits, and `edit_artifact` file edits — and the blanking fix worked precisely because statement boundaries are recoverable mid-stream. The bet predicted editability; the payoff arrived as merge semantics.
2. **D3 completed both halves** (store + manifest), and the manifest respected the positional-args constraint discovered at hour two (new prop appended last so existing artifacts don't shift) — the first time that finding shaped a design.
3. **The prompt/invocation audit became a product improvement pipeline.** The invocation report's findings (fabrication rule, wrong component suggestions, coding-assistant identity, visible-but-denied `workflow` tool) all got fixed within two hours of being documented, each verified by assertion script or live probe.
4. **Collaboration mechanisms: still plumbing-proven, not steering-proven.** No session yet used drawing/screenshot feedback to refine an actual explanation. Unchanged since hour two; now joined by voice as the declared next multimodal push.

## What's not yet proven

- **J1 quality.** The loop ran, but there's no graded artifact comparing generated output to the archetype, and no guidance iteration recorded against gaps. "It ran" and "it's archetype-class" are different claims; only the first is made.
- **J2, entirely.**
- **Context levels for humans.** The LLM can set the level via `set_state`; a user still can't. Levels 1–3 content remains unreachable by hand — flagged at two hours, still true.
- **Bundles aren't real.** One flat docs/ directory that is also the project's own documentation; no per-exploration spaces or sessions.
- **The interactive-loop numbers.** All timing so far is harness-measured on scripted scenarios; per-turn timing in real use (the J3 measure task) hasn't run.
- **Deferred with eyes open:** voice (long lead, start early next session), clean-clone quickstart, vault search verification, Content sandboxing.

## Process observations

- **Parallelism scaled from task-workers to an organization.** The evening block ran six concurrent sessions with three *standing roles* (Cleaner: quality gates and dependency hygiene; Optimizer: the perf program; TODO-taker: capture without interruption) alongside two task workers and the main session. Session-active time across the day sums to ~12.6 agent-hours inside ~5.1 wall-hours (~2.5× leverage). Steering stayed cheap: ~130 human prompts all day, with workers running long autonomous stretches (Worker 3: sandboxing landed on 2 prompts in 24 minutes).
- **The blitz backlog convention held.** Small findings got banked instead of fixed on sight (six rows currently), and the Cleaner cleared three in one pass. Nit-fixing stopped leaking into task time.
- **Coordination stayed cheap:** of 47 commits, ~7 are tracking-only; one shared-file collision all day (at hour two, none since). TASKS.md consolidation (three task surfaces → one) removed a real ambiguity workers had been navigating.
- **Verification-first kept catching real bugs:** the edit_artifact live probe → PORT=0 dial-back; the manifest Chrome probe → a render-order race; the Home view → the missing /api dev proxy.
- **The session logs are now the time authority.** The worklog reconstructed kickoff wrong by ~26 minutes; the JSONL timestamps didn't. For the writeup, trust the logs (and note that the app's own pre-warm pings and eval instances appear as sessions — 11 of the 22 session files are the product's, not the author's).

## Inventory delta (since the two-hour review)

### Newly brought in

- **oxlint** (server workspace + pre-commit), **node:test via tsx** as the test runner, the **.githooks/prepare** pattern for versioned hooks.
- **Haiku as the cheap eval model** — the whole perf program runs on $0.02–0.05 probes.

### Built (hours ~2–4¾)

- **The state chain (D3 complete):** hierarchical KV store; every UI surface reads/writes it; `set_state` MCP tool → websocket → store, LLM-drivable; state-key manifest on Stack with render-order-correct seeding.
- **The artifact lifecycle (J4):** save with name bar and overwrite protection; reopen/edit; `edit_artifact` for direct LLM edits of saved files; wiki hot-reload throughout.
- **The test suite:** 41 tests over a real spawned server — /docs retrieval, artifact:save hostile matrix, hot-reload, wiki MCP over stdio, skills materialization.
- **Quality gates:** enforced lint, client strict mode, pre-commit typecheck+lint, root `check`.
- **The prompt system:** markdown-authored appended prompt with a `toSpec()` seam (signatures always match schemas), grounding section, role opener, tool-description dedupe, `workflow` tool removed; skills materialized into the sandbox per spawn.
- **The perf program:** env-parameterized instance identity + side-instance script; eval harness with byte-exact checks; spawn decomposition; connect-time pre-warm; partial model sweep data.
- **Home view** + `GET /api/wiki/files` sharing one inventory with the wiki MCP.
- **Fixes that mattered:** streaming-edit blanking, PORT=0 dial-back, /api dev proxy.
- **Process artifacts:** blitz backlog convention, single consolidated TASKS.md, invocation report, explaining-with-clarity doctrine + skill.

### Techniques (new this block)

- **Standing-role agents** — persistent specialists (Cleaner/Optimizer/TODO-taker) rather than only per-task workers; each accumulates context in its lane.
- **Bank-don't-fix** — the blitz backlog as a pressure valve that keeps small findings from fragmenting focused work.
- **Probe-driven flag discovery** — four cheap CLI probes settled the `--setting-sources` skills question empirically before any code was written.
- **Cheap-model live verification** — every risky change proven on a $0.02–0.05 Haiku run before being called done.
- **Instrument, then optimize** — the pre-warm shipped only after spawn-to-init was decomposed and the CLI-boot conclusion ruled out cheaper levers.

## Suggested next session

Already declared at block close (top of TASKS.md): **Phase 4, interactive exploration** — fed by (a) the Optimizer's latency work, (b) J1/J2 clear-explaining findings, (c) an early start on voice. From this review, two additions with the remaining ~3h15 in mind: **grade the J1 output against the archetype and write it down** (the hypothesis needs a quality verdict, not just a completion), and **ship the context switcher** — it's the third review to mention it, and it blocks both J1 grading at depth and the phase-4 story. Decide the unattended-time policy before launching the sweep.

# UI-generation timing sweep — where the time goes (2026-07-11)

Full `eval/sweep.sh` run, unattended: 56 runs across four fractional sweeps
(models / effort / prompt / speed), 2 reps per cell, warm sessions, fixed +
grounded scenarios. **All 56 runs succeeded, every spec byte-exact, one UI
call per run, zero warm leaks.** Total spend: **$7.29** (under the $10–15
estimate). Raw data: `eval/results/sweep-*/runs.jsonl` (gitignored); console
log in `eval/results/sweep-console-20260711-223103.log`.

Headline metric is `uiSpecMs` — chat send → complete `ui` tool-call input,
the proxy for "UI on screen." Medians of 2 reps unless noted.

## Headline: model choice dominates; the other knobs barely matter

| model | fixed uiSpec | grounded uiSpec | cost/turn (med) |
|---|---|---|---|
| **claude-opus-4-8** | **2.8s** | **5.5s** | $0.12 |
| **claude-sonnet-5** | **2.9s** | **5.2s** | $0.12 |
| claude-opus-4-7 | 3.1s | 5.8s | $0.22 |
| claude-sonnet-4-6 | 3.8s | 6.2s | $0.10 |
| claude-haiku-4-5 | 4.9s | 9.1s | $0.04 |
| claude-fable-5 | 6.4s | 9.5s | $0.33 |

- **Opus 4.8 and Sonnet 5 are a statistical tie for fastest** and cost the
  same (~$0.12/turn). Either is the production pick.
- **Haiku is not the fast option** — it's 2× slower than Opus 4.8 to UI
  despite being 3× cheaper. Its time-to-first-token is the problem (4.0s
  fixed / 5.4s grounded vs 1.9s/2.8s on Opus 4.8). Cheap-model-per-role
  still makes sense for cost, not latency.
- **Fable 5 is the wrong tool here**: slowest and priciest on a task every
  model completes byte-exact.
- Note: the 6 partial runs from 2026-07-07 had Opus 4.8 at 5.7s median on
  the identical cell; tonight it's 2.8s. API-side variance across days is
  real — treat cross-day comparisons with suspicion, and rerun a small
  control cell before trusting any future delta.

## The waterfall (models sweep, medians)

`send → first delta → ui:spec complete → result`

| model | send→firstDelta | firstDelta→uiSpec | uiSpec→result (post-UI tail) |
|---|---|---|---|
| opus-4-8 fixed | 1.9s | 0.9s | 1.6s |
| sonnet-5 fixed | 2.0s | 0.8s | 2.4s |
| opus-4-8 grounded | 2.8s | 2.7s | 2.3s |
| sonnet-5 grounded | 4.1s | 1.1s | 1.6s |
| haiku fixed | 4.0s | 0.9s | 5.4s |
| sonnet-4-6 fixed | 2.9s | 0.8s | 5.2s |

- **Time-to-first-token is the biggest slice of perceived latency** on the
  fast models (~2/3 of fixed-scenario uiSpec). Streaming the tool call
  itself is fast (~0.9s for a 210-byte spec).
- **The 4–6s post-UI tail flagged in the early data mostly vanishes on the
  new-generation models** (1.6–2.4s on Opus 4.8 / Sonnet 5, vs 5.2–5.4s on
  Sonnet 4.6 / Haiku). Since it's after the UI is visible it doesn't hurt
  perceived latency anyway — deprioritize.
- **Grounded adds ~2.5s over fixed** (wiki read + comprehension), split
  between first-token delay and mid-generation tool round trip. This is the
  largest remaining addressable chunk: candidates are preloading/caching
  likely wiki pages into the prompt at connect time, or accepting it.
- Warm-up (~3.5–4.5s) is off the critical path — production pre-warms at
  connect while the user types.

## The other three knobs: null results (useful ones)

- **Effort (low/medium/high/xhigh)**: no latency effect — 2.8–3.3s across
  the whole range on both Opus 4.8 and Sonnet 5, identical cost. The task
  doesn't trigger meaningful thinking. Leave the default; don't ship an
  effort knob for generation latency.
- **Slim prompt (~1KB vs ~11KB)**: **no latency win** (Opus even trended
  slightly slower), but **~25% cheaper** ($0.119→$0.087 Opus, $0.094→$0.075
  Sonnet). Prompt size is a cost lever, not a latency lever — prompt cache
  is evidently absorbing the latency cost already. Adopting slim needs a
  quality check beyond the fixed scenario before shipping.
- **Speed hint** ("time is critical" prepended): ~0.2–0.3s median
  improvement, within rep-to-rep noise. Not worth the prompt clutter.

## Recommendations

1. **Default generation model: `claude-opus-4-8`** (Sonnet 5 equal-fast,
   equal-cost alternate; keep both wired via the `--model` parameterization
   already in progress).
2. **Kill the speed-hint and effort ideas** — measured null.
3. **For the cost task (TASKS.md)**: Haiku for low-stakes edit turns
   ($0.04, quality byte-exact on this task), Opus 4.8 for generation; slim
   prompt is a further −25% pending a quality pass.
4. **Next latency target**: the grounded-scenario wiki-read cost (~2.5s).
   Everything else on the critical path is model-side time-to-first-token.

## Follow-up sweep: the five next-knob candidates (2026-07-12)

Five candidate knobs from the sweep findings, each tested or resolved by
analysis (`eval/results/sweep-preload*/`, ~$3):

### Preload wiki content into the system prompt — **proven, the one real win**

New `preload-wiki` prompt variant (production prompt + `journeys.md` inlined
with a "use this copy, don't re-read" instruction; generated file at
`eval/prompts/preload-wiki.md` — regenerate after prompt edits). Grounded
scenario, 3 reps, byte-exact throughout:

| model | grounded `full` | grounded `preload` | turns | cost |
|---|---|---|---|---|
| opus-4-8 | 7.7s (5.4–8.4) | **4.4s** (4.0–4.4) | 3 → **2** | $0.152 → $0.143 |
| sonnet-5 | 5.2s (5.0–5.3) | **4.4s** (3.7s×2, one 14.5s API stall) | 3 → **2** | $0.116 → $0.109 |

The mechanism is visible in `numTurns`: every preload run skipped the wiki
read entirely (3 turns → 2). Grounded latency lands near fixed-scenario
levels, cost drops slightly (fewer turns beats the bigger prompt), and the
fixed scenario shows no regression (2.7→2.9s opus, 3.4→3.1s sonnet — noise).
Productionizing means choosing *what* to preload for a real wiki (connect-time
injection of likely pages, or a digest) — the fixture proves the ceiling.

### The other four, resolved without new runs

- **Fast mode** — blocked: the CLI exposes no `--fast`/speed flag in
  headless `--print` mode. Re-check on CLI upgrades; it remains the biggest
  untapped lever (up to 2.5× output speed, same model).
- **Progressive spec rendering (client)** — win quantified from existing
  data: first-spec-byte → complete-spec is 0.8–0.9s (fixed) / 1.1–1.4s
  (grounded) on Opus 4.8 / Sonnet 5. A streaming renderer reclaims up to
  ~30% of perceived time-to-UI. Client work; the harness already records
  `uiFirstDeltaMs` to measure it when built.
- **Prompt-cache audit** — confirmed healthy, nothing to fix: across all 59
  measured turns, median 226 cache-write / ~17.6K cache-read / **2**
  uncached input tokens, zero misses. First-token latency is API-side.
- **Suppress post-UI wrap-up** — disproven by event-log decomposition: the
  tail is ~10ms tool execution + ~0.8s mandatory tool-result round trip
  (5 output tokens) + ~0.65s CLI result bookkeeping. Nothing for a prompt
  to cut; the app already surfaces the UI at `ui:spec`.

Ops note: 3 of 24 sweep runs died mid-flight when a concurrent edit to
`server/src/index.ts` (voice-session work) briefly broke server startup in
the shared checkout; re-ran those cells (`sweep-preload-topup`). Serial
eval runs are exposed to in-flight server edits — run sweeps from a clean
side instance if this recurs.

## Caveats

n=2 per cell — fine for the large effects above (model gaps are 2×), too
small for sub-second deltas; day-to-day API variance observed on identical
configs. Both scenarios produce a small fixed spec (210 bytes); large-spec
generation would shift more weight into the streaming phase and deserves a
scenario of its own if we optimize there.

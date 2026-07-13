# Agent-as-a-tool timing report (2026-07-12)

Why did a delegated file creation take 70 seconds? New suite:
`eval/agent-timing.ts` invokes the back-end Claude session exactly as the
voice agent does — one `voice:tool` / `ask_artifact_agent` command over the
websocket, no chat UI — against a fully isolated server (throwaway wiki
copy), records every client-visible ws event, and reconstructs the back-end
waterfall from the server's JSONL event log (respawns, per-API-call model +
cache usage, thinking/tool-call block starts, tool results).

```sh
npx tsx eval/agent-timing.ts --mode fast,smart --reps 2
npx tsx eval/agent-timing.ts --mode fast --fast-model claude-opus-4-8   # tier override
```

Task under test: "create a wiki file with exactly this content" — the
reported-slow case. Runs: 4 default-config + 2 no-switch control + 1 smoke
(`eval/results/agent-timing-*/`).

## a) Where the time goes

Every delegated turn stacks four costs on top of the actual work:

| cost | measured | why |
|---|---|---|
| CLI respawn on model switch | ~1s boot + session fork | `--model` is a spawn flag; **both** modes respawn today — `smart` maps to the alias `"opus"`, which string-compares unequal to the session's `claude-opus-4-8`, so smart respawns onto the *same model* for nothing |
| Cold prompt cache after the switch | 11–21K uncached input tokens **per API call** of the turn (observed `cacheRead=0` on consecutive same-model calls after a fork) | prompt cache is model-scoped, and the resume fork fragments what's left; every tool call in the job repeats the pain |
| Haiku "fast" tier | 6.6–8.2s single stretches of silent thinking on a trivial task; worse tool selection | the timing sweep already showed Haiku is ~2× slower to first token than Opus 4.8; "fast ≈ Haiku" is a latency downgrade, not an upgrade |
| Wrong-tool flakiness | 2 of 4 default runs used sandbox `Write` instead of the wiki tools — file landed in `sandbox/`, **not the wiki**, while the agent replied "File created" | wrong-tool runs were also the slow runs (10–12s vs 4–5s); a false success the user experiences as "it took forever and where's my file?" |

**Control:** pinning the delegation model to the session's exact model
string (`--fast-model claude-opus-4-8`) removes the respawn entirely:
**3.3–3.8s total, correct tool and correct placement 2/2, zero silent
gaps** — versus 4–12s, 50% wrong-place, and 3–10s silent gaps with the
default config on the *same task*.

Scaling to the reported 70s: the production wiki's bigger prompt (incl. the
24KB preload), real conversation history in the resume fork (a bigger
cold-cache pass), and a multi-tool job (each call re-paying the cold cache,
each Haiku thinking stretch 5–10s) compound the same four costs; a queued
in-flight chat turn (`whenIdle`) adds its full remaining duration up front.

## b) Can streaming reduce the apparent time?

Yes — the signals exist, they just aren't forwarded:

- Even on these 4–12s toy runs, the client sees **silent gaps of 3.1–9.6s**
  (77% of the smoke run was silence). In every gap the back end had a
  streamable signal within ~2s: `message_start`, a thinking-block start, or
  a tool-call block start.
- What exists in the CLI stream today, per gap: thinking blocks start early
  but their text is **empty** (thinking display is omitted at the API
  level) — so thinking can power a *status pulse* ("working…"), not
  content. Tool calls are visible at `content_block_start` with the tool
  name — but the server currently broadcasts `chat:tool` only when the
  assistant message *completes*, several seconds later on slow runs.
  Between-tool narration (`chat:delta`) is forwarded but models rarely
  narrate before the first tool call.
- The voice model itself gets **nothing** until the blocking
  `ask_artifact_agent` returns — the browser can't inject partial tool
  output into an in-flight Realtime function call.

**Cheapest wins, in order:**
1. **Fix the respawn** (normalize model aliases before comparing; skip
   restart when equal) and **re-tier "fast"** (Opus 4.8 or Sonnet 5 — the
   sweep says Haiku is the slow option) — this shrinks the real time so
   there is less apparent time to cover.
2. **Broadcast `chat:tool` at `content_block_start`** (name is available)
   instead of at assistant-message completion — turns the biggest gaps into
   "Creating eval-timing-note.md…" within ~2s.
3. **Thinking heartbeat**: forward thinking-block start/stop as a status so
   the UI can show a live "reasoning…" indicator during Haiku-style
   stretches.
4. **Voice-side progress**: have the browser inject periodic progress
   (from `chat:tool` / `chat:delta`) as conversation context so the voice
   model can say "still working — it's editing the file now" instead of
   dead air; the tool call itself stays blocking.

## Also found (correctness, not timing)

Delegated "create a wiki file" writes to the CLI sandbox via `Write` about
half the time and still reports success. The wiki tools
(`mcp__wiki__create_file`, vault) exist and are picked reliably by Opus
with no model switch; flakiness concentrates in the switched/Haiku runs.
Worth a targeted instruction in the delegation prompt (or disallowing bare
`Write` for delegated wiki jobs) plus a success check that the file is
actually in the wiki.

## Caveats

n=7 runs, fixture wiki (small prompt), single request shape. The suite is
cheap (~$0.15/run Opus, ~$0.05 Haiku) — extend `--reps` and add request
shapes before trusting sub-second deltas. Sandbox `Write` vs wiki-tool
choice is model-behavior; rates need more reps to pin down precisely.

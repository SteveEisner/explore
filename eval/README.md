# UI-generation timing eval

Measures how long an Exploration-artifact generation takes, end to end: from
the chat request arriving at the server to the complete `ui` tool-call input
being received (`ui:spec`) — a faithful proxy for "UI complete on screen"
that doesn't require timing the front end. Owned by The Optimizer; see
TASKS.md (crunch tracks).

## How it works

Each run spawns a **fresh, isolated app instance** (ephemeral port via
`PORT=0`, throwaway sandbox and data dir so there is no session resume, its
own JSONL event log, and the fixture wiki in `eval/wiki/`), connects to it
over the websocket like a real client, sends one scenario prompt, and
timestamps the event waterfall:

`send → init (CLI session up) → first delta → ui:start → ui:spec (headline) → result`

Scenarios (in `scenarios.ts`) pin the expected OUI output exactly, so output
size is constant across runs and correctness is checked mechanically:

- **fixed** — the prompt dictates the 3-statement spec verbatim. Pure
  pipeline latency: spawn, prompt processing, tool-call streaming.
- **grounded** — same output shape, but the content must be read from
  `journeys.md` in the fixture wiki. Adds one wiki read + comprehension.

## Running

```sh
npx tsx eval/run.ts                                   # one smoke run (CLI default model)
npx tsx eval/run.ts --model claude-haiku-4-5          # pick a model
npx tsx eval/run.ts \
  --scenario fixed,grounded \
  --model claude-fable-5,claude-opus-4-8,claude-sonnet-5,claude-haiku-4-5 \
  --effort low,high \
  --prompt full,slim \
  --speed off,on \
  --reps 2 --label big-sweep
```

Dimensions (comma lists, full cross product, run serially):

| flag | values | meaning |
|---|---|---|
| `--scenario` | `fixed`, `grounded` | what the model must produce |
| `--model` | `default` or any CLI model id | `--model` passed to the Claude CLI |
| `--effort` | `default`, `low`, `medium`, `high` | `--effort` passed to the CLI (reasoning depth) |
| `--prompt` | `full`, `slim` | production ~11 KB appended system prompt vs. ~1 KB `prompts/slim-ui.md` |
| `--speed` | `off`, `on` | prepend a "time is critical, minimal thinking" line to the user message |
| `--warm` | `on` (default), `off` | connect-time CLI pre-warm (production behavior). When on, the harness waits for the "ready" status before sending, so the measured turn starts against a warm session; `warmupMs` and `warmLeaks` land in runs.jsonl |
| `--reps` | integer | repetitions per cell |
| `--label` | string | results directory name |
| `--timeout` | seconds | per-run cap (default 240) |

Results: `eval/results/<label>/runs.jsonl` (one line per run: config,
timings, spec match, CLI-reported duration/cost) plus one server event log
per run for post-hoc breakdowns. A summary table prints at the end.

## Server knobs the harness relies on

Set as environment variables on the server (see `server/src/index.ts`):
`PORT` (0 = ephemeral), `WIKI_DIR`, `SANDBOX_DIR`, `DATA_DIR`, `EVENTS_LOG`,
`CLAUDE_MODEL`, `CLAUDE_EFFORT`, `APPEND_PROMPT_FILE`. The same knobs power
`scripts/side-instance.sh` (interactive isolated instance).

#!/usr/bin/env bash
# The full UI-generation timing sweep (The Optimizer, plan reviewed
# 2026-07-07): four fractional sweeps run serially, ~56 runs, est. $10-15,
# ~45-60 min. Results land in eval/results/sweep-*/runs.jsonl.
#
#   eval/sweep.sh              # everything
#   eval/sweep.sh models       # just one sweep: models|effort|prompt|speed
set -euo pipefail
cd "$(dirname "$0")/.."

run() { npx tsx eval/run.ts "$@"; }
want() { [[ $# -eq 0 || "${PICK}" == "$1" ]]; }
PICK="${1:-}"

# A. Model sweep — both scenarios, production defaults elsewhere.
if [[ -z "$PICK" || "$PICK" == models ]]; then
  run --scenario fixed,grounded \
    --model claude-fable-5,claude-opus-4-8,claude-opus-4-7,claude-sonnet-5,claude-sonnet-4-6,claude-haiku-4-5 \
    --reps 2 --timeout 300 --label sweep-models
fi

# B. Effort sweep — reasoning depth on the two production candidates.
if [[ -z "$PICK" || "$PICK" == effort ]]; then
  run --scenario fixed --model claude-opus-4-8,claude-sonnet-5 \
    --effort low,medium,high,xhigh --reps 2 --label sweep-effort
fi

# C. Prompt-size sweep — production markdown prompt vs ~1KB slim variant.
if [[ -z "$PICK" || "$PICK" == prompt ]]; then
  run --scenario fixed --model claude-opus-4-8,claude-sonnet-5 \
    --prompt full,slim --reps 2 --label sweep-prompt
fi

# D. Speed-hint sweep — does telling the model to hurry change wall-clock?
if [[ -z "$PICK" || "$PICK" == speed ]]; then
  run --scenario fixed --model claude-opus-4-8,claude-sonnet-5 \
    --speed off,on --reps 2 --label sweep-speed
fi

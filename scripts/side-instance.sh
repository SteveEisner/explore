#!/usr/bin/env bash
# One-command isolated side instance (TASKS.md "isolated side instance").
#
# Runs a second full app server that shares nothing mutable with the main
# dev instance: its own port, sandbox, session/data dir, and event log. The
# wiki defaults to the main docs/ (read via MCP as usual) — point WIKI_DIR
# at a copy if the side instance's LLM should not edit the real wiki.
#
# Every value is overridable:  PORT=3202 WIKI_DIR=/tmp/wiki scripts/side-instance.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PORT="${PORT:-3101}"
export WIKI_DIR="${WIKI_DIR:-$PWD/docs}"
export SANDBOX_DIR="${SANDBOX_DIR:-$PWD/sandbox-side}"
export DATA_DIR="${DATA_DIR:-$PWD/server/data-side}"
export EVENTS_LOG="${EVENTS_LOG:-/tmp/explore-events-side.jsonl}"

echo "side instance: port=$PORT wiki=$WIKI_DIR sandbox=$SANDBOX_DIR data=$DATA_DIR log=$EVENTS_LOG"
# Plain tsx (not watch): source edits by other workers must not restart a
# side instance mid-measurement.
exec node_modules/.bin/tsx server/src/index.ts

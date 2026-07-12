#!/usr/bin/env bash
# Warm the wiki's semantic-search index (TASKS.md J0, clean-clone quickstart).
#
# The markdown-vault MCP server indexes the whole wiki when it starts: the
# first run downloads a local embedding model (Xenova/all-MiniLM-L6-v2, tens
# of MB, cached under node_modules/@huggingface/transformers/.cache) and then
# embeds every note into <wiki>/.markdown_vault_mcp/. Left alone, that cost
# lands when the first LLM session spawns the MCP server — i.e. mid-demo.
# This script pays it at setup time instead: start the server directly, wait
# for indexing to finish, then shut it down cleanly (SIGINT persists the
# vector store). Re-running is cheap — indexing is incremental.
#
# Usage:  scripts/warm-vault.sh                  # warms docs/, the default wiki
#         WIKI_DIR=/path scripts/warm-vault.sh   # warms another wiki dir
set -euo pipefail
cd "$(dirname "$0")/.."

WIKI_DIR="${WIKI_DIR:-$PWD/docs}"
LOG="$(mktemp)"
FIFO="$(mktemp -u)"
mkfifo "$FIFO"

cleanup() {
  # Close the fifo's write end (fd 3) so the server sees EOF, then make sure
  # nothing lingers if we exited before the normal shutdown path ran.
  exec 3>&- 2>/dev/null || true
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$FIFO" "$LOG"
}
trap cleanup EXIT

# The server speaks MCP over stdio and treats stdin EOF as the client hanging
# up, so feed it a fifo we hold open; progress goes to stderr (the log file).
VAULT_PATH="$WIKI_DIR" node_modules/.bin/markdown-vault-mcp <"$FIFO" >/dev/null 2>"$LOG" &
SERVER_PID=$!
exec 3>"$FIFO"

echo "warming semantic index for $WIKI_DIR"
echo "(first ever run downloads the embedding model — allow a few minutes)"

# "Backlink index built" is printed only after the full indexing pass
# completes, so it doubles as the "index is warm" signal.
for _ in $(seq 1 600); do
  if grep -q "Backlink index built" "$LOG"; then
    kill -INT "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
    echo "done: index persisted in $WIKI_DIR/.markdown_vault_mcp/"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "vault MCP server exited before indexing finished; its log:" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 1
done

echo "timed out after 10 minutes; server log:" >&2
cat "$LOG" >&2
exit 1

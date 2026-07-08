# Agent Instructions

## Project docs

- `docs/proposal.md` — project vision and phases
- `docs/ARCHITECTURE.md` — system design; `docs/decisions.md` — decision log
- `docs/tasks.md` — phase roadmap
- `TASKS.md` (root) — live task tracker by component area (description, self-claimed owner, status)
- `docs/TODO.md` — holding bin for ideas and loose ends not yet real tasks; promote entries to TASKS.md when work starts
- `docs/worklog-*.md` — dated worklog files

## Task tracking

Before starting work, claim the task in `TASKS.md` (set Owner to your name, status to `in progress`). Update status as it changes (`todo` · `in progress` · `blocked` · `done`). Add newly discovered tasks to the appropriate component-area section.

**Taking on a task means:** when you begin work, check the task plan for tasks relevant to what you're doing and claim them as yours. When you complete work, check again for relevant tasks and mark them done. If you get stuck, note that in the task document (status `blocked` plus a short note of what's blocking).

**Blitz backlog:** when you notice a small fix (≤ ~30 min, independent, clearly scoped) that is *outside your current task*, do not fix it — add it to the "Blitz backlog" table in `TASKS.md`. These are deliberately banked for a future multi-agent blitz.

## Code clarity

Whenever you edit code, apply the **code-clarity** and **comment-clarity** skills (invoke them via the Skill tool before writing): keep the active problem state small, make implicit proofs explicit (no unexplained non-null assertions or magic marker strings), prefer explicit state over string matching, and give non-obvious blocks intent comments that name the invariant they establish. Docstrings state contracts (entrance invariants, guarantees, failure cases), not mechanics or edit history. After updating a file, reread the whole file for maximum clarity and minimum redundancy. Keep edits behavior-preserving and minimal — no formatting churn, and no style rewrites of coherent vendored code (e.g. `client/src/components/ui/`).

## Worklog

Whenever a milestone is reached — a task from `docs/tasks.md` completed, a phase finished, a significant architectural decision made, or a notable bug fixed — append a short entry to the current worklog file in `docs/` (named `worklog-YYYY-MM-DD.md`, using today's date; create it if it doesn't exist).

Each entry should include:

- A `## YYYY-MM-DD HH:MM — <milestone title>` heading (newest entries at the top, below the file intro). Use the actual current time — run `date "+%Y-%m-%d %H:%M"` rather than guessing.
- 1–3 sentences describing what was done and, if relevant, what's next

Keep entries short and factual — this is a log, not documentation. Also update the corresponding task status in `TASKS.md` when applicable.

## Breaks and the two-hour limit

When the user declares a break (e.g., "taking a break", "stopping for now", "done for today"), immediately append a timestamped worklog entry titled `## YYYY-MM-DD HH:MM — Break` noting that work stopped, with a one-sentence summary of where things stand and the natural next step for resuming.

The user is holding themselves to a **two-hour work limit** per session (initial policy). Use the worklog timestamps to track session length: if roughly two hours have passed since the session's first entry (or since the last break entry) and the user hasn't stopped, gently point it out.

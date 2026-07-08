# Customer Journeys

The top journeys the app must nail, in priority order. Each journey is the unit we demo, test, and harden — features matter only insofar as a journey needs them. (Written at the pivot from exploratory build-out to "respectable app": the shape is now clear enough to lock these in.)

## J1 — Explore a bundle (the core promise)

> I have a pile of information. I get an interactive application that explains it to me.

1. User puts materials into the wiki (files in `docs/` today).
2. User asks the app for an exploration ("help me understand this PR / these docs").
3. The LLM explores the wiki directly (MCP vault/wiki tools) and generates an exploration artifact via the `ui` tool — structured, interactive, archetype-class; not a TLDR.
4. User reads, clicks, and learns.

**Status:** every piece exists; the journey has never been run end-to-end. This is the unproven core hypothesis.
**Definition of good:** from a cold start, a real bundle produces a genuinely useful multi-section interactive exploration in one ask, using the component vocabulary (boards, comparisons, context levels) — graded against the hand-built archetype.

## J2 — Talk about the bundle (conversation as a first-class mode)

> Before (or instead of) generating anything, I can just talk with the app about what's in the wiki — ask questions, discuss, study.

1. User asks about the wiki's contents in chat ("what does this PR change about cleanup ordering?", "walk me through these study notes").
2. The LLM answers from the wiki directly (vault/wiki tools), citing/linking wiki pages where useful.
3. The conversation can stay conversation — or become the brief for an artifact: "now make me a 'quiz me' artifact from these notes." Sometimes both purposes at once; moving between discussing and generating is fluid, in either direction.

**Status:** the plumbing exists (chat pane, vault tools, markdown rendering) but it has never been exercised as a study/discussion experience, and nothing in the guidance shapes it (e.g. answer in chat vs. reach for the ui tool; brevity; when to *offer* an artifact).
**Definition of good:** a wiki of study notes supports a real Q&A session with grounded, appropriately-sized answers — and "quiz me on this" lands as a working artifact without restarting the conversation.

## J3 — Refine it (the collaboration loop)

> Where the explanation doesn't help me learn, I say so — any way that's natural — and it gets better fast.

1. User reacts: chat message, text selection, drawing on the artifact, screenshot, or just what's on screen (`state` tool).
2. The LLM revises the artifact with a small edit-mode patch.
3. The change appears quickly; iteration is cheap enough to do dozens of times.

**Status:** all feedback channels work individually; edit-mode patches work. Latency and ergonomics of the loop are unmeasured — "fast" is the whole point of this journey.
**Definition of good:** ask→visible change fast enough that refinement feels conversational, and the change is *surgical* (doesn't disturb the rest of the artifact or the user's place in it).

## J4 — Keep it (persistence)

> The thing we built together is mine: I can save it, reopen it, share it, and pick up where I left off.

1. User saves the artifact to the wiki (as `.oui`).
2. Later: reopens it from the wiki browser, views it, resumes refining it (same conversation context or fresh).

**Status:** not built. Generated artifacts are ephemeral today; `.oui` files render from the wiki but nothing writes them.
**Definition of good:** save → reopen → looks identical → "continue editing" works.

## J0 — Get running (the meta-journey)

> Anyone (including a reviewer) can clone the repo and be exploring in minutes.

Fresh clone → documented setup → `npm run dev` → app opens on the wiki README with a working demo bundle. No tribal knowledge.

**Status:** works on this machine; never proven from a clean environment.

## The respectable-app bar (cross-cutting)

Not journeys, but what makes them trustworthy:

- **Tests** — typecheck + lint in one command; unit tests for the protocol and prompt-building; an integration test that drives a scripted chat turn through the server; the benchmark `.oui` as a rendering fixture. A journey isn't done until it has a test that would catch its regression.
- **Observability** — the JSONL event log exists; add per-turn timing (ask→first-token→render-complete) so J3's "fast" is a number, not a feeling.
- **Deployability** — README quickstart, API-key/env handling, seed wiki content, and a clean-clone verification. Dockerfile if cheap.

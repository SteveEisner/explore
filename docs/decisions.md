# Decisions

Architecture and design decisions, newest first. Referenced from [ARCHITECTURE.md](ARCHITECTURE.md).

## D6. One feedback envelope for every channel

**Date:** 2026-07-11
**Decision:** Every feedback channel delivers user input to the LLM (and to the transcript and event log) in **one standard envelope** rather than a per-channel format:

```
{ text?, screenshot?, statementRef?, stateSnapshot }
```

- `text` — what was typed or said (chat, voice utterance)
- `screenshot` — captured image, when the channel produces one (screenshot round-trip, drawing overlay)
- `statementRef` — the D4 statement name being pointed at, when the gesture targets a component (point-and-comment)
- `stateSnapshot` — the D3 store state at capture time: open file, selected tabs, context level

Channels fill in only the fields they have; `stateSnapshot` is always attached (it's free — the server already holds the store).

**Why:**

- Four channels were about to mint four ad-hoc formats (typed text, image attachment, `{statementId, comment}`, voice transcript records). One envelope means the LLM, the chat transcript, and the event log understand every kind of feedback the same way.
- `stateSnapshot` makes feedback **self-locating**: "this table is confusing" is ambiguous across an artifact's tabs unless the message carries what the user was looking at. This wires up the D3 promise ("a screenshot can be tagged with the exact store state that produced the view") that was never implemented.
- The decision is forced now anyway: voice transcript integration (D5) has to pick a message shape; picking the shared one is a paragraph today versus a four-channel migration later.

**Consequences:**

- Voice transcript integration logs utterances/tool actions as envelopes; P1 point-and-comment emits `{text, statementRef, stateSnapshot}`; the existing screenshot round-trip migrates to `{screenshot, stateSnapshot}` (+ text when accompanied by a message).
- The chat pane renders one message shape with optional adornments (image thumbnail, "re: <statement>" chip, state summary) instead of per-channel message kinds.

**Revisit if:** a channel genuinely can't fit (e.g. continuous signals like interaction digests may stay a separate stream — they're telemetry, not utterances).

## D5. Realtime voice agent: a second intelligence, browser-direct audio, tools bridged over the existing websocket

**Date:** 2026-07-11
**Decision:** Realtime voice editing is built on **OpenAI gpt-realtime** (latest Realtime API version; token supplied by Steve) as a second intelligence alongside the Claude session — not as a speech front-end to it. Audio flows **browser ⇄ OpenAI directly over WebRTC** (the server only mints ephemeral session tokens; the API key never reaches the browser). Tool calls arrive in the browser on the WebRTC data channel: front-end tools (screenshot, app state) execute locally; server tools are forwarded over the existing `/ws` connection as a `voice:tool` message family, executed server-side against the same internals the HTTP/MCP surfaces use. The voice model edits directly (wiki read/search/edit, artifact edits, state writes) **and** can delegate heavy generation to the Claude session via an `ask_artifact_agent` tool with two modes — **FAST** and **SMART** — each selecting an appropriate Claude model for the delegated turn. The mic button opens a toggled live conversation (VAD + barge-in), not push-to-talk.

**Persona:** to the user there is one collaborator. The voice agent knows the back-end agent is more powerful and delegates accordingly, but it presents delegated work as its own — "working on that…" — never as a handoff to another LLM. This behavior (and the rest of its operating doctrine) lives in a **voice-agent guidance document** injected as the session instructions at every session start.

**Why:**

- Anthropic has no speech-to-speech realtime API, so voice is necessarily a second vendor; a STT→Claude→TTS pipeline was rejected because multi-second turns and no barge-in defeat the point of *realtime* editing (J3).
- Browser-direct WebRTC is the lowest-latency audio path; relaying audio through our server adds a hop and audio plumbing for no benefit. The ephemeral-token pattern is the provider's supported way to keep credentials server-side.
- Bridging server tools through the already-open websocket reuses the existing session, auth boundary, and event log instead of inventing a second server channel.
- Direct editing gets free leverage from existing machinery: wiki hot-reload makes voice edits appear live, and the D3 state chain makes "get/set app state" nearly free.

**Consequences:**

- Two intelligences share the artifact and wiki. The voice model does not share the Claude session's conversation memory; mitigation: voice utterances and tool actions are logged into the chat transcript so the user and the Claude session can see what voice changed. The persona rule keeps this architecture invisible to the user.
- FAST/SMART delegation requires per-turn (or per-delegation) Claude model selection in the session bridge — the model-selection task's per-session override grows a per-call dimension; the perf eval's model matrix is what calibrates which model each mode picks.
- The dormant Wiki API rows (read, D1 edit, search) move onto the critical path — the voice agent's core tools need a callable server surface, factored as an internal wiki service shared by HTTP endpoints and the voice tool executor.
- Realtime audio bills per open-mic minute (order of magnitude above text): sessions need idle auto-close, and cost joins latency as a tracked eval metric.

**Revisit if:** a first-party Anthropic realtime voice API ships (collapse back to one intelligence), or two-brain conflicts (contradictory edits, confused users) outweigh the latency win.

## D4. Structural components are named editing points — no special behavior or styling

**Date:** 2026-07-07
**Decision:** A specialized component is justified only when it offers an advantage over rendering raw HTML. For structural components (Stack, Tabs, Comparison, Aside, Gallery panels), the advantage is exactly one thing: a **named boundary that contains content and can be edited independently** of the rest of the page. Therefore structural components carry no default styling and no special behavior — they are editing points, not widgets. Appearance comes from the content itself (raw HTML plus artifact stylesheets targeting the components' CSS hook classes).

**Why:**

- Edit-mode revisions (the heart of the product, per D2) work best when the page decomposes into small named statements the LLM can replace one at a time. That decomposition — not visual opinion — is what the vocabulary is for.
- Component-imposed chrome fights content: the Comparison rework proved that hardcoded borders/padding made the component unable to reproduce designs its children could express on their own. Unstyled defaults can render anything; styled defaults can only render themselves.
- It keeps the vocabulary honestly small: a new component must claim a *structural or behavioral* advantage (selection state, context gating, host-observable interaction), never "it looks right."

**Consequences:**

- Components render neutral layout only, exposing stable CSS hook classes (e.g. `comparison`, `comparison-panel`, `comparison-label`) plus an optional `className` so artifact stylesheets control the look.
- Behavior is the exception and must be earned: Gallery keeps selection because navigation state is structural (and becomes a store key per D3); the `context` prop gates rendering; everything else stays inert.
- Generation guidance should tell the LLM: reach for structural components to create edit boundaries, and raw HTML (`Content`) for appearance.

## D3. Component state lives in a hierarchical key-value store

**Date:** 2026-07-07
**Decision:** All interactive state for artifact components is driven from a central, hierarchical key-value store (keys like `flow/selected-step`, `outcomes/selected-case`), not from per-component internal state. Artifacts declare their state keys up front in a manifest (initial value + human-readable description of what the key means). Components subscribe to store keys and render from them; user interactions write to the store.

**Why:** Modeled on the company-hosted conversion of the PR-review explainer (`pr-review.html`, since removed from the repo — the archetype `pr-502764-review.html` remains), where this pattern proved its worth: because every interaction flows through the store, *a host-driven state change takes exactly the same path as a local click*. (The pre-conversion archetype, `pr-502764-review.html`, uses plain local DOM state — the store was what the hosting conversion added, and it's the part worth keeping.) That property is load-bearing for us:

- **Phase 4 interaction signals** — the session bridge can observe store writes to learn what the user is exploring ("keeps drilling into X").
- **LLM steering** — the LLM (or chat) can drive the artifact by writing state, e.g. "look at the third flow step" navigates the UI for the user.
- **Multimodal feedback** — a screenshot or annotation can be tagged with the exact store state that produced the view.
- **Persistence** — an exploration session's UI position is serializable for free.

The declared manifest doubles as documentation the LLM can read: state keys are part of the artifact's contract, not incidental implementation.

**Status:** recorded now, wired in later — initial components may use local state until the store lands. New vocabulary components should be designed so their selection/toggle state maps cleanly onto store keys.

## D2. Artifact medium: OpenUI component vocabulary (experimental)

**Date:** 2026-07-07
**Decision:** Artifacts are built from a constrained **component vocabulary** rather than free-form HTML, expressed via [OpenUI](https://www.openui.com/) — a component library (schemas + React renderers) that generates the system prompt telling the LLM what it may emit, with a line-oriented, streaming-friendly output language. A raw-HTML escape hatch remains for gaps in the vocabulary.

**Why:**

- **Constrained generation** makes LLM output more reliable: composing known components beats improvising arbitrary HTML, which produces varying results.
- **Editability is the crux.** The refine/re-do loop is the core of the product; OpenUI's structured, line-oriented representation should make revisions far cheaper and more reliable than raw edits to an HTML blob. This is deliberately an *experiment in defining an HTML-editing protocol* — evaluating how an LLM should revise a live UI in response to feedback.
- The library-as-contract model matches our "guidance" thesis: growing the vocabulary *is* improving generation guidance.
- Token efficiency (OpenUI claims up to ~67% vs. JSON-based approaches) and progressive rendering are nice side benefits.

**Status: experimental.** If OpenUI proves awkward in Phase 1, the fallback is the same principle (constrained vocabulary + structured edits) on a homegrown or alternative representation.

**Revisit if:** the vocabulary constantly needs the escape hatch (vocabulary too weak), or the OpenUI runtime fights the artifact runtime-API needs in Phase 4.

## D1. Wiki edit API format: exact search/replace (`str_replace`)

**Date:** 2026-07-07
**Decision:** The wiki edit endpoint accepts edits as exact search/replace pairs — `old_string` (must match file content exactly and, by default, uniquely) and `new_string`, with an optional `replace_all` flag. Whole-file writes remain available via the create endpoint for new/small files. No unified diffs, no line-number-based patching.

**Why:** Research on agent editing formats consistently favors exact string matching:

- Benchmarks across editing strategies find search/replace has the highest solve rate — a 23–27 percentage-point improvement over alternative formats — and note it is "very natural for LLMs to produce" ([DEV benchmark of 5 file-editing strategies](https://dev.to/ceaksan/i-benchmarked-5-file-editing-strategies-for-ai-coding-agents-heres-what-actually-works-1855)).
- A source-code taxonomy of coding-agent architectures found the ecosystem has *converged* on `str_replace`-style editors — used by SWE-agent, OpenHands, Claude Code, and Anthropic's official text-editor tool — precisely because exact string matching is more reliable than line-number or unified-diff patching for LLM output ([Inside the Scaffold, arXiv](https://arxiv.org/pdf/2604.03515)).
- Aider's extensive editing benchmarks established that models are "terrible at working accurately with source code line numbers" (frequently off-by-one or worse), and its design principles call for formats that are familiar, simple, and free of "brittle specifiers like line numbers or line counts" ([aider edit formats](https://aider.chat/docs/more/edit-formats.html), [aider unified-diffs writeup](https://aider.chat/docs/unified-diffs.html)). Aider's own udiff variant had to strip line-number semantics to work.
- Our intelligence layer is Claude Code, and Claude models are heavily post-trained on the `str_replace` tool shape — using the same shape means the model operates in its most-practiced format.

**Failure mode to handle:** the known weakness of `str_replace` is that a single wrong character (whitespace, quotes) makes the match fail. The API should fail loudly with a clear error (not silently no-op), distinguish "no match" from "multiple matches," and keep chunked reads cheap so the agent can re-read and retry.

**Revisit if:** files become very large and edits highly repetitive (bulk transformations might warrant a structured patch format), or the intelligence layer changes to a model family with different training.

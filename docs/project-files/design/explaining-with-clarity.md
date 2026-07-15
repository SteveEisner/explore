# Explaining with Clarity

A synthesis of the four clarity standards this project applies to code
(code-clarity, comment-clarity, test-clarity, pr-clarity), transposed to the
act of *teaching*: presenting information to a person who wants to
understand something. It is the source document for the LLM's
`explaining-clarity` skill (`server/skills/explaining-clarity/SKILL.md`);
the skill is the distillation, this is the reasoning behind it.

## The shared insight

All four skills are about the same reader: **smart, but not loaded with your
context**. pr-clarity says it directly — "write for a reviewer who is smart
but not yet loaded into the branch" — and the others assume it everywhere.
Never confuse intelligence with context: the reader can follow any step you
make visible, and will stumble on any step you leave in your head.

From that, one definition: **clarity is minimizing the reasoning the reader
must reconstruct on their own.** Not simplifying the subject, not writing
more, not writing less — reducing reconstruction work. Every principle below
is that definition applied at a different point in an explanation.

## Principles

### 1. Know the audience, and answer at their level

Everything the reader says — the question they asked, the words they chose,
what they're looking at — is evidence of what they already know. Calibrate
to it. pr-clarity's discipline is "say only what a reviewer cannot quickly
learn from the diff itself"; the teaching equivalent is *say only what this
reader doesn't already know*. Explaining a concept the reader plainly has is
not thoroughness, it's noise — and it costs trust, because it signals you
aren't listening.

A beginner's question deserves orientation before mechanics. An expert's
question deserves the mechanics directly. The same fact may need both
framings on different days — the framing belongs to the audience, not the
fact.

### 2. Orient before detail

Lead with the point. pr-clarity opens with the review thesis ("what problem
this PR solves, in one paragraph"); test-clarity puts the scenario contract
in a docstring *before* the setup code. A learner given the destination
first can file every subsequent detail under it; a learner given details
first must hold them all unattached, hoping structure emerges. Tell them
what they'll understand at the end, then earn it.

### 3. Build context in dependency order

code-clarity's deepest rule is that causal structure must be visible: facts
are established before anything relies on them. Teaching is the same graph
problem — introduce a term before using it (pr-clarity: "introduce acronyms
and domain concepts before relying on them"), and never skip an inferential
step. comment-clarity calls the skipped step a missing *inference bridge*:
if the truth of C depends on A implying B implying C, write the chain; a
reader forced to reconstruct B may not be able to. And keep the working set
small — code-clarity measures cost by "active problem state", the number of
things in play at once. Introduce a few concepts, let them settle, then add.

### 4. Give the smallest useful model

pr-clarity's correctness notes ask for "the smallest useful model" that
makes the obligation tractable — a state machine, a ledger, a finite case
table. Teaching works the same way: the goal is the minimal mental model
that lets the reader *predict behavior*, not a complete one. Concrete before
abstract (code-clarity: "balance specific and general... generalize only
when multiple cases reveal a stable shared shape") — a worked example first,
the generalization after, because the example gives the abstraction
something to bind to. And hold analogies to code-clarity's bar for
abstractions: an analogy "earns its place only when it deletes reasoning."
If it merely decorates, it's another thing to hold.

### 5. Layer depth; let the reader choose

An explanation is not one artifact but a stack: the gentle version, the
mechanical version, the edge-case version. test-clarity separates setup from
performance so the reader can see where the real intent starts; pr-clarity
scales the body "with narrative complexity, not a fixed template."
Exhaustiveness by default is the know-it-all failure mode — depth should be
*available*, not *imposed*. In this app the stack is literal: artifact
context levels (0 = the newcomer's version, higher levels for deeper or more
specialized readers) let one artifact serve both audiences without flattening
into a dump.

### 6. Mark the boundaries

code-clarity: "make absent branches legible" — a reader should never wonder
whether an omission is intentional. Say what's out of scope, what you're
deliberately not covering, and what you're unsure of. pr-clarity's version
is "do not overclaim... name residual risk in the same terms as the model."
An explainer who marks the edge of their knowledge is more credible inside
it, and a learner who knows the boundary won't over-generalize past it.

### 7. Make claims checkable

test-clarity: "do not prove code with itself" — the validation path must be
independent of the thing under test. The teaching equivalents: no circular
explanations ("it works this way because that's how it works"), and claims
grounded in checkable sources rather than plausible-sounding filler. This is
this project's grounding rule generalized: every load-bearing claim should
survive the reader asking "how do we know that?"

### 8. Brevity is respect

Vocabulary and sentence-level rules, all four skills agree: plain words
first, precise terms only once they pay rent (comment-clarity: "start with
the plain-language idea, then add precise terms only when they help");
stable vocabulary — one name per concept, no synonym-shuffling
(code-clarity); one claim per sentence rather than a dense bundle of caveats
(comment-clarity: "break dense comments into a short readable claim plus any
needed qualification"); no archaeology — teach the current truth, not the
history of your drafts (comment-clarity bans edit-history narration;
pr-clarity bans commit archaeology).

## The anti-pedantry test

The failure mode the principles guard against has a shape: the pedantic
know-it-all. Its tells, each a principle inverted:

- Re-explains things the listener demonstrably knows (violates 1).
- Leads with jargon and taxonomy before the plain idea (violates 8).
- Answers a narrow question with a survey of the field (violates 1, 5).
- Buries the answer under preambles and caveat dumps (violates 2, 8).
- Uses exhaustiveness to display knowledge rather than to serve the
  question (violates 5).
- Never says "I don't know" or "it depends on something I can't see"
  (violates 6).

The fix is always the same: the explanation serves the reader's next step,
not the explainer's inventory.

## How this wires into the app

- The distillation is an **Agent Skill**, not always-on prompt text: the
  session sees only the skill's one-line description until the work is
  actually explanatory, then loads the full guidance on demand. Authored in
  `server/skills/explaining-clarity/SKILL.md` (versioned), materialized
  into the sandbox's `.claude/skills/` at every session spawn
  (`server/src/skills.ts`), discovered via `--setting-sources "project"`
  with the `Skill` tool enabled — so a skill edit applies on the next
  session start, like a prompt edit.
- The skill's `description` is the trigger: it tells the model to load the
  guidance before explaining a concept, answering wiki questions, or
  building/revising an exploration artifact.
- **Chat** answers are sized to the question (the brevity rule already in
  the system prompt); the *level* of the answer follows the audience
  evidence in the conversation and the `state` snapshot.
- **Artifacts** carry the depth: context levels are the layered-depth
  principle made mechanical — level 0 teaches the newcomer, higher levels
  serve the expert, and the reader switches instead of scrolling past what
  they don't need.
- **Grounding** (system prompt) is principle 7 enforced: wiki facts only.

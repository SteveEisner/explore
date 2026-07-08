---
name: comment-clarity
description: Define and enforce comment clarity guidelines for newly introduced code, tests, and configuration, where comments and docstrings act as local intention pseudocode and a reviewable spec for correctness. Use when Codex needs to write, update, or review a PR, diff, patch, or generated change for comment/docstring quality, test or configuration intent, invariants, preconditions, correctness requirements, state transitions, method-level reasoning chains from entry to exit invariants, inference chains between blocks or helper contracts, domain terminology, semantic naming, or whether nearby implementation satisfies the written intent.
metadata:
  summary: >
    Guidelines for comments and docstrings as local specs for invariants,
    preconditions, state transitions, proof obligations, and error boundaries.
---

# Comment Clarity Guidelines [SteveE]

## Overview

Use this skill as both a standard and an enforcement guide for intentional comments.
Comments and docstrings must function as intention pseudocode: a compact local spec for what the code establishes, preserves, transforms, rejects, or guarantees.
Docstrings should describe stable method contracts, not restate every current branch or implementation detail.

When acting as the author or owner of the code, update the code so it follows the standard.
When acting as a reviewer of code you do not own, review the code and report where it does not follow the standard.

A reader should be able to compare nearby implementation against the written intent and decide whether the code is correct.
Intentional comments should make implicit purpose, invariants, and reasoning steps explicit without making the code harder to understand.
For correctness-sensitive code, the written intent should name the condition or guarantee the nearby implementation must satisfy.
For a non-trivial method, the comments should read as a method-level reasoning chain: the docstring establishes the entrance invariants, each basic block states the invariants it establishes or preserves, and the final state follows logically as the method's exit guarantees.
The reviewer may think in formal proof terms, but the comments should usually use the domain language a future maintainer would use to explain the behavior.
Intentional comments must make invariants as clear as transformations, so the reader can track what remains true while the code changes state.
Treat comment and docstring changes as local spec changes.

## Intentional Method

Intentional comments must:

- State intent, not mechanics.
- Start with the plain-language idea, then add precise terms only when they help verify the code.
- Stand on the current code and contract. Do not rely on deleted code, review history, or the author's editing process.
- Give non-obvious basic blocks a preceding comment that names the block's role and the property it establishes.
- For correctness-sensitive blocks, state the required condition or guarantee: what must already be true, why the operation is valid, and what holds afterward.
- Surface inference bridges when correctness depends on a chain of facts across blocks, helpers, or external contracts. If the code relies on A implying B and B implying C, write the locally relevant chain so the leap does not have to be reconstructed.
- Make inference bridges explicit enough to be read as a local correctness argument. Name the source block or helper that establishes the first fact, the intermediate artifact or contract that carries it forward, the conclusion the current block may draw, and why failure of the bridge is an invalid state rather than a case to skip.
- Tie distant state transitions together when a later check depends on an earlier block. Name the earlier established fact, the contract that carries it forward, and the conclusion the current block is allowed to draw.
- Explain the positive correctness path for transition-heavy code: source state, carrier artifact, local conclusion, and resulting state. Prefer explaining what the current path does and why it is valid over describing old paths, missing paths, or implementation history.
- Explain branch, fallback, loop, and error-path splits when they represent domain state, an invariant-preserving path, an external contract, or an input-shape workaround. Prefer semantic predicate/helper names when they make the split obvious.
- Use docstrings to teach valid use, entrance invariants, preconditions, design role, success guarantees, exit invariants, and failure cases. For large or correctness-sensitive methods, include designed exceptions or error conditions as part of the method contract. Describe error cases by the general invalid state or boundary they protect; keep narrow branch-specific triggers in nearby block comments when they clarify the code.
- Connect basic-block comments into a logical path from the docstring's entrance invariants to the method's exit invariants. The comments should be understandable in isolation as the high-level reasoning for why the resulting solution is correct.
- State the invariant effect of each important block: what remains true, what becomes true, what can no longer happen, or what invalid state has been rejected.
- In tests, make names, docstrings, fixtures, comments, and assertions explain the behavior, invariant, correctness scenario, or regression boundary being tested. Consolidated or table-driven tests must preserve the semantic scenario names and proof boundaries that make each case understandable.
- In configuration, explain the runtime, build, deployment, ownership, or safety property selected and what depends on it.
- Choose the right surface for intent. Put stable local contracts, invariants, and proof obligations in code comments or docstrings. Keep edit history, review routing, temporary migration notes, and process narration out of code comments.
- Stand on their own when jump-to-definition is unavailable. Summarize the locally relevant contract of important helpers or external systems.
- Define local terminology and domain concepts in concise, low-jargon language, with references when an external contract matters.
- When it clarifies the local contract, use backticked identifiers to anchor the comment to nearby variables, fields, helpers, config keys, or API names. This is especially useful when a specific value carries an important state transition or invariant. Prefer descriptive domain terms when the identifier is incidental or would make the comment less clear.
- Break dense comments into a short readable claim plus any needed qualification. Do not force future readers or code-modifying agents to unpack several warnings, scope limits, and implementation constraints from one sentence.
- Use helper names, API fields, and error boundaries that communicate semantic intent.

Intentional comments must not:

- Explain obvious assignments, simple calls, or syntax-level mechanics.
- Add meta-narrative about why the code was edited, what a reviewer asked for, what used to exist, or how a prior implementation behaved.
- Hide missing intent behind vague verbs such as "handle", "process", "validate", or "ensure".
- Repeat configuration keys, target names, or flag syntax without explaining the selected behavior or constraint.
- Copy large helper implementations into comments. Summarize the helper's relevant contract instead.
- Use unexplained internal shorthand.
- Lead with jargon, acronyms, framework labels, or abstract categories before explaining the concrete behavior they refer to.
- Compress multiple ideas into one technically accurate but hard-to-read sentence.
- Turn a method docstring into a branch-by-branch trace when a stable contract or error boundary would be clearer.

## Workflow

When applying or reviewing the standard:

1. Identify newly introduced or materially changed code, tests, configuration, generated-code controls, API fields, helper names, and error boundaries.
2. Check whether non-trivial docstrings, test names, fixture comments, assertions, config names, and block comments explain the relevant local contract, correctness condition, state transition, invariant, or regression boundary.
3. Read the docstring and intentional comments as a standalone reasoning outline. They should lead from entrance invariants, through the facts established or preserved by basic blocks, to the method's exit invariants and designed error outcomes. The docstring should state those outcomes at the contract level; local comments can name the exact current branch that establishes or rejects a fact.
4. Scan non-trivial bodies for basic blocks: clusters that establish a property, reject invalid state, perform a domain transition, preserve an invariant, call an external contract, map errors, build a correctness fixture, or select configuration behavior.
5. Look for inference chains between separated blocks. When a later block treats something as safe, valid, consumed, scoped, or impossible because of earlier work, require comments or semantic names that expose the bridge from earlier fact to later conclusion. A sufficient bridge should explain the origin, the carried fact, the local conclusion, and the error/skip behavior when the chain does not hold.
6. Add or require intentional comments when a block's purpose is not locally obvious from code and names.
7. For correctness-sensitive blocks, check that the code establishes the stated preconditions before relying on them, names the invariant effect of the block, and preserves the promised postcondition afterward.
8. Inspect branches, fallbacks, loops, exceptions, and early returns. Require comments or semantic names when the split is not self-evident.
9. Compare each intention comment to nearby implementation. The code block must actually do what the comment says it does. Flag comment/code drift as a correctness risk without assuming whether the comment or the implementation is the source of truth.
10. Check whether names for helpers, tests, fixtures, API fields, config keys, targets, and error boundaries preserve semantic truth rather than implementation mechanics.
11. Check whether the local intent is understandable without jumping to definitions. If a helper, fixture, generated rule, config schema, or external contract is essential, require the relevant contract and a reference when useful.
12. Check comment readability for humans or agents with less context than the author. Good comments introduce the concrete behavior first, avoid dense bundles of caveats, and use specialized terms only after the plain meaning is clear.

## Acting As Author

When you own the change, make the smallest code, comment, docstring, or naming updates needed to satisfy the standard.
Preserve behavior unless the user explicitly asks for a behavior change.
Do not add broad cleanup, formatting churn, or explanatory prose outside the code.

## Acting As Reviewer

Use this mode when reviewing code you do not own, when the user asks for a review, or when direct edits would be inappropriate.

Lead with concrete issues, ordered by severity and grounded in file and line references when available.
Keep the review style-focused: do not include formatting nits, broad rewrites, or generic cleanup.
When suggesting a comment change, describe the missing intent or spec mismatch instead of drafting long paste-ready text unless asked.
When code has drifted from its intention comment, call out the mismatch without deciding whether the comment or code should change.
When the issue is a missing correctness condition, name the condition or guarantee that should be explicit.
When a docstring is too specific, name the broader contract or error boundary it should describe instead.
When the issue is a broken method-level reasoning chain, name the missing link between entrance invariant, basic-block invariant, and exit guarantee.
When the issue is a missing inference bridge, name the facts that need to be connected, such as "A establishes B; B is why C is safe here." If the current comment only hints at the bridge, say which part is missing: source, carrier, conclusion, or consequence.

Use this shape:

- `Findings`: concrete issues with path/line references.
- `Intent gaps`: short list of missing state-transition, invariant, or design-role comments when they are not severe enough for a finding.
- `Looks good`: brief note on strong intentional comments, only when useful.
- `Residual risk`: anything that could not be checked from the available diff.

If there are no issues, say that the newly introduced code follows intentional style and name any remaining scope limits.

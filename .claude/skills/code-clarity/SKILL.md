---
name: code-clarity
description: Define and enforce code clarity guidelines for newly introduced or modified code, tests, and configuration. Use when Codex needs to write, update, or review a PR, diff, patch, or generated change for low reasoning cost, explicit state, simple control flow, bounded complexity, object/package boundaries, naming clarity, failure handling, test proof, abstraction quality, or whether uncommon but valid domain states are handled.
metadata:
  summary: >
    Guidelines for code where clarity means low reasoning cost, explicit state,
    visible validity proof, meaningful boundaries, and abstractions that reduce
    what future readers must hold in their head.
---

# Code Clarity Guidelines [SteveE]

## Overview

Use this skill as both a standard and an enforcement guide for code that is easy to read, reason about, review, and safely modify.
Good code keeps the active problem domain small, makes implicit behavior explicit, keeps reasoning local, and pairs implementation with tests that prove important behavior.

When acting as the author or owner of the code, update the code so it follows the standard.
When acting as a reviewer of code you do not own, review the code and report where it does not follow the standard.

## Core Principles

- **Review problem state, not syntax.** The more active states, branches, invariants, pending side effects, and partially transformed values a piece of code has, the larger the problem domain becomes. A larger problem domain increases the chance of mistakes when the code is written, read, reviewed, or modified.

- **Make implicit proof explicit.** Deep access, chained calls, compact destructuring, optional values, marker states, and object decomposition all imply facts have been established. If types or validation do not make that proof obvious, expose it with clearer structure, naming, validation, assertions, or comments.

- **Preserve meaningful packaging.** Cohesive objects often carry guarantees that loose fields do not. Avoid decomposing them into unrelated parameters when the callee needs the packaged meaning, but avoid passing a large dependency when a smaller meaningful type is enough.

- **Make active state clear.** In longer methods, it should be obvious which values are still in play. If a parameter is decomposed into validated or normalized parts, prefer using those parts afterward rather than mixing them with the original state.

- **Eliminate cases explicitly.** Early returns, validations, assertions, exceptions, type narrowing, and guard clauses reduce later complexity by removing states from consideration. Later code should be able to rely on the narrower state.

- **Keep process flow clear.** Higher-level process code should read as a sequence of meaningful operations. Push subtle variant handling, data mutation, and edge-case work into well-named helpers or domain operations when that makes the main flow easier to follow.

- **Make causal structure visible.** A reader should be able to see which facts establish later facts: validation before reliance, contract before caller assumption, state transition before downstream use, and root domain decision before derived behavior. If the dependency chain has to be reconstructed across scattered names, branches, or helpers, the code still has high reasoning cost.

- **Make state transitions auditable.** When code moves domain state across phases, revisions, windows, persisted records, or external boundaries, name the artifact that carries the state, the operation that consumes it, and the successor state it creates. Prefer a visible sequence of domain operations over compact control flow when ordering is part of correctness.

- **Reason about code and tests together.** Tests are dynamic proof. Production code and tests should form a bonded pair: the code shows the implementation path, and tests show the behavior space it survives, including failure modes and uncommon-but-valid states.

- **Prefer stronger correctness mechanisms.** Static guarantees such as types, schemas, enums, constrained data, and narrow interfaces are strongest. Runtime validation, assertions, intentional comments, and tests add proof when static structure cannot express the full behavior.

- **Use comments for block intent.** Simple statements may be self-documenting; meaningful blocks often are not. Separate code into logical parts with short intent comments that explain why the block exists and what state it establishes.

- **Balance specific and general.** Avoid premature abstraction and premature specificity. Let names, helpers, and intent describe the current role clearly, then generalize only when multiple cases reveal a stable shared shape.

- **Keep domain vocabulary stable.** Names, comments, tests, and reviewer-facing structure should use the same terms for the same concepts. A change that introduces new terms, renames domain concepts, or shifts vocabulary should make the new meaning clear where it is first used; otherwise readers have to translate between old and new concepts while reviewing behavior.

- **Make abstractions delete reasoning.** A helper, type, wrapper, or module boundary earns its place only when it removes active state, collapses repeated branches, preserves a meaningful domain guarantee, or gives a stable name to a real concept. If it merely moves the same reasoning somewhere else, prefer the direct flow.

- **Make absent branches legible.** When a state is unsupported, impossible, already normalized, or owned by another contract, the code should make that invariant visible through types, validation, assertions, narrow interfaces, semantic names, or comments. Do not leave readers guessing whether an unrepresented state is intentional or forgotten.

- **Use ordinary good style in service of comprehension.** Prefer clear names, local conventions, reusable helpers after real patterns emerge, straightforward code over clever compression, narrow failure boundaries, explicit inputs and outputs over hidden state, and no broad style rewrites against coherent existing code.

## Acting As Author

When you own the change, make the smallest code, test, naming, validation, helper, or structure update needed to satisfy the standard.
Preserve behavior unless the user explicitly asks for a behavior change.
Do not add broad cleanup, formatting churn, speculative abstraction, or style rewrites outside the touched change.

## Acting As Reviewer

Use this mode when reviewing code you do not own, when the user asks for a review, or when direct edits would be inappropriate.

Lead with concrete issues, ordered by severity and grounded in file and line references when available.
Flag places where code increases reasoning cost: too much active problem state, unclear proof of validity, lost object guarantees, unclear marker states, branch-heavy orchestration, broad failure boundaries, hidden state, premature abstraction, premature specificity, or tests that do not prove important behavior.
Hypothesize failure cases and uncommon-but-valid values, not just happy paths.
When a finding involves an abstraction, describe what reasoning it removes or fails to remove.
When a finding involves an absent branch or unsupported state, describe what current invariant should make that absence obvious.
When a finding involves vocabulary drift, name the old and new terms and explain what concept boundary became unclear.
When a finding involves tests, describe the dynamic proof that is missing rather than only asking for more coverage.

If there are no issues, say that the newly introduced code follows code comprehension style and name any remaining scope limits.

---
name: test-clarity
description: Define and enforce test clarity guidelines for newly introduced or modified tests, fixtures, fakes, mocks, parametrization, and validation logic. Use when Codex needs to write, update, or review tests for clear setup/performance/validation phases, explicit system-under-test scope, low boilerplate, meaningful proof, test double fidelity, fake ownership, MagicMock risk, static-vs-dynamic proof boundaries, or whether tests actually verify behavior rather than mirror implementation details.
metadata:
  summary: >
    Guidelines for tests as executable proof: clear system-under-test scope,
    visible setup-to-performance transition, meaningful validation, and faithful
    test doubles.
  references:
    - title: "Google Testing Blog: Increase Test Fidelity By Avoiding Mocks"
      url: "https://testing.googleblog.com/2024/02/increase-test-fidelity-by-avoiding-mocks.html"
      note: "Prefer real implementations and fakes over low-fidelity mocks when practical."
    - title: "Software Engineering at Google: Test Doubles"
      url: "https://abseil.io/resources/swe-book/html/ch13.html"
      note: "Guidance on real implementations, fakes, stubs, interaction testing, fidelity, and test double maintenance."
    - title: "Microsoft Learn: Unit testing best practices"
      url: "https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices"
      note: "Covers behavior-focused tests, coverage limits, Arrange/Act/Assert, and testing through public behavior."
    - title: "Android Developers: Fundamentals of testing Android apps"
      url: "https://developer.android.com/training/testing/fundamentals"
      note: "Official Google guidance on testing scope, local tests, instrumented tests, and test doubles."
    - title: "pytest documentation: fixtures and parametrization"
      url: "https://docs.pytest.org/en/stable/"
      note: "Official pytest guidance for fixtures as arrange/setup structure and parametrized test cases."
---

# Test Clarity Guidelines [SteveE]

## Overview

Use this skill as both a standard and an enforcement guide for tests that are easy to read, maintain, and trust.
Tests are a critical counterpart to production code: they exercise the application from a second angle and should make behavior, invariants, failure modes, and regression boundaries explicit.

When acting as the author or owner of the tests, update them so they follow the standard.
When acting as a reviewer of tests you do not own, review the tests and report where they do not follow the standard.

## Core Principles

- **Make the system under test explicit.** A test should say whether it proves one class or method, a module boundary, a chain of modules, or an end-to-end behavior. Unit, integration, and end-to-end describe scope; the test should still name the behavior and boundary it is responsible for.

- **State the scenario contract in the docstring.** Each test should have a docstring that makes the case explicit before the reader enters setup code. It does not need a required format such as Given/When/Then, but it should identify the meaningful starting condition, operation, derived value, rejected state, persisted effect, or invariant being checked, plus the expected outcome. For matrix- or runner-driven tests, the docstring should explain the shared scenario shape while parameters name the individual cases.

  A useful docstring reads like a small contract for the test: after setup, what situation exists; what operation the test performs; and what result or invariant should hold. For example, "When a scheduled downsell is applied at renewal, the old license remains as history, the downsell license becomes active for the new contract, and no duplicate license is created." If the behavior is time-based or timeline-shaped, use `timeline-diagram` when available to sketch the before/after revision state before writing or reviewing the test.

- **Separate setup from performance.** Most tests have setup, performance, and validation phases. The transition into the performance phase must be easy to see because that is where the test's real intent lives. Setup may be long or shared, but the exercised behavior should not be buried inside mechanical construction.

- **Use shared setup to reveal intent.** Prefer fixtures, class setup, decorators, parametrization, builders, and focused helpers for repetitive setup. Shared setup should remove boilerplate without hiding the state that matters to the specific behavior under test.

- **Use test runners and matrices for efficient coverage.** A test runner is a small test-owned harness that wraps common setup, performance, and validation into useful helpers so one-off scenarios can be covered by data instead of copy-pasted test bodies. Good runners encode the right control flow and invariant checks as a series of easily understood method calls, so individual tests do not need conditional branches that hide the scenario being exercised. Prefer runners, parametrized cases, scenario tables, and focused helpers when they let the suite cover more behavior while keeping the reviewed test code small and intentional.

- **Use harnesses to create a domain language.** A runner or fixture earns its place when individual tests can read as domain transitions: starting state, operation, and expected resulting state. In state-machine code, explicit field-level assertions are useful when they prove what changed, stayed stable, was consumed, or was rejected.

- **Minimize boilerplate in every phase.** Noisy setup, repeated assertions, and bulky helper plumbing waste reviewer attention and make it harder to add the next useful case. Test helpers should make important cases cheaper to write, not move confusion somewhere else.

- **Keep performance code visible and reusable.** The performance phase should be the clearest part of the test. Setup and validation helpers should keep it from being buried in object construction or assertion minutia, and validation should not be interspersed through the performance path unless the behavior is explicitly stepwise. When the same behavior has multiple cases, shape the performance code so it can be parameterized: either through a shared helper/runner imported by each test or by writing the test method so case-specific values can become parameters without restructuring.

- **Test behavior, invariants, and regressions.** A test should have an intentional reason that matches the code's contract: behavior becomes true, an invariant is preserved, an invalid state is rejected, or a regression boundary is held. Do not write or modify a test merely to make the suite pass.

- **Treat coverage as a map, not proof.** Coverage can reveal unexercised code, but it does not prove that assertions are meaningful or that behavior is protected. Do not add line-coverage tests that fail to verify a contract, invariant, failure mode, or regression boundary.

- **Test through meaningful boundaries.** Prefer tests that exercise the public method, class, module, or service boundary that owns the behavior. Testing private helpers directly is useful only when the helper has its own stable contract or is the real unit of ownership; otherwise it can prove an implementation detail while missing the behavior callers rely on.

- **Treat failures as design signals.** A failing test should prompt a re-check of the production logic, test intent, and test double fidelity before bypassing, weakening, or deleting the assertion. Expected failures, skips, and narrow ignores need a clear reason and a path to removal when appropriate.

- **Prefer embedded expected failures over whole-test skips.** It is useful to commit tests for expected future behavior before the implementation supports it, but they should remain easy to find and naturally start passing when the code is fixed. Prefer a narrow in-test expected failure around the unsupported assertion or operation over skipping the entire test, and document the current gap clearly enough that a future reader knows when to remove it.

- **Avoid testing static guarantees dynamically.** Do not add tests for behavior that is already fully and directly proven by the language, type system, schema, dataclass generation, or framework contract. Do test explicit or implicit invariants, validation, derived behavior, custom methods, and meaningful error boundaries.

- **Do not prove code with itself.** The test's validation path should not reuse the production helper, resolver, serializer, or algorithm whose correctness is under test as the source of expected truth. Shared constants and domain builders are fine when they do not duplicate the behavior being verified.

- **Prefer high-fidelity dependencies.** Use real implementations when they are fast, deterministic, and easy to construct. Prefer typed objects or fakes over mocks when a real dependency is impractical. Reach for mocks only when they are the simplest honest way to isolate slow, nondeterministic, external, or hard-to-trigger behavior.

- **Treat MagicMock as a smell.** `MagicMock` and similar generic mocks can silently accept missing attributes, wrong call shapes, and unrealistic behavior. Prefer typed fakes, explicit stubs, protocol-backed doubles, or small local classes when they keep the test readable and faithful.

- **Own the behavior of fakes.** A fake is test code with a contract. It should be simple enough for the test owner to maintain, or owned near the real implementation when the real behavior is complex. Good shared fakes have a way to stay aligned with the real class, such as a shared interface, contract tests, or parallel tests that exercise both fake and real behavior.

- **Keep test code to the code clarity bar.** Tests are read and executed far more often than they are written. Apply the same clarity standards as production code: explicit state, simple control flow, clear names, meaningful helpers, narrow failure boundaries, and no unnecessary abstraction.

- **Respect local test convention.** Follow the surrounding test framework, fixture style, naming pattern, helper layout, assertion idioms, and fake/mocking conventions unless they actively obscure the behavior under test. Improve clarity with the smallest local change rather than importing a new testing style into an otherwise coherent suite.

## Acting As Author

When you own the test change, make the smallest test, fixture, fake, helper, parametrization, naming, or assertion update needed to satisfy the standard.
Preserve the intended behavior under test unless the user explicitly asks for a behavior change.
Do not add broad cleanup, formatting churn, speculative fakes, or unrelated test rewrites outside the touched behavior.

Before finishing, check:

- The performance phase is visible and matches the test name.
- The docstring states the scenario contract in domain terms rather than merely repeating the test name.
- Setup boilerplate has been reduced with fixtures, builders, runners, matrices, or helpers when that makes the exercised behavior easier to see.
- Repeated scenario coverage is parameterized or ready to be parameterized, rather than copied into long nearly-identical tests.
- Setup helpers hide only mechanical construction, not the important state for this case.
- Assertions prove the behavior or invariant, not implementation trivia.
- Validation is grouped where it proves the outcome and does not obscure the performance phase with assertion noise.
- Any fake, stub, or mock has enough fidelity for the claim the test makes.
- Any expected failure is narrow, searchable, and will naturally pass once the missing behavior is implemented.
- Test modifications match the production code contract change, and production code changes have matching test proof when dynamic proof is needed.

## Acting As Reviewer

Use this mode when reviewing tests you do not own, when the user asks for a review, or when direct edits would be inappropriate.

Lead with concrete issues, ordered by severity and grounded in file and line references when available.
Flag tests where the system under test is unclear, the docstring does not specify the scenario contract, the performance phase is hidden, boilerplate obscures intent, setup helpers hide important state, assertions mirror implementation details, dynamic tests duplicate static guarantees, or test doubles are too low-fidelity to prove the claimed behavior.
Flag inefficient coverage patterns where many near-identical tests could be clearer as a runner, table, parametrized matrix, fixture-backed scenario helper, or reusable performance helper.
Flag tests where validation is interleaved with the action under test in a way that makes the performed behavior hard to see.
Flag expected-failure coverage that skips too much, lacks a clear removal condition, or would not naturally pass once the missing behavior is implemented.
Flag tests that chase coverage without meaningful assertions, or prove a private implementation detail while missing the caller-visible behavior.
When a finding involves mocks or fakes, name the risk: wrong interface, unrealistic behavior, missing contract proof, hidden state, over-isolation, or duplicated production logic.
When a finding involves missing coverage, describe the behavior, invariant, invalid state, or regression boundary that lacks proof.

Use this shape:

- `Findings`: concrete issues with path/line references.
- `Proof gaps`: behavior, invariant, failure mode, or regression boundary that is not dynamically proven.
- `Double fidelity`: concerns about mocks, fakes, stubs, or reused production helpers.
- `Looks good`: brief note on strong test clarity, only when useful.
- `Residual risk`: anything that could not be checked from the available diff.

If there are no issues, say that the newly introduced tests follow test clarity and name any remaining scope limits.

# Spec 16: Template Completion Contract — Formalization & Invariant Tests

**Status**: Draft
**Priority**: P1
**Complexity**: S
**Dependencies**: Spec 132 (archived; COMPLETED 2026-04-17)
**Estimated effort**: 0.5-1 day
**Source**: Post-ticket analysis from Spec 132 (`132AGESTUVIA-001`..`-009`); this spec formalizes the completion contract that series implicitly established.

## Overview

Spec 132 landed the engine-agnostic fix for the `agentStuck` / optional-`chooseN` completion mismatch: the four-outcome `TemplateCompletionResult` union, anti-bias in optional `chooseN` sampling, deterministic RNG progression on sampled dead-ends, and removal of `agentStuck` from the simulator stop-reason set. The implementation lives in `packages/engine/src/kernel/move-completion.ts` and is consumed uniformly by simulator, agents, and runner worker.

This spec **does not change** the completion-layer implementation. It formalizes the contract Spec 132 established:

- Canonical in-code documentation of each outcome's meaning, at the type declaration site.
- Invariant tests that prove the contract properties (outcome classification, anti-bias, RNG progression, determinism, client boundary) against isolated fixtures — independently of the FITL seed regressions.
- A test-enforced version of the Foundation 5 client-boundary rule: no caller retries `structurallyUnsatisfiable`.

## Problem Statement

Spec 132 fixed the concrete bug. The contract that emerged from that fix is currently **code-enforced but not test-enforced as an architectural property**:

- `TemplateCompletionResult` has no doc-comment explaining when each outcome is emitted or which are retryable.
- Properties such as "optional `chooseN` with a satisfiable non-empty branch never samples the empty set" and "`drawDeadEnd` always carries the advanced RNG state" are exercised by FITL seed regressions but are not asserted as standalone invariants against isolated fixtures.
- §5 (client boundary) is enforced only by the happy behavior of `prepare-playable-moves.ts:299` (break on `structurallyUnsatisfiable`) and the worker's binary handling in `game-worker-api.ts:446-452`. No test fails if a future client wrapper silently retries `structurallyUnsatisfiable` — a direct Foundation 5 regression.

Without this formalization, a future refactor could weaken the contract while passing all existing regression tests.

## Goals

- Document the canonical meanings of `completed`, `structurallyUnsatisfiable`, `drawDeadEnd`, `stochasticUnresolved` at the type declaration site.
- Assert each contract property (§§1-5 below) via isolated invariant tests, independent of FITL seed regressions.
- Lock in the Foundation 5 client-boundary invariant: no caller re-classifies `structurallyUnsatisfiable` as retryable.

## Non-Goals

- No semantic changes to `packages/engine/src/kernel/move-completion.ts`.
- No changes to agent retry budgets, guidance, or policy (caller prerogative per Contract §4).
- No new DSL surface, completion options, or runtime flags.
- No game-specific logic.

## Contract

### 1. Completion outcome meanings

`completeTemplateMove` returns exactly one of:

- `completed` — move is fully bound; can be executed through the normal trusted apply path.
- `structurallyUnsatisfiable` — no valid completion exists under the current state and contract. **Not retryable.**
- `drawDeadEnd` — the sampled path failed; another valid path MAY exist under a different RNG state. Carries the advanced `rng` consumed by the failed sampled path.
- `stochasticUnresolved` — all pre-stochastic decisions are bound; unresolved stochastic branches remain. Carries the partially-bound `move` and advanced `rng`.

`structurallyUnsatisfiable` MUST NOT be used as a catch-all for sampled dead-ends.

### 2. Optional `chooseN` semantics

For `chooseN` with `min = 0`, `max > 0`, and at least one selectable option:

- Completion MAY choose the empty set only if the empty branch is semantically valid under the contract.
- Completion MUST NOT systematically prefer the empty branch when at least one non-empty satisfiable branch exists.
- The completion policy MUST be deterministic with respect to the input RNG.

### 3. Draw-dead-end classification

If a sampled branch:

- raises `CHOICE_RUNTIME_VALIDATION_FAILED`, or
- resolves to `illegal`, or
- reaches an incomplete state with no pending decision/stochastic continuation

then the outcome MUST be classified as `drawDeadEnd` when `lastDecisionSource ∈ { random, stochastic, guided }` (the failure was caused by a sampled choice) rather than `structural` (structural impossibility).

### 4. RNG progression

When completion returns `drawDeadEnd`, it MUST also return the advanced RNG state produced by the failed sampled path. Callers choose their own retry policy (budget, guidance, logging); the completion layer MUST expose the actual consumed RNG so caller retries remain deterministic.

### 5. Client boundary

The simulator, agents, and worker/runtime surfaces MUST share the same outcome semantics:

- No client MAY redefine which outcomes admit retry. Specifically: `structurallyUnsatisfiable` MUST NOT be retried by any caller. `drawDeadEnd` MAY be retried; whether to do so, and how many times, is caller policy.
- No client MAY redefine what constitutes structural unsatisfiability.
- Clients MAY differ in retry budget, guidance policy, and logging, but MUST NOT reinterpret outcome meanings.

## Required Invariants

1. If a template move is surfaced to agents as pending and is satisfiable under the shared completion contract, bounded completion MUST be able to realize at least one successful branch under deterministic replay.
2. Optional-branch sampling MUST NOT make a satisfiable template practically unreachable by repeatedly preferring a known dead-end empty branch.
3. Completion outcomes MUST be stable for identical `(GameDef, state, move, rng)` inputs.
4. The completion contract MUST remain engine-agnostic.
5. No caller MAY retry a `structurallyUnsatisfiable` outcome.

## Foundations Alignment

- **Foundation #1 Engine Agnosticism**: contract is generic completion semantics, not FITL-specific.
- **Foundation #5 One Rules Protocol, Many Clients**: client-boundary invariant test proves simulator/agent/worker share one completion protocol.
- **Foundation #8 Determinism**: RNG progression and outcome determinism are asserted in isolated fixtures.
- **Foundation #10 Bounded Computation**: no unbounded search introduced.
- **Foundation #14 No Backwards Compatibility**: no shims; `agentStuck` removal stands.
- **Foundation #15 Architectural Completeness**: addresses the contract boundary explicitly rather than relying on emergent behavior from regression tests.
- **Foundation #16 Testing as Proof**: each contract property has an isolated invariant test that fails if the property is weakened.

## Required Proof

### Doc-comment additions

1. `TemplateCompletionResult` at `packages/engine/src/kernel/move-completion.ts` MUST carry a doc-comment enumerating the semantic meaning of each outcome (mapping 1:1 to Contract §1) and referencing this spec.
2. `completeTemplateMove` MUST carry a brief doc-comment pointing to the `TemplateCompletionResult` contract.

### Invariant tests

New test file: `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts`.

1. **Outcome classification (Contract §1)** — a fixture with `min > selectable` produces `structurallyUnsatisfiable`, not `drawDeadEnd`.
2. **Optional `chooseN` anti-bias (Contract §2)** — a fixture with a satisfiable non-empty branch and a dead-end empty branch completes successfully under a 32-seed sweep; every resulting move has a non-empty selection.
3. **Sampled dead-end classification (Contract §3)** — a fixture where `CHOICE_RUNTIME_VALIDATION_FAILED` is raised from a sampled path classifies as `drawDeadEnd`; a fixture where the same error is raised from a structural path classifies as `structurallyUnsatisfiable`.
4. **RNG progression (Contract §4)** — a `drawDeadEnd` result returns an `rng` that is strictly advanced from the input `rng` (canonical serialization differs).
5. **Determinism (Invariant §3)** — identical `(GameDef, state, move, rng)` inputs across repeated calls return byte-identical `TemplateCompletionResult` payloads.
6. **Client boundary (Invariant §5, Foundation #5)** — a fixture that forces `structurallyUnsatisfiable` and runs through `prepare-playable-moves.ts`'s retry loop asserts that the retry budget is NOT extended for that outcome (the loop breaks immediately and no additional attempts are consumed).

### Existing regression coverage (referenced, not duplicated)

The following tests, landed by Spec 132, already provide end-to-end regression coverage. This spec REFERENCES them but does not duplicate them:

- `packages/engine/test/unit/kernel/move-completion-retry.test.ts` — optional `chooseN` preference under seed sweep; seed-1009 bounded smoke.
- `packages/engine/test/integration/classified-move-parity.test.ts` — seed 11 FITL parity.
- `packages/engine/test/integration/fitl-policy-agent.test.ts` — seed 17 outcome-policy dead-end recovery.
- `packages/engine/test/integration/fitl-events-sihanouk.test.ts` — seed 1009 Rally/March continuation.
- `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` — `agentStuck` rejection at TypeScript and Zod layers.

## Implementation Direction

All work is in the `kernel` and `test` layers:

- `packages/engine/src/kernel/move-completion.ts` — add doc-comments only; no semantic changes.
- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` — new file; six invariant tests above.

No changes to `packages/engine/src/agents/prepare-playable-moves.ts`, `packages/runner/src/worker/game-worker-api.ts`, or any FITL data.

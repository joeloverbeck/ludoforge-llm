# Spec 16: Template Completion Contract

**Status**: Draft
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 132
**Estimated effort**: 3-4 days
**Source**: Post-ticket analysis from `132AGESTUVIA-004` implementation; shared engine completion/legality seams exposed by FITL seeds 11, 17, and 1009

## Overview

Define the engine-wide contract for template move completion. The kernel currently has the right primitives, but the architecture still relies on several implicit assumptions:

- what it means for a template move to be "completable"
- how random completion is allowed to explore optional branches
- when a dead-end reflects a structural impossibility versus an unlucky sampled branch
- how completion RNG progression interacts with determinism and replay guarantees

This spec turns those assumptions into explicit rules. It does not add game-specific logic. It defines the generic completion semantics that every engine client must share.

## Problem Statement

Recent `agentStuck` removal work exposed a specific architectural weakness: a template move can be correctly classified as satisfiable in principle, yet repeated random completion can still fail to find any successful branch because the completion policy keeps preferring optional dead-end choices.

That is not merely a bug in one seed. It means the engine lacks an explicit contract for:

1. the meaning of `drawDeadEnd`
2. the allowed behavior of optional `chooseN`
3. the difference between "unsatisfiable template" and "sampled dead-end path"
4. what deterministic completion is required to guarantee for agent-facing candidates

Without this contract, legality, completion, and agent preparation can each be locally reasonable while the end-to-end system is still wrong.

## Goals

- Define the canonical meanings of `completed`, `structurallyUnsatisfiable`, `drawDeadEnd`, and `stochasticUnresolved`.
- Define deterministic completion behavior for optional `chooseN`.
- Ensure completion semantics are engine-agnostic and independent of FITL.
- Make completion outcomes composable with legality/admissibility rules.
- Preserve bounded computation and deterministic replay.

## Non-Goals

- No game-specific heuristics.
- No policy-driven search or rollout.
- No new scripting surface.
- No UI/simulator-specific completion logic.

## Contract

### 1. Completion outcome meanings

`completeTemplateMove(...)` MUST return exactly one of these semantic classes:

- `completed`
  The move is fully bound and can be executed through the normal trusted apply path.
- `structurallyUnsatisfiable`
  No valid completion exists under the current state and current completion contract.
- `drawDeadEnd`
  The current sampled path failed, but some other valid completion path may still exist.
- `stochasticUnresolved`
  The move is complete through all pre-stochastic decisions and only unresolved stochastic branches remain.

The engine MUST NOT use `structurallyUnsatisfiable` as a catch-all for sampled dead ends.

### 2. Optional `chooseN` semantics

For `chooseN` with `min = 0`, `max > 0`, and at least one selectable option:

- completion MAY choose the empty set only if the empty branch is semantically valid under the shared completion contract
- completion MUST NOT systematically prefer the empty branch when at least one non-empty satisfiable branch exists
- the completion policy MUST be deterministic with respect to the input RNG

This does not require exhaustive global search. It does require the shared completion policy to avoid a known bad bias toward empty branches.

### 3. Draw-dead-end classification

If a sampled branch:

- trips `CHOICE_RUNTIME_VALIDATION_FAILED`, or
- resolves to `illegal`, or
- reaches an incomplete state with no pending decision/stochastic continuation

then the outcome MUST be classified as `drawDeadEnd` if the failure was caused by a sampled completion choice rather than a structural impossibility.

### 4. RNG progression

When completion returns `drawDeadEnd`, it MUST also return the advanced RNG state produced by the failed sampled path. That advanced RNG state is part of the deterministic contract. Callers may choose how to continue retrying, but the completion layer must expose the actual consumed state.

### 5. Client boundary

The simulator, agents, and worker/runtime surfaces MUST rely on the same completion contract. No client may redefine:

- which completion outcomes are retryable
- which optional branches are acceptable to prefer
- what constitutes structural unsatisfiability

## Required Invariants

1. If a template move is surfaced to agents as pending and is satisfiable under the shared completion contract, bounded completion MUST be able to realize at least one successful branch under deterministic replay.
2. Optional-branch sampling MUST NOT make a satisfiable template practically unreachable by repeatedly preferring a known dead-end empty branch.
3. Completion outcomes MUST be stable for identical `(GameDef, state, move, rng)` inputs.
4. The completion contract MUST remain engine-agnostic.

## Foundations Alignment

- **Foundation #1 Engine Agnosticism**: all rules are generic completion semantics, not FITL-specific exceptions.
- **Foundation #5 One Rules Protocol**: completion semantics are shared by simulator, agents, and runner/worker surfaces.
- **Foundation #8 Determinism**: RNG progression and completion outcomes are explicit and replayable.
- **Foundation #10 Bounded Computation**: no unbounded search requirement is introduced.
- **Foundation #14 No Backwards Compatibility**: this spec is the post-`agentStuck` canonical contract, not a compatibility layer.
- **Foundation #15 Architectural Completeness**: fixes the completion boundary itself rather than adding client-local fallbacks.
- **Foundation #16 Testing as Proof**: see required proof obligations below.

## Required Proof

### Unit Proof

1. Optional `chooseN` with a satisfiable non-empty branch and a dead-end empty branch MUST complete successfully under repeated deterministic seeds.
2. Optional `chooseN` sampled dead-end branches MUST still be classifiable as `drawDeadEnd` in fixtures where both successful and dead-end branches exist.
3. Structural insufficiency (`min > selectable`) MUST still classify as `structurallyUnsatisfiable`.

### Integration Proof

1. The previously failing engine-owned replay witnesses for seeds 11, 17, and 1009 MUST stop throwing completion-related no-playable failures.
2. Deterministic replay for the curated policy-agent seeds MUST remain stable.
3. Former bounded crash/hang seeds MUST continue to terminate with reachable stop reasons only.

## Implementation Direction

The intended implementation boundary is the shared completion layer:

- `packages/engine/src/kernel/move-completion.ts`
- adjacent completion-result classification surfaces

Agent-local fallback logic is explicitly not the preferred architecture for this spec unless a later proof shows the completion layer alone cannot satisfy the contract.

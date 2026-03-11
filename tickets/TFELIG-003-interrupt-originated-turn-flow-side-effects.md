# TFELIG-003: Preserve Generic Turn-Flow Side Effects for Interrupt-Originated Moves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow eligibility/apply pipeline and regression coverage
**Deps**: tickets/README.md, archive/tickets/FITLTURSEQELEANDCARFLO-005-eligibility-adjustment-windows-and-event-overrides.md, archive/tickets/ENGINEARCH-120-turn-flow-action-class-canonical-contract-unification.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/test/integration/fitl-events-honolulu-conference.test.ts

## Problem

Interrupt-originated moves currently bypass all generic turn-flow post-move extraction in `applyTurnFlowEligibilityAfterMove(...)`. That prevents future interrupt-phase actions from emitting generic runtime side effects such as eligibility overrides, free-operation grants, and deferred event effects. The current Honolulu card happens to work because it only needs interrupt resume behavior, but the engine contract is now too narrow and will silently fail on the next interrupt-driven event that relies on standard turn-flow side effects.

## Assumption Reassessment (2026-03-11)

1. Confirmed: `packages/engine/src/kernel/turn-flow-eligibility.ts` returns early when `originatingPhase` is an interrupt phase, before `extractPendingEligibilityOverrides(...)`, `extractPendingFreeOperationGrants(...)`, and deferred-event release logic run.
2. Confirmed: `packages/engine/src/kernel/apply-move.ts` now passes `originatingPhase: state.currentPhase` into `applyTurnFlowEligibilityAfterMove(...)`, so interrupt-originated actions always take that early-return path.
3. Mismatch: the desired behavior is not "interrupts bypass turn-flow entirely"; the corrected scope is "interrupts must bypass current-card sequencing updates while still applying generic side effects emitted by the executed move."

## Architecture Check

1. Separating interrupt card-flow sequencing from generic move-side-effect extraction is cleaner than a blanket early return because it preserves one shared turn-flow contract for all moves.
2. This remains game-agnostic engine work: the runtime should understand interrupt semantics generically, while Honolulu and other game events remain authored in `GameSpecDoc` data.
3. No backwards-compatibility shims should be introduced; replace the overly broad interrupt fast-path with a narrower, explicit contract.

## What to Change

### 1. Split interrupt sequencing suppression from generic extraction

Refactor `applyTurnFlowEligibilityAfterMove(...)` so interrupt-originated moves still:
- resolve move class,
- extract pending eligibility overrides,
- extract pending free-operation grants,
- register or release deferred event effects,
- emit any resulting trace/state updates,

while skipping only the parts that mutate current-card acted/passed sequencing or coup/non-coup seat advancement.

### 2. Define the canonical interrupt post-move contract

Make the runtime contract explicit in code and tests:
- interrupt-originated moves may produce generic post-move turn-flow state,
- interrupt-originated moves must not advance the current card's eligibility sequencing as though they were a main-card action,
- resuming from interrupt must still return control to the correct next eligible seat on the interrupted card flow.

### 3. Add regression coverage for non-Honolulu interrupt side effects

Introduce focused tests that prove an interrupt-phase action can emit generic turn-flow side effects and that those side effects survive resume correctly. The regression should fail on current HEAD without the fix.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify if call-site contract or comments need tightening)
- `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` (modify)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify if it is the best interrupt fixture)
- `packages/engine/test/unit/kernel/` (modify/add focused interrupt turn-flow contract test)

## Out of Scope

- Reworking Honolulu event data authoring.
- Introducing new game-specific interrupt identifiers or game-specific branches in engine code.
- Broad refactors of free-operation analysis unrelated to interrupt-originated post-move behavior.

## Acceptance Criteria

### Tests That Must Pass

1. An interrupt-originated move can emit a generic eligibility override or free-operation grant without mutating interrupted-card sequencing incorrectly.
2. Interrupt resume still returns control to the correct next eligible faction on the interrupted main card after the interrupt action resolves.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Generic turn-flow side-effect extraction remains available to any move regardless of whether it originates in a main phase or interrupt phase.
2. Interrupt handling remains game-agnostic; no FITL-specific identifiers or special cases are introduced in kernel sequencing logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.ts` — pins the generic engine contract that interrupt-originated moves still emit shared turn-flow side effects.
2. `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` — verifies Honolulu still resumes correctly after the contract change.
3. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — extends an existing interrupt fixture to prove side effects emitted inside interrupts are retained correctly.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-honolulu-conference.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-commitment-phase.test.js`
5. `pnpm -F @ludoforge/engine test`

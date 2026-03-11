# TFELIG-003: Preserve Generic Turn-Flow Side Effects for Interrupt-Originated Moves

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow eligibility/apply pipeline and regression coverage
**Deps**: tickets/README.md, archive/tickets/FITLTURSEQELEANDCARFLO-005-eligibility-adjustment-windows-and-event-overrides.md, archive/tickets/ENGINEARCH-120-turn-flow-action-class-canonical-contract-unification.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/test/integration/fitl-events-honolulu-conference.test.ts, packages/engine/test/integration/event-effect-timing.test.ts

## Problem

Interrupt-originated moves currently bypass all generic turn-flow post-move extraction in `applyTurnFlowEligibilityAfterMove(...)`. That prevents future interrupt-phase actions from emitting generic runtime side effects such as eligibility overrides, free-operation grants, and deferred event effects. The current Honolulu card happens to work because it only needs interrupt resume behavior, but the engine contract is now too narrow and will silently fail on the next interrupt-driven event that relies on standard turn-flow side effects.

## Assumption Reassessment (2026-03-11)

1. Confirmed: `packages/engine/src/kernel/turn-flow-eligibility.ts` returns early when `originatingPhase` is an interrupt phase, before `extractPendingEligibilityOverrides(...)`, `extractPendingFreeOperationGrants(...)`, and deferred-event release logic run.
2. Confirmed: `packages/engine/src/kernel/apply-move.ts` now passes `originatingPhase: state.currentPhase` into `applyTurnFlowEligibilityAfterMove(...)`, so interrupt-originated actions always take that early-return path.
3. Confirmed on current `HEAD`: `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` and `packages/engine/test/integration/fitl-commitment-phase.test.ts` both pass, so existing FITL coverage does not expose the regression.
4. Mismatch: the desired behavior is not "interrupts bypass turn-flow entirely"; the corrected scope is "interrupts must bypass current-card sequencing updates while still applying generic side effects emitted by the executed move."
5. Scope correction: `fitl-commitment-phase.test.ts` is not the right regression surface for this bug because the current commitment interrupt does not emit eligibility overrides, free-operation grants, or deferred event effects through the interrupt-originated post-move path. The primary regression should instead live in an interrupt-specific engine fixture that directly exercises those generic side effects.

## Architecture Check

1. Separating interrupt card-flow sequencing from generic move-side-effect extraction is cleaner than a blanket early return because it preserves one shared turn-flow contract for all moves.
2. This remains game-agnostic engine work: the runtime should understand interrupt semantics generically, while Honolulu and other game events remain authored in `GameSpecDoc` data.
3. Required-grant projection belongs to that shared contract too: if an interrupt-originated move emits pending grants, the runtime must project any resulting required-grant window without pretending the interrupted card itself advanced.
4. No backwards-compatibility shims should be introduced; replace the overly broad interrupt fast-path with a narrower, explicit contract.

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
- interrupt-originated moves may update required-grant candidate projection derived from that shared state,
- interrupt-originated moves must not advance the current card's eligibility sequencing as though they were a main-card action,
- resuming from interrupt must still return control to the correct next eligible seat on the interrupted card flow.

### 3. Add regression coverage for non-Honolulu interrupt side effects

Introduce focused tests that prove an interrupt-phase action can emit generic turn-flow side effects and that those side effects survive resume correctly. Prefer a minimal synthetic engine fixture for the new regression and keep Honolulu as the FITL integration guard. The regression should fail on current HEAD without the fix.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if call-site contract or comments need tightening)
- `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify if it is the cleanest generic interrupt fixture)
- `packages/engine/test/unit/kernel/` (modify/add focused interrupt turn-flow contract test)

## Out of Scope

- Reworking Honolulu event data authoring.
- Introducing new game-specific interrupt identifiers or game-specific branches in engine code.
- Broad refactors of free-operation analysis unrelated to interrupt-originated post-move behavior.

## Acceptance Criteria

### Tests That Must Pass

1. An interrupt-originated move can emit a generic eligibility override or free-operation grant without mutating interrupted-card sequencing incorrectly.
2. Interrupt resume still returns control to the correct next eligible faction on the interrupted main card after the interrupt action resolves, while any emitted pending grants/deferred effects remain intact.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Generic turn-flow side-effect extraction remains available to any move regardless of whether it originates in a main phase or interrupt phase.
2. Interrupt handling remains game-agnostic; no FITL-specific identifiers or special cases are introduced in kernel sequencing logic.
3. Interrupt-originated post-move handling updates shared turn-flow runtime state without mutating interrupted-card acted/passed sequencing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.ts` — pins the generic engine contract that interrupt-originated moves still emit shared turn-flow side effects.
2. `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` — verifies Honolulu still resumes correctly after the contract change.
3. `packages/engine/test/integration/event-effect-timing.test.ts` — adds an interrupt-specific regression fixture that proves deferred effects and free-operation grants emitted inside interrupts are retained correctly.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-honolulu-conference.test.js`
4. `node --test packages/engine/dist/test/integration/event-effect-timing.test.js`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-11
- What actually changed:
  - narrowed the interrupt fast-path in `packages/engine/src/kernel/turn-flow-eligibility.ts` so interrupt-originated moves now persist generic turn-flow side effects (eligibility overrides, pending free-operation grants, deferred event lifecycle state, and required-grant candidate projection) without mutating interrupted-card acted/passed sequencing
  - added `packages/engine/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.ts` to pin the generic engine contract around interrupt-originated post-move side effects
  - extended `packages/engine/test/integration/event-effect-timing.test.ts` with an interrupt-specific regression that proves deferred effects and free-operation grants survive interrupt execution and resume cleanly
  - strengthened `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` so Honolulu remains the live FITL guard against regressions in interrupt resume behavior
- Deviations from original plan:
  - `packages/engine/src/kernel/apply-move.ts` did not require changes after reassessment; the existing `originatingPhase` call-site contract was already correct
  - `packages/engine/test/integration/fitl-commitment-phase.test.ts` was intentionally left untouched because it does not exercise the affected generic interrupt post-move path
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-interrupt-post-move-contract.test.js`
  - `node --test packages/engine/dist/test/integration/event-effect-timing.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-honolulu-conference.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings only; no new lint errors)

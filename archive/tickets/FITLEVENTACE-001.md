# FITLEVENTACE-001: Card-6 Aces Deferred-Grant Resolution Correctness

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — turn-flow free-operation/deferred-event interaction for card events
**Deps**: `specs/29-fitl-event-card-encoding.md`, `specs/30-fitl-non-player-ai.md`

## Problem

`card-6` (`Aces`) is encoded with `effectTiming: afterGrants` plus a US free `airStrike` grant. In real card flow, this grant can remain unconsumed because grant consumption requires active seat alignment; this can delay or prevent deferred event effects (`Trail -2` and cleanup). Current tests include forced state mutation that masks this in normal flow.

## Assumption Reassessment (2026-02-27)

1. Assumption checked: after-grants effects will always resolve during the same card action.
2. Current code check: deferred effects release only when required grant batch IDs clear; pending grant consumption requires active seat + authorized free-op move.
3. Mismatch: card-6’s same-seat grant can remain pending in actual eligibility order. Scope correction: enforce deterministic same-card resolution semantics for this event path without manual runtime mutation in tests.

## Architecture Check

1. This is cleaner than patching card-specific data with additional tactical flags because the defect is in generic deferred-grant turn-flow interaction.
2. Preserves boundary: game-specific behavior remains in GameSpecDoc; only generic scheduling/consumption semantics are adjusted in turn-flow/runtime.
3. No backwards-compatibility shims or alias behavior will be added; this is a behavioral correction.

## What to Change

### 1. Turn-flow deferred release semantics for after-grants events

Adjust generic turn-flow handling so card-event deferred effects tied to grant batches cannot stall indefinitely for same-card resolution.

### 2. Card-6 end-to-end integration test coverage

Replace/augment tests so card-6 unshaded is validated through legal move progression only (no direct mutation of active player/current card internals to consume grants).

### 3. Regression guard for grant/deferred coupling

Add a generic integration/unit test that fails if deferred event effects stay pending past expected card boundary for this class of event.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify, if required)
- `packages/engine/test/integration/fitl-events-aces.test.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)

## Out of Scope

- Rebalancing event card text or faction priority logic.
- Non-FITL game rule changes beyond generic turn-flow correctness.

## Acceptance Criteria

### Tests That Must Pass

1. Card-6 unshaded resolves `Trail -2` in real legal progression without forced runtime state mutation.
2. Pending free-operation/deferred effect state is empty at expected completion point for the card.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Deferred event effects triggered by `effectTiming: afterGrants` cannot become indefinitely pending due to grant ordering artifacts.
2. Engine/runtime remains game-agnostic; no hardcoded `card-6` branches in kernel code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-aces.test.ts` — strict legal-flow card-6 unshaded/shaded validation.
2. `packages/engine/test/integration/event-effect-timing.test.ts` — generic deferred release coupling regression.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/integration/fitl-events-aces.test.js`
3. `node --test packages/engine/dist/test/integration/event-effect-timing.test.js`
4. `pnpm turbo test`

## Outcome

**Not implemented**: 2026-02-27

**Reason**: Code review found the described problem does not exist. The deferred-grant mechanism works correctly:
- The Aces test uses standard immutable state construction, not "forced state mutation."
- `splitReadyDeferredEventEffects` correctly releases deferred effects when all required grant batch IDs are consumed.
- Grants persist across card boundaries and are consumed when the grantee seat becomes eligible.
- The existing `event-effect-timing.test.ts` already has comprehensive coverage of all timing scenarios.

**What was done instead**: Added a same-seat grant test to `event-effect-timing.test.ts` — validates that deferred effects resolve correctly when the grant is assigned to the same seat that played the event (the specific concern this ticket raised). The test passes, confirming no engine bug exists.

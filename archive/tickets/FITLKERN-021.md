# FITLKERN-021: Consolidate Deferred Event Decision Legality Gate

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel validation helper and tests
**Deps**: FITLGOLT4-004

## Problem

`applyMove` now permits incomplete move decisions for a narrow deferred-event case, but the eligibility logic is assembled inline from multiple helpers. This is harder to reason about and easier to regress as event legality evolves.

## Assumption Reassessment (2026-02-25)

1. Deferred incomplete validation is currently computed by `shouldDeferIncompleteDecisionValidation` in `packages/engine/src/kernel/apply-move.ts`.
2. The current gate is intended to apply only to card-event submission paths where deferred effects are released after granted operations, but the predicate in `apply-move.ts` does not explicitly assert `cardEvent` capability.
3. Existing tests already validate deferred-event positive and negative grant cases (`afterGrants` with and without free-op grants), but no dedicated test explicitly guards against non-event actions receiving leniency.

## Architecture Check

1. A single-purpose kernel helper for deferred legality criteria is cleaner than inlined multi-call checks, improves readability, and reduces drift.
2. The helper remains generic and event-primitive driven (timing/effects/grants), avoiding any game-specific branch logic.
3. No backward-compatibility aliases/shims are introduced.
4. Centralizing this gate in event execution logic is preferable to keeping a local `apply-move` helper, because event semantics (play-condition/card-event/timing/effects/grants) already live there.

## What to Change

### 1. Extract and centralize deferred legality predicate

Move deferred-legality conditions into a dedicated helper in event execution logic (module-level, reusable, and unit-testable), and call it from `validateMove`.

The helper must remain strict:
1. Card-driven runtime only.
2. Card-event move only.
3. Event effect timing is `afterGrants`.
4. Event has deferred effects and pending free-op grant semantics.

### 2. Add explicit guardrail tests

Add tests proving:
1. Non-event actions do not receive incomplete-param leniency even when current event card has `afterGrants`.
2. Event actions still receive leniency only in the intended deferred-grant scenario.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution.test.ts` (modify if needed for helper-level coverage)

## Out of Scope

- Changing event resolution semantics beyond legality gating
- Introducing game-specific flags or hardcoded card identifiers
- Updating runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests cover allowed deferred event incompleteness and rejected non-event incompleteness.
2. No regressions in existing apply-move legality behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `GameDef` + kernel legality remains fully game-agnostic.
2. Incomplete-param leniency applies only to deferred card-event submission flows.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — add non-event guardrail test and retain deferred-event positive/negative coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/apply-move.test.js`
3. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Centralized deferred incomplete-decision legality in `event-execution.ts` via `shouldDeferIncompleteDecisionValidationForMove(...)`.
  - Removed `apply-move.ts` inline deferred gate assembly and routed `validateMove(...)` to the centralized helper.
  - Added a non-event guardrail regression in `apply-move.test.ts` proving incomplete params stay illegal for non-event actions even with pending deferred grants.
- Deviations from original plan:
  - Did not add `packages/engine/test/unit/kernel/event-execution.test.ts`; behavior is covered through `applyMove` unit coverage and existing event/deferred cases.
- Verification:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/apply-move.test.js` ✅
  - `pnpm -F @ludoforge/engine test:unit` ✅
  - `pnpm -F @ludoforge/engine lint` ✅

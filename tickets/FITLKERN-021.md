# FITLKERN-021: Consolidate Deferred Event Decision Legality Gate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel validation helper and tests
**Deps**: FITLGOLT4-004

## Problem

`applyMove` now permits incomplete move decisions for a narrow deferred-event case, but the eligibility logic is assembled inline from multiple helpers. This is harder to reason about and easier to regress as event legality evolves.

## Assumption Reassessment (2026-02-25)

1. Deferred incomplete validation is currently computed by `shouldDeferIncompleteDecisionValidation` in `packages/engine/src/kernel/apply-move.ts`.
2. The current gate is intended to apply only to card-event submission paths where deferred effects are released after granted operations.
3. Existing tests validate positive and negative deferred-event cases, but no dedicated test explicitly guards against non-event actions receiving leniency.

## Architecture Check

1. A single-purpose kernel helper for deferred legality criteria is cleaner than inlined multi-call checks, improves readability, and reduces drift.
2. The helper remains generic and event-primitive driven (timing/effects/grants), avoiding any game-specific branch logic.
3. No backward-compatibility aliases/shims are introduced.

## What to Change

### 1. Extract and centralize deferred legality predicate

Move deferred-legality conditions into a dedicated helper (module-level, reusable, and unit-testable), and call it from `validateMove`.

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
- `packages/engine/src/kernel/event-execution.ts` (modify, if helper placement requires)
- `packages/engine/test/unit/apply-move.test.ts` (modify)

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

# FITLKERN-022: Add `playCondition` guard coverage for deferred incomplete-decision leniency

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit tests (kernel apply-move legality)
**Deps**: none

## Problem

Deferred incomplete-decision leniency now depends on event playability (`playCondition`) in addition to `afterGrants` + free-op grants. Existing tests cover grant/no-grant and non-event guardrails, but they do not explicitly lock behavior when an event card exists with deferred grants yet `playCondition` is false.

Without this coverage, future changes could reintroduce leniency for unplayable event cards and silently weaken legality invariants.

## Assumption Reassessment (2026-02-26)

1. `shouldDeferIncompleteDecisionValidationForMove` in `packages/engine/src/kernel/event-execution.ts` now checks `playCondition` before allowing deferred leniency.
2. Current tests in `packages/engine/test/unit/apply-move.test.ts` cover:
   - deferred leniency allowed with `afterGrants` + free-op grants
   - deferred leniency rejected without free-op grants
   - non-event actions rejected even with pending deferred grants
3. Mismatch + correction: there is no explicit test asserting that false `playCondition` keeps incomplete event params illegal even when card timing/grants would otherwise qualify.

## Architecture Check

1. Adding explicit legality tests is the cleanest fix because this is an invariant lock, not a runtime semantics redesign.
2. The behavior remains fully game-agnostic: checks rely on generic event primitives (`playCondition`, timing, grants), not game identifiers.
3. No compatibility aliases or permissive fallback behavior are introduced.

## What to Change

### 1. Add false-`playCondition` deferred-event legality test

Create a deferred event fixture where:
1. action is `cardEvent`
2. effect timing is `afterGrants`
3. free-op grants are present
4. dynamic event decision exists
5. `playCondition` evaluates false in state

Assert `applyMove` throws `ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS` for incomplete event params.

### 2. Add true-`playCondition` control test (optional if existing fixture can be reused)

Either reuse existing passing deferred case or add an explicit paired assertion where `playCondition` is true and incomplete params are accepted in the intended deferred path.

## Files to Touch

- `packages/engine/test/unit/apply-move.test.ts` (modify)

## Out of Scope

- Refactoring event-execution helpers
- Changing runtime semantics for event playability
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Incomplete event params are rejected when deferred card `playCondition` is false, even if `afterGrants` + free-op grants are configured.
2. Existing deferred positive/negative grant tests continue to pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Deferred incomplete-param leniency is never granted for unplayable event cards.
2. Legality remains game-agnostic and driven only by generic kernel event primitives.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — add explicit false-`playCondition` deferred legality guard; prevents silent regression of event-playability gating.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/apply-move.test.js`
3. `pnpm -F @ludoforge/engine test:unit`

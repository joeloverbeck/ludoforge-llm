# FITL-PLYMEI-001: Add regression coverage for Plei Mei shaded viability and chained free-operation sequencing

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only in engine package
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/test/integration/fitl-events-plei-mei.test.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

The current Plei Mei coverage validates the implemented happy paths, but it does not yet lock down two critical regressions:
- shaded event suppression when `requireUsableForEventPlay` has no legal outside-South-Vietnam March,
- generic parity between surfaced free-operation windows and the pending-grant sequence that produced them.

Those gaps make it easier for future engine refactors to reintroduce card-play admission bugs or sequence-window drift without tripping tests.

## Assumption Reassessment (2026-03-10)

1. Current `fitl-events-plei-mei.test.ts` covers unshaded execution, shaded legal March, shaded illegal South Vietnam origin, and legal Ambush outside the March destination.
2. Current Plei Mei tests do not assert that the shaded event is unavailable when no legal March origin outside South Vietnam exists.
3. The corrected scope is to add regression tests only; no additional FITL card data changes are required unless a test exposes a real bug.

## Architecture Check

1. Adding regression coverage is cleaner than relying on incidental broader-suite behavior because this card exercises generic free-operation sequencing and viability policies in one place.
2. The tests preserve architecture boundaries: FITL-specific behavior stays in GameSpecDoc data, while the assertions target generic engine surfaces such as event availability, pending grants, and free-operation move sequencing.
3. No backwards-compatibility shims are introduced. The tests should describe the current intended contract directly.

## What to Change

### 1. Add a shaded-event viability suppression regression

Add a Plei Mei test where the shaded event would only be legal if March from South Vietnam were allowed. Assert that the event move is not surfaced because `requireUsableForEventPlay` must respect the outside-South-Vietnam restriction.

### 2. Add sequence-window contract assertions

Add assertions that:
- both grants are pending immediately after the event,
- only the step-0 free March is surfaced before the March resolves,
- the step-1 Attack/Ambush free move appears only after the March resolves.

### 3. Add a generic sequence-regression if needed

If the Plei Mei test alone is too FITL-specific to protect the engine contract, add a generic free-operation integration regression that asserts the same pending-vs-surfaced sequencing behavior for ordered required grants.

## Files to Touch

- `packages/engine/test/integration/fitl-events-plei-mei.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if a generic sequence regression is added)

## Out of Scope

- Further engine refactors beyond what is needed to satisfy the new regressions.
- Visual configuration or simulator UI work.
- Re-encoding unrelated FITL cards.

## Acceptance Criteria

### Tests That Must Pass

1. Plei Mei shaded event is suppressed when no legal outside-South-Vietnam March exists.
2. Ordered required free-operation grants expose only the current sequence-ready move window.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `requireUsableForEventPlay` must reject event moves when the first required free operation is illegal under the same grant constraints enforced at execution time.
2. Pending ordered grants may exist ahead of time, but legal free moves may only surface for sequence-ready steps.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-plei-mei.test.ts` — add shaded suppression and explicit sequence-window assertions.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a generic ordered-grant surfaced-window regression if the card test alone is insufficient.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-events-plei-mei.test.js`
3. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `pnpm -F @ludoforge/engine test`

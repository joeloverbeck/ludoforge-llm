# FITL56-001: Rework card 56 Vo Nguyen Giap to use the new grant-locus contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — depends on new turn-flow contract, plus FITL GameSpecDoc and integration test updates
**Deps**: tickets/FREEOP-001-grant-scoped-operation-locus.md, data/games/fire-in-the-lake/41-content-event-decks.md, reports/fire-in-the-lake-rules-section-5.md, reports/fire-in-the-lake-rules-section-6.md

## Problem

Card 56 currently works through a combination of `zoneFilter`, selected-space execution context, and sequence-captured move zones. That is close to the intended behavior, but it is still encoding "within each" indirectly through generic move-zone inference rather than through the explicit engine contract this card needs.

This ticket exists to rework card 56 once `FREEOP-001` lands so the card text is modeled exactly as intended:

1. NVA free Marches into up to 3 distinct spaces, even during Monsoon.
2. Each marched space grants at most one follow-up free NVA Op or Special Activity.
3. The follow-up action is authorized only within that exact marched space, with no reliance on incidental move-param zone discovery.

## Assumption Reassessment (2026-03-10)

1. Card 56 currently compiles and passes focused tests using the existing engine workaround in `data/games/fire-in-the-lake/41-content-event-decks.md`.
2. The current runtime behavior is sufficient for the covered Rally path, but the exact-space semantics for other follow-up actions are still expressed indirectly via generic free-operation machinery rather than by a dedicated contract.
3. Because `FREEOP-001` defines the agnostic solution, this ticket should not add more FITL-specific engine logic. Its job is to rewrite the card data and tests onto the new generic mechanism.

## Architecture Check

1. Reworking card 56 onto the explicit grant-locus contract is cleaner than layering more FITL-specific `zoneFilter` tricks into the data file.
2. The card stays fully data-driven in GameSpecDoc. Engine changes belong to `FREEOP-001`; this ticket only consumes them from FITL content and tests.
3. No backwards-compatibility path should remain for the old card-56 encoding once the new contract is in place.

## What to Change

### 1. Replace card-56 shaded follow-up encoding with the new contract

Update the shaded event definition in `data/games/fire-in-the-lake/41-content-event-decks.md` so that each selected/marched space issues a follow-up grant using the new exact-locus contract from `FREEOP-001`.

The rewritten card must:

1. preserve the "up to 3 different spaces" targeting behavior,
2. preserve Monsoon bypass for the initial March only,
3. preserve one follow-up action per marched space,
4. avoid bespoke FITL-only logic in engine code.

### 2. Keep unshaded behavior unchanged except for any cleanup required by the new contract

Do not change the user-facing rules for unshaded. Only refactor surrounding data/tests if the new turn-flow model suggests a cleaner declarative form.

### 3. Expand focused card-56 coverage

Add/adjust tests so card 56 proves:

1. distinct-space March targeting,
2. Monsoon March allowance,
3. exact-space follow-up enforcement,
4. one-use-per-space behavior,
5. rejection of off-space follow-up attempts,
6. at least one non-Rally follow-up path using the new contract if that is now expressible deterministically.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)

## Out of Scope

- Defining the new engine contract itself; that belongs to `tickets/FREEOP-001-grant-scoped-operation-locus.md`
- Unrelated FITL event cards
- Visual config changes

## Acceptance Criteria

### Tests That Must Pass

1. Card 56 shaded follow-up grants rely on the new explicit locus contract rather than ad hoc `zoneFilter`/move-zone inference.
2. Card 56 focused tests prove exact-space enforcement and one-follow-up-per-marched-space behavior under the new model.
3. Existing suite: `pnpm -F @ludoforge/engine build`
4. Existing suite: `node packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
5. Existing suite: `node packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`

### Invariants

1. FITL-specific behavior remains in `GameSpecDoc` content and FITL tests; no card-56-specific branches are added to GameDef or simulation code.
2. No backwards-compatibility encoding for the old card-56 workaround remains once the new contract is adopted.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` — update to assert the new exact-locus semantics directly.
2. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — update compile-shape expectations so card 56 is pinned to the new declarative form.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
3. `node packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`

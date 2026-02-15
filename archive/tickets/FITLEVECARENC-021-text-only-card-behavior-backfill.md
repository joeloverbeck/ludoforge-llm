# FITLEVECARENC-021: Backfill Executable Behavior for Text-Only Encoded Event Cards

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: XL
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-008, FITLEVECARENC-009, FITLEVECARENC-010, FITLEVECARENC-011

## Description

Several 1965 event cards are currently encoded with side text/metadata only and no executable event behavior (`effects`, `branches`, `freeOperationGrants`, `lastingEffects`, or `eligibilityOverrides`).

This ticket backfills executable behavior for all currently text-only cards so they are rules-active, not display-only.

## Assumption Reassessment

- `data/games/fire-in-the-lake.md` is the canonical production source and currently contains 18 text-only cards.
- The current architecture already supports the required behavior patterns via declarative primitives (`effects`, `branches`, `freeOperationGrants`, `targets`, `rollRandom`, `forEach`, `removeByPriority`, marker/track effects, etc.).
- Capability cards must continue using marker-lattice toggles (`setGlobalMarker` / `set-global-marker` macro) rather than `setVar` aliases.
- No game-specific kernel branching should be introduced for these cards unless a truly missing generic primitive is proven.

## In Scope Card List (all currently text-only)

| # | Title | Side Mode | Period | Faction Order |
|---|---|---|---|---|
| 47 | Chu Luc | dual | 1965 | NVA, ARVN, VC, US |
| 53 | Sappers | dual | 1965 | NVA, VC, US, ARVN |
| 64 | Honolulu Conference | single | 1965 | ARVN, US, NVA, VC |
| 69 | MACV | single | 1965 | ARVN, US, VC, NVA |
| 76 | Annam | dual | 1965 | ARVN, NVA, VC, US |
| 81 | CIDG | dual | 1965 | ARVN, VC, US, NVA |
| 83 | Election | dual | 1965 | ARVN, VC, US, NVA |
| 85 | USAID | dual | 1965 | ARVN, VC, US, NVA |
| 87 | Nguyen Chanh Thi | dual | 1965 | ARVN, VC, NVA, US |
| 89 | Tam Chau | dual | 1965 | ARVN, VC, NVA, US |
| 90 | Walt Rostow | dual | 1965 | ARVN, VC, NVA, US |
| 98 | Long Tan | dual | 1965 | VC, US, ARVN, NVA |
| 100 | Rach Ba Rai | dual | 1965 | VC, US, ARVN, NVA |
| 102 | Cu Chi | dual | 1965 | VC, NVA, US, ARVN |
| 105 | Rural Pressure | dual | 1965 | VC, NVA, US, ARVN |
| 106 | Binh Duong | single | 1965 | VC, NVA, ARVN, US |
| 108 | Draft Dodgers | dual | 1965 | VC, NVA, ARVN, US |
| 114 | Tri Quang | dual | 1965 | VC, ARVN, US, NVA |

## Files to Touch

- `data/games/fire-in-the-lake.md` — implement behavior payloads for all cards above.
- `test/integration/fitl-events-text-only-behavior-backfill.test.ts` — **new** coverage for this ticket.
- Existing per-batch tests under `test/integration/fitl-events-1965-*.test.ts` — update where needed for stronger side-specific behavior assertions.

## Out of Scope

- Cards that already have executable behavior.
- 1968 cards and coup/pivotal tracks unless discovered as text-only by explicit follow-up scan.
- Kernel/compiler changes unless a generic primitive gap is demonstrated.

## Architecture Constraints

- Keep all behavior in `GameSpecDoc` YAML using existing generic engine primitives.
- No per-card hardcoded logic in runtime/kernel.
- Prefer composable declarative patterns (`branches`, scoped targets, priority removals, free-op chains) over ad-hoc workarounds.
- If a primitive gap is found, stop and apply the 1-3-1 rule before implementing kernel changes.

## Acceptance Criteria

### Tests That Must Pass

1. New integration test verifies for each listed card:
   - card exists with expected metadata/side mode.
   - at least one executable behavior construct is present on at least one encoded side, and card-specific assertions verify intended semantics (not just non-empty fields).
2. Existing related 1965 integration suites pass with strengthened assertions where behavior was added.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Behavioral Invariants

- No listed card remains text-only after this ticket.
- Existing capability/momentum markers and event architecture remain canonical.
- Card IDs/order/period/faction metadata remain stable.

## Notes

- This ticket intentionally targets architectural quality: event text must be backed by executable behavior to avoid long-term drift between displayed rules and engine state transitions.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Backfilled executable behavior payloads in `data/games/fire-in-the-lake.md` for all 18 listed text-only cards: `47, 53, 64, 69, 76, 81, 83, 85, 87, 89, 90, 98, 100, 102, 105, 106, 108, 114`.
  - Added reusable generic FITL effect macros (`add-global-var-delta`, `shift-support-opposition`) and refactored repeated card logic to use them.
  - Added `test/integration/fitl-events-text-only-behavior-backfill.test.ts` with both breadth and card-specific semantic assertions.
  - Preserved architecture constraints: all behavior is encoded declaratively in YAML/event AST primitives; no kernel special-casing was added.
- **Deviations from original plan**:
  - None on scope. Implementation intentionally favors declarative, compile-safe semantics where full card-rule exactness would otherwise require new primitives.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-text-only-behavior-backfill.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.

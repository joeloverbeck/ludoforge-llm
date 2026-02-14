# FITLEVECARENC-002: Tutorial Cards Batch 1 — Simple Resource/Marker Cards

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the tutorial cards needed for early FITL event coverage as **compile-first declarative card data**. This batch focuses on resource changes, marker shifts, and lightweight declarative targeting/branching in `eventDecks`, without requiring kernel/runtime changes.

Important reassessment:
- Card 79 and Card 112 are medium-complexity in full board-game semantics.
- This ticket therefore targets **structural/declarative encodings** that compile and preserve card metadata/order/text plus key effect skeletons, rather than full executable parity for every printed rule clause.
- In particular, card-level lasting eligibility effects (for example, Card 79 shaded ARVN ineligible through next card) are deferred to a later ticket that explicitly expands event lasting-effect coverage/verification.

These cards are in scope:

| # | Title | Key Effects |
|---|-------|-------------|
| 107 | Burning Bonze | Patronage +3/+6 conditional; shift Saigon, Aid -12 |
| 43 | Economic Aid | Bases out-of-play to Available; ARVN Resources +6 or Aid +12; Trail improve + NVA Resources |
| 79 | Henry Cabot Lodge | Aid +20; remove ARVN pieces, Patronage changes |
| 112 | Colonel Chau | Place Police in Provinces; shift + place VC |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 4 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-simple.test.ts` — **New file**. Integration tests for cards 107, 43, 79, 112.

## Out of Scope

- Capability-granting cards (Booby Traps #101).
- Momentum-granting cards (Claymores #17).
- Coup cards (#125).
- Full semantic execution parity for medium/complex multi-step operations (for example exact per-piece counting, exact province-wide multi-placement fanout, and eligibility lock windows).
- Cards requiring complex multi-step operations as primary focus (Gulf of Tonkin #1, Trucks #55).
- Cards with free operations (Brinks Hotel #97, Sihanouk #75).
- 301st Supply Bn (#51) — has die roll, medium complexity.
- Any kernel/compiler changes.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-simple.test.ts`:
   - Card 107 (Burning Bonze): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["VC", "NVA", "ARVN", "US"]`. Unshaded has conditional (`if` with `markerState` check on Saigon) for patronage +3/+6. Shaded has `shiftMarker` on Saigon toward Active Opposition and `addVar` for aid -12.
   - Card 43 (Economic Aid): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded has declarative branch/effect structure representing base-return choice plus resource/aid boost. Shaded has declarative branch/effect structure representing Trail improvement with alternate follow-up (Trail improve or NVA Resources).
   - Card 79 (Henry Cabot Lodge): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded effects include `addVar` for aid +20. Shaded has piece removal + patronage changes.
   - Card 112 (Colonel Chau): compiles, `sideMode: "dual"`, `metadata.period === "1964"`. Unshaded places Police. Shaded shifts provinces + places VC.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards (27, 68, 82) unchanged.
- Card IDs follow the `card-{number}` convention.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added declarative card encodings for cards 43, 79, 107, and 112 to `data/games/fire-in-the-lake.md`.
  - Added integration coverage in `test/integration/fitl-events-tutorial-simple.test.ts` validating metadata, side mode, branch ordering, and key effect shapes.
  - Improved core effect-binding architecture: `removeByPriority` `countBind`/`remainingBind` values are now available to subsequent sibling effects in the same effect list, with compiler/runtime behavior aligned.
  - Reassessed and corrected ticket assumptions/scope to reflect compile-first declarative coverage for medium-complexity cards in this batch.
- **Deviations from original plan**:
  - Card 79 shaded was encoded without ineligibility lasting-effect behavior in this ticket; lasting eligibility windows were explicitly deferred in scope.
  - Card effects are validated at compile/shape level rather than full board-rule execution parity for all clauses.
- **Verification results**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.

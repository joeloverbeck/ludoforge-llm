# FITLEVECARENC-020: Full Deck Compilation & Golden Test

**Status**: TODO
**Priority**: P4
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Testing Requirements)
**Depends on**: All FITLEVECARENC-001 through 019

## Description

Final validation ticket. After all 130 cards are encoded:

1. Verify the entire deck (130 cards) compiles without errors as a single production spec.
2. Generate a golden test for the tutorial deck (13 cards) — compile to expected GameDef JSON fragment.
3. Verify deck-wide invariants:
   - All 130 card IDs are unique.
   - All faction orders are valid (4 factions, each appearing exactly once).
   - All card references (capabilities, momentum, spaces, pieces) resolve correctly.
   - Cards are sorted by `order` field in the compiled output.
   - Dual-use cards have both `unshaded` and `shaded` defined.
   - Single-mode cards (coup, pivotal) have only `unshaded`.

## Files to Touch

- `test/integration/fitl-events-full-deck.test.ts` — **New file**. Full-deck compilation and invariant tests.
- `test/fixtures/fitl-events-tutorial-golden.json` — **New file**. Golden output for the 13-card tutorial deck.

## Out of Scope

- Encoding any cards (done in prior tickets).
- Any kernel/compiler changes.
- E2E simulation tests (Spec 31).

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-full-deck.test.ts`:
   - `compileProductionSpec()` succeeds with no errors.
   - Exactly 130 cards are present in `eventDecks[0].cards`.
   - All 130 `card.id` values are unique.
   - Every `metadata.factionOrder` has exactly 4 entries, each a valid faction, no duplicates.
   - Every dual-use card has both `unshaded` and `shaded` defined (or explicitly null for cards with no shaded text).
   - Every card tagged `"pivotal"` has a `playCondition`.
   - Every card tagged `"coup"` has `sideMode: "single"`.
   - Card ordering by `order` field is monotonically increasing in compiled output.
2. Golden test: tutorial deck subset matches `fitl-events-tutorial-golden.json`.
3. `npm run build` passes.
4. `npm test` passes.

### Invariants That Must Remain True

- This ticket changes no source code or card definitions — purely additive test files.
- All prior FITLEVECARENC tickets' tests continue to pass.

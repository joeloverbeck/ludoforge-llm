# FITLEVECARENC-020: Full Deck Compilation & Golden Test

**Status**: ✅ COMPLETED
**Priority**: P4
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Testing Requirements)
**Depends on**: All FITLEVECARENC-001 through 019

## Description

Final validation ticket. Reassessed against the current production spec and test surface on 2026-02-15.

Current compiled reality:

- The production event deck currently compiles to **130 cards**.
- Card IDs **`card-44`** and **`card-73`** are now implemented and compiled.
- Coup cards **`card-125`** through **`card-130`** are single-mode and intentionally do not carry `metadata.factionOrder`.
- Compile diagnostics currently include non-error warnings (`CNL_COMPILER_BINDING_SHADOWED`) outside event deck cross-reference integrity.

This ticket establishes deck-wide guardrails for the current encoded set and a tutorial-fragment golden test.

1. Verify the entire currently encoded deck (130 cards) compiles without errors as a single production spec.
2. Generate a golden test for the tutorial subset (13 cards) — compile to expected GameDef JSON fragment.
3. Verify deck-wide invariants:
   - All 130 compiled card IDs are unique.
   - Compiled ID coverage is complete for 1..130.
   - `metadata.factionOrder` is valid where present (4 unique FITL factions), and is absent for coup cards 125-130.
   - Event-deck cross references do not emit `CNL_XREF_*` diagnostics.
   - Cards are sorted by `order` field in the compiled output.
   - Dual-use cards have both `unshaded` and `shaded` defined.
   - Single-mode cards have only `unshaded`.

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
   - `compileProductionSpec()` succeeds with no **error-severity** diagnostics.
   - Exactly 130 cards are present in `eventDecks[0].cards`.
   - IDs `card-1` through `card-130` each exist exactly once.
   - Every non-coup card has valid `metadata.factionOrder` (4 unique entries from US/NVA/ARVN/VC).
   - Coup cards 125-130 have no `metadata.factionOrder`.
   - No compiled diagnostics have codes beginning with `CNL_XREF_`.
   - Every dual-use card has both `unshaded` and `shaded` defined.
   - Every card tagged `"pivotal"` has a `playCondition`.
   - Every card tagged `"coup"` has `sideMode: "single"`.
   - Card ordering by `order` field is monotonically increasing in compiled output.
2. Golden test: tutorial deck subset matches `fitl-events-tutorial-golden.json`.
3. `npm run build` passes.
4. `npm run lint` passes.
5. `npm test` passes.

### Invariants That Must Remain True

- This ticket remains test-centric, but subsequent architecture work implemented formerly missing cards and commitment-phase production behavior.
- All prior FITLEVECARENC tickets' tests continue to pass.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Added `test/integration/fitl-events-full-deck.test.ts` with full-deck invariant checks and tutorial golden-fragment verification.
  - Added `test/fixtures/fitl-events-tutorial-golden.json` with deterministic tutorial subset fragment expectations.
  - Updated this ticket's assumptions/scope from the temporary 128-card gap to the current 130-card compiled reality and clarified coup-card `factionOrder` behavior.
  - Follow-up implementation completed `card-44` and `card-73` production encoding and wired `card-73` into commitment-phase execution.
  - Added generic non-pipeline move validation support for effect decision completion in `src/kernel/apply-move.ts` so declarative `chooseOne`/`chooseN` actions validate before effect runtime.
- Deviations from original plan:
  - Assumptions evolved over time: intermediate validation targeted 128 cards, then returned to full 130-card coverage after missing cards were implemented.
  - Follow-up work included production behavior implementation (commitment execution path), beyond the ticket's initial pure-test intent.
- Verification results:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (including `fitl-events-full-deck`, `fitl-events-text-only-behavior-backfill`, and `fitl-commitment-phase` integration tests).

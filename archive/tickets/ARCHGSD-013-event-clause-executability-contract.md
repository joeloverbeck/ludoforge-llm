# ARCHGSD-013: Event Clause Executability Contract (No Descriptive Gaps)

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md
**Depends on**: FITLEVECARENC-005

## Description

Close the gap where event text encodes gameplay effects that are not executable in effects/branches. Establish and enforce a contract that encoded gameplay clauses are runnable.

## Reassessed Assumptions

1. **Current state mismatch exists**: `card-1` unshaded currently declares targeting intent (`targets`) and text for piece movement, but has no executable `effects`/`branches`/`lastingEffects` implementing that movement.
2. **Existing test gap is real**: `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` currently validates metadata/shape only; it does not verify runtime execution of the movement clause.
3. **Best contract boundary in current architecture**: the clean, generic enforcement point is event-deck cross-validation (compiler diagnostics), not game-specific runtime handlers.
4. **Scope correction**: this ticket should enforce **presence of executable gameplay payload when side/branch targets are declared**, not attempt a brittle NLP/text parser for semantic text understanding.

### What to Implement

1. Implement the currently descriptive-only gameplay clause for FITL `card-1` unshaded:
   - "moves 6 US pieces from out-of-play to any Cities" as executable effects.
2. Add generic event-deck contract validation: emit a compiler diagnostic when an event side/branch declares `targets` but declares no executable gameplay payload (`effects`, `branches`, or `lastingEffects`) at that same scope.
3. Keep implementation generic and data-driven; no game-specific event handlers.

## Files to Touch

- `data/games/fire-in-the-lake.md`
- `src/cnl/cross-validate.ts`
- `test/unit/cross-validate.test.ts`
- `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`
- Possibly additional event validation tests under `test/integration/` or `test/unit/`

## Out of Scope

- Rewriting unrelated cards.
- Adding non-essential event DSL features not required by this clause.

## Acceptance Criteria

### Tests That Must Pass

1. Gulf of Tonkin integration test covers executable movement clause end-to-end (not just metadata/targets).
2. New negative test: event side with targeting intent but no executable gameplay payload fails cross-validation/compile with a deterministic diagnostic code.
3. `npm run build` passes.
4. `npm test` passes.
5. `npm run lint` passes.

### Invariants That Must Remain True

- No partially descriptive gameplay clauses in implemented cards.
- No game-specific branching in kernel/simulator for event behavior.
- Deterministic execution from GameSpecDoc-defined data.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added executable unshaded Gulf of Tonkin movement effects in `data/games/fire-in-the-lake.md` (6 US out-of-play pieces moved into Cities via runtime choices).
  - Added generic cross-validation contract in `src/cnl/cross-validate.ts` with diagnostic code `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING`.
  - Added/updated tests:
    - `test/unit/cross-validate.test.ts` for negative/positive executability contract coverage.
    - `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` for runtime execution of the movement clause.
- **Deviations from original plan**:
  - Gulf of Tonkin implementation shifted from descriptive `targets` metadata to executable effect-driven choices, to ensure actual runtime consumption and avoid non-executable targeting declarations.
- **Verification results**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.

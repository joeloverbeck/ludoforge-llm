# KERGAMLOOTRI-003 - Legal Move Enumeration and Deterministic Ordering

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement `legalMoves(def, state)` to return exactly valid moves for the active player with deterministic, stable ordering.

## Reassessed Assumptions (Current Code/Test Baseline)
- `src/kernel/legal-moves.ts` was a `KERGAMLOOTRI-001` stub and threw.
- `src/kernel/action-usage.ts` (`resetTurnUsage` / `resetPhaseUsage`) was also stubbed and threw.
- `test/unit/game-loop-api-shape.test.ts` expected `legalMoves` and both usage reset helpers to throw `not implemented`.
- There was no dedicated `test/unit/legal-moves.test.ts`.
- Query/selector/condition primitives needed by this ticket were already implemented and tested:
  - `evalQuery` deterministic ordering (ints increasing, zones lexicographic, token order by zone state)
  - `resolvePlayerSel` / `resolveZoneSel`
  - `evalCondition`

## Scope
- Implement `legalMoves(def, state)` with:
  - phase filtering (`action.phase === state.currentPhase`)
  - actor filtering via resolved actor set
  - action usage limit filtering (`turn`, `phase`, `game`)
  - deterministic parameter-domain enumeration via `evalQuery`
  - deterministic param-combination expansion by param declaration order
  - precondition filtering via `evalCondition`
  - move materialization with canonical param key insertion order (declaration order)
- Implement minimal non-throwing action usage reset helpers required by Spec 06 API surface:
  - `resetTurnUsage(state)`
  - `resetPhaseUsage(state)`
- Update API-shape expectations for newly implemented functions.

## File List Expected To Touch
- `src/kernel/legal-moves.ts`
- `src/kernel/action-usage.ts`
- `test/unit/legal-moves.test.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (update expectations for implemented functions)

## Out Of Scope
- Applying any move effects/costs.
- Trigger dispatch.
- Phase/turn progression and stall detection.
- Terminal detection.
- `applyMove` move-validation API and illegal-move error surface (ticket `KERGAMLOOTRI-004`).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/legal-moves.test.ts`
  - phase mismatch actions are excluded.
  - actor mismatch actions are excluded.
  - limit-exhausted actions are excluded by scope.
  - precondition-failing parameter combinations are excluded.
  - successful domains and combinations produce expected `Move` values.
  - empty legal move sets return `[]`.
  - identical states produce identical move order across repeated calls.
  - dependent param-domain resolution honors declaration-order bindings.
- `test/unit/game-loop-api-shape.test.ts`
  - `legalMoves` returns an array for valid inputs.
  - `resetTurnUsage` and `resetPhaseUsage` return updated state instead of throwing.
- Existing selector/query/condition tests remain green:
  - `test/unit/resolve-selectors.test.ts`
  - `test/unit/eval-query.test.ts`
  - `test/unit/eval-condition.test.ts`

## Invariants That Must Remain True
- `legalMoves` contains no move whose precondition is false in the same state.
- `legalMoves` ordering is deterministic for identical state snapshots.
- No RNG consumption occurs during legal move generation.

## Outcome
- Completion date: 2026-02-10
- What changed:
  - Implemented `legalMoves` with deterministic filtering and enumeration: phase + actor + usage limit gating, parameter-domain expansion through `evalQuery`, precondition checks through `evalCondition`, and stable move ordering by action/parameter declaration order.
  - Implemented `resetTurnUsage` and `resetPhaseUsage` as immutable non-throwing state updates.
  - Added `test/unit/legal-moves.test.ts` covering phase/actor/limit exclusion, precondition filtering, deterministic ordering, empty-result behavior, dependent parameter-domain binding, and param key ordering.
  - Updated `test/unit/game-loop-api-shape.test.ts` to assert implemented behavior for `legalMoves` and usage-reset helpers.
- Deviations from original plan:
  - Included `action-usage` helper implementation in this ticket because both helpers remained stubs and were part of this ticket’s assumptions/scope realignment.
- Verification:
  - `npm test` (passes)

# KERGAMLOOTRI-003 - Legal Move Enumeration and Deterministic Ordering

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement `legalMoves(def, state)` to return exactly valid moves for the active player with deterministic, stable ordering.

## Scope
- Action filtering by:
  - current phase
  - resolved actor set
  - action usage limits (`turn`, `phase`, `game`)
- Deterministic parameter domain enumeration using `evalQuery`.
- Deterministic cartesian-product expansion by param declaration order.
- Precondition filtering with `evalCondition`.
- Move materialization with canonical parameter key order.

## File List Expected To Touch
- `src/kernel/legal-moves.ts`
- `src/kernel/action-usage.ts`
- `src/kernel/resolve-selectors.ts` (only if actor resolution helpers need reuse-export, no semantic changes)
- `test/unit/legal-moves.test.ts` (new)

## Out Of Scope
- Applying any move effects/costs.
- Trigger dispatch.
- Phase/turn progression and stall detection.
- Terminal detection.

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
- Existing selector/query tests remain green:
  - `test/unit/resolve-selectors.test.ts`
  - `test/unit/eval-query.test.ts`

## Invariants That Must Remain True
- `legalMoves` contains no move whose precondition is false in the same state.
- `legalMoves` ordering is deterministic for identical state snapshots.
- No RNG consumption occurs during legal move generation.

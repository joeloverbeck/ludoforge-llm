# KERGAMLOOTRI-007 - Terminal Result Ordering and Scoring Resolution

**Status**: ✅ COMPLETED
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-001`

## Goal
Implement `terminalResult(def, state)` with first-match end-condition semantics and deterministic score ranking.

## Scope
- Evaluate `def.endConditions` in declaration order.
- Resolve terminal outputs for:
  - `win` (selector resolution to concrete player)
  - `lossAll`
  - `draw`
  - `score` (requires `def.scoring`, computes ranked scores for all players)
- Return `null` when no condition matches.
- Preserve public API shape from `src/kernel/index.ts`.

## File List Expected To Touch
- `src/kernel/terminal.ts`
- `test/unit/terminal.test.ts` (new)
- `test/unit/game-loop-api-shape.test.ts` (update now-stale "not implemented" assumption)

## Out Of Scope
- Any move application or progression flow.
- Trigger dispatch.
- Evaluator metric/degeneracy pipelines.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/terminal.test.ts`
  - win condition resolves correct player.
  - loss/draw conditions return correct variants.
  - score condition returns deterministic ranking for both `highest` and `lowest` scoring methods.
  - no matched condition returns `null`.
  - when multiple conditions are true, first declared condition wins.
- Existing condition/value tests remain green:
  - `test/unit/eval-condition.test.ts`
  - `test/unit/eval-value.test.ts`
- Existing API-shape test is updated to assert implemented behavior rather than the old stub throw.

## Invariants That Must Remain True
- End-condition evaluation order is definition order.
- `terminalResult` is pure and side-effect free.
- Score ranking is deterministic for equal inputs (tie-break by player id).
- `win` result resolves exactly one player.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented `terminalResult(def, state)` in `src/kernel/terminal.ts`.
  - Added `test/unit/terminal.test.ts` covering win/lossAll/draw/score/null/first-match and deterministic tie ordering.
  - Updated `test/unit/game-loop-api-shape.test.ts` to assert implemented behavior (`null` when no end condition matches) instead of stub-throw behavior.
- **Deviation from original plan**:
  - `src/kernel/resolve-selectors.ts` did not need changes; existing selector resolution APIs were sufficient.
  - Added explicit `lowest` scoring-method test coverage to lock deterministic ranking behavior.
- **Verification**:
  - `npm run build`
  - `npm run test:unit`

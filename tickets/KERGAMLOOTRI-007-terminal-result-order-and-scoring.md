# KERGAMLOOTRI-007 - Terminal Result Ordering and Scoring Resolution

**Status**: ⏳ TODO
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
  - `score` (requires `def.scoring`, computes ranked scores)
- Return `null` when no condition matches.

## File List Expected To Touch
- `src/kernel/terminal.ts`
- `src/kernel/resolve-selectors.ts` (only if additional selector helper is needed, no behavior drift)
- `test/unit/terminal.test.ts` (new)

## Out Of Scope
- Any move application or progression flow.
- Trigger dispatch.
- Evaluator metric/degeneracy pipelines.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/terminal.test.ts`
  - win condition resolves correct player.
  - loss/draw conditions return correct variants.
  - score condition returns deterministic ranking.
  - no matched condition returns `null`.
  - when multiple conditions are true, first declared condition wins.
- Existing condition/value tests remain green:
  - `test/unit/eval-condition.test.ts`
  - `test/unit/eval-value.test.ts`

## Invariants That Must Remain True
- End-condition evaluation order is definition order.
- `terminalResult` is pure and side-effect free.
- Score ranking is deterministic for equal inputs.

# GAMEDEFGEN-003: Unified Move Validation for Static and Dynamic Effect Decisions

**Status**: Draft  
**Priority**: P0  
**Complexity**: L  
**Depends on**: Current `legalChoices` and `applyMove` pipelines

## 1) What needs to change / be implemented

Unify move validation so all decision-bearing actions (including dynamic event-side effects) are validated through one canonical path before effect runtime.

- Refactor `applyMove` validation to use `legalChoices`/decision-sequence resolution as single source of truth for decision completeness/param legality.
- Ensure dynamic event effects participate in pre-execution decision validation.
- Keep declared action params validation strict and separate from decision params.
- Remove duplicated/heuristic checks based on local effect scanning where they can diverge.
- Ensure failure modes are consistent (`OPERATION_INVALID_PARAMS`, `OPERATION_INCOMPLETE_PARAMS`, etc.).

## 2) Invariants that should pass

- No effect runtime failure caused by missing decision params when move was previously considered legal.
- Validation outcome is consistent across `legalMoves`, `legalChoices`, and `applyMove`.
- Dynamic event-driven decisions are validated pre-execution exactly like static action decisions.
- Error codes/messages remain deterministic and stable.

## 3) Tests that should pass

### New tests
- `test/unit/kernel/move-validation-unified.test.ts`
  - static action decisions and dynamic event decisions share same validation behavior.
- `test/integration/event-decision-validation.test.ts`
  - event-side `chooseOne/chooseN` requires complete params before runtime.

### Modified tests
- `test/unit/apply-move.test.ts`
  - cover incomplete/invalid decision params and declared param mismatches.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`


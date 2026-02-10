# KERCONVALQUEEVA-006 - Condition Evaluation (`evalCondition`)

**Status**: ✅ COMPLETED

## Goal
Implement full non-spatial condition semantics including short-circuit boolean logic, comparisons, and set membership.

## Reassessed Assumptions (2026-02-10)
- `src/kernel/eval-condition.ts` does not exist yet; this ticket must introduce it.
- `test/unit/eval-condition.test.ts` does not exist yet; this ticket must add it.
- `ConditionAST` currently includes `and`, `or`, `not`, `==`, `!=`, `<`, `<=`, `>`, `>=`, and `in` only.
- Spatial condition operators (`adjacent`, `connected`) are not currently representable in `ConditionAST`, so runtime stubs for those operators are not in scope for this ticket.
- `evalValue` and `resolveRef` currently resolve to scalar values only, so `in` set membership cannot rely on scalar `evalValue` alone when the set is a collection.

## Scope
- Add `evalCondition(cond, ctx)` support for:
  - `and`, `or`, `not`
  - `==`, `!=`, `<`, `<=`, `>`, `>=`
  - `in`
- Use `evalValue` for operand evaluation.
- For `in`, evaluate `item` via `evalValue`; resolve `set` as a collection from bound runtime values when needed, without widening `evalValue`'s public scalar return contract.
- Enforce numeric requirement for ordering comparisons.

## File List Expected To Touch
- `src/kernel/types.ts` (only if required for compatibility; avoid unless necessary)
- `src/kernel/eval-condition.ts`
- `src/kernel/index.ts`
- `test/unit/eval-condition.test.ts`

## Out Of Scope
- Changing `ConditionAST` schema/type shape.
- Widening `evalValue` or `resolveRef` return types beyond scalar values.
- Query implementation internals.
- Effect/runtime mutation behavior.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-condition.test.ts`:
  - comparison truth tables for all six comparison operators.
  - boolean logic cases including vacuous `and([]) => true` and `or([]) => false`.
  - nested expression case: `and([or([A,B]), not(C)])`.
  - ordering comparisons with non-numeric operands throw `TYPE_MISMATCH`.
  - `in` membership works against array-like values bound in `ctx.bindings` (for example values produced by query evaluation in higher layers).
  - short-circuit behavior is verified (later args are not evaluated once result is known).
- Existing tests remain green:
  - `test/unit/eval-value.test.ts`
  - `test/unit/eval-query.test.ts`
  - `test/unit/schemas-ast.test.ts`

### Invariants That Must Remain True
- `evalCondition` always returns a boolean for supported operators.
- `and`/`or` use short-circuit evaluation.
- Condition evaluation is pure and side-effect free.

## Outcome
- **Completed on**: 2026-02-10
- **What was changed**:
  - Added `src/kernel/eval-condition.ts` implementing `and`/`or`/`not`, all six comparisons, and `in` membership with short-circuit logic.
  - Exported `evalCondition` from `src/kernel/index.ts`.
  - Added `test/unit/eval-condition.test.ts` covering comparison truth tables, boolean logic (including vacuous cases), nested expressions, short-circuit behavior, non-numeric ordering mismatch, and `in` membership/error behavior.
- **Deviations from original plan**:
  - Spatial condition stubs were not implemented because current `ConditionAST` does not represent `adjacent`/`connected` condition operators.
  - `in` set membership was implemented via bound collection values (for example query results passed through bindings) without changing the scalar public contract of `evalValue`/`resolveRef`.
- **Verification**:
  - Ran `npm test` (build + unit + integration) with all tests passing.

# KERCONVALQUEEVA-006 - Condition Evaluation (`evalCondition`)

**Status**: TODO

## Goal
Implement full non-spatial condition semantics including short-circuit boolean logic, comparisons, and set membership.

## Scope
- Add `evalCondition(cond, ctx)` support for:
  - `and`, `or`, `not`
  - `==`, `!=`, `<`, `<=`, `>`, `>=`
  - `in`
- Use `evalValue` for operand evaluation.
- Enforce numeric requirement for ordering comparisons.
- Add spatial condition stubs (`adjacent`, `connected`) returning `SPATIAL_NOT_IMPLEMENTED` once represented in AST inputs.

## File List Expected To Touch
- `src/kernel/eval-condition.ts`
- `src/kernel/index.ts`
- `test/unit/eval-condition.test.ts`

## Out Of Scope
- Changing `ConditionAST` schema/type shape unless required for spatial stub compatibility.
- Query implementation internals.
- Effect/runtime mutation behavior.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-condition.test.ts`:
  - comparison truth tables for all six comparison operators.
  - boolean logic cases including vacuous `and([]) => true` and `or([]) => false`.
  - nested expression case: `and([or([A,B]), not(C)])`.
  - ordering comparisons with non-numeric operands throw `TYPE_MISMATCH`.
  - `in` membership works against query-produced arrays.
- Existing tests remain green:
  - `test/unit/schemas-ast.test.ts`

### Invariants That Must Remain True
- `evalCondition` always returns a boolean for supported operators.
- `and`/`or` use short-circuit evaluation.
- Condition evaluation is pure and side-effect free.

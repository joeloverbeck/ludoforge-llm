# KERCONVALQUEEVA-005 - Value Expression Evaluation (`evalValue`)

**Status**: TODO

## Goal
Implement `evalValue` for literals, references, integer arithmetic, and aggregates over queries.

## Scope
- Add `evalValue(expr, ctx)` handling:
  - primitives (`number`, `boolean`, `string`)
  - reference delegation to `resolveRef`
  - arithmetic ops `+`, `-`, `*`
  - aggregate ops `sum`, `count`, `min`, `max`
- Enforce integer-only safe arithmetic (`Number.isSafeInteger`, finite checks).
- Enforce aggregate numeric extraction semantics and typed mismatch errors.

## File List Expected To Touch
- `src/kernel/eval-value.ts`
- `src/kernel/index.ts`
- `test/unit/eval-value.test.ts`

## Out Of Scope
- Condition boolean operator evaluation.
- Query engine internals beyond calling `evalQuery`.
- Any float/division support.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-value.test.ts`:
  - literal passthrough for number/boolean/string.
  - arithmetic: `3+4`, `10-3`, `5*2` produce expected integers.
  - non-numeric arithmetic operand throws `TYPE_MISMATCH`.
  - `count(tokensInZone(...))` works for non-empty and empty collections.
  - `sum(..., 'vp')`, `min(..., 'cost')`, `max(..., 'cost')` produce expected values.
  - `sum` over empty returns `0`; `min`/`max` over empty return `0`.
  - aggregate with missing or non-numeric prop throws `TYPE_MISMATCH`.
- Existing tests remain green:
  - `test/unit/types-exhaustive.test.ts`

### Invariants That Must Remain True
- `evalValue` never returns `NaN` or `Infinity`.
- Arithmetic remains integer-only with no coercion.
- Aggregate behavior matches Spec 04 defaults on empty collections.

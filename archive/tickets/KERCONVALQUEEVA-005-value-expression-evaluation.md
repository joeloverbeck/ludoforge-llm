# KERCONVALQUEEVA-005 - Value Expression Evaluation (`evalValue`)

**Status**: ✅ COMPLETED

## Goal
Implement `evalValue` for literals, references, integer arithmetic, and aggregates over queries.

## Reassessed Assumptions (2026-02-10)
- `evalValue` is not implemented in the current codebase (`src/kernel/eval-value.ts` does not exist yet).
- `evalQuery` and `resolveRef` are already implemented and exported; `evalValue` should compose these modules rather than duplicating logic.
- No `eval-value` unit tests currently exist; this ticket must add a new focused test file.
- Existing unit coverage for queries and references (`test/unit/eval-query.test.ts`, `test/unit/resolve-ref.test.ts`) should remain unchanged and green.

## Scope
- Add `evalValue(expr, ctx)` handling:
  - primitives (`number`, `boolean`, `string`)
  - reference delegation to `resolveRef`
  - arithmetic ops `+`, `-`, `*`
  - aggregate ops `sum`, `count`, `min`, `max`
- Enforce integer-only safe arithmetic (`Number.isSafeInteger`, finite checks).
- Enforce aggregate numeric extraction semantics and typed mismatch errors:
  - when `prop` is omitted, aggregate items must be numeric safe integers
  - when `prop` is present, aggregate items must expose a numeric safe-integer property
  - `sum`/`min`/`max` results must remain finite safe integers

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
  - `test/unit/eval-query.test.ts`
  - `test/unit/resolve-ref.test.ts`

### Invariants That Must Remain True
- `evalValue` never returns `NaN` or `Infinity`.
- Arithmetic remains integer-only with no coercion.
- Aggregate behavior matches Spec 04 defaults on empty collections.

## Outcome
- **Completed on**: 2026-02-10
- **What was changed**:
  - Implemented `evalValue` in `src/kernel/eval-value.ts` with literal passthrough, reference delegation, integer arithmetic (`+`, `-`, `*`), and aggregate evaluation (`sum`, `count`, `min`, `max`).
  - Added strict finite safe-integer enforcement for arithmetic operands/results and aggregate numeric extraction/results.
  - Exported `evalValue` from `src/kernel/index.ts`.
  - Added `test/unit/eval-value.test.ts` covering required ticket scenarios plus safe-integer overflow rejection.
- **Deviations from original plan**:
  - No behavioral deviations; implementation matched the planned operator/aggregate scope.
  - Added one extra edge-case test for arithmetic overflow (`Number.MAX_SAFE_INTEGER + 1`) to enforce the safe-integer invariant explicitly.
- **Verification**:
  - Ran `npm test` (build + unit + integration) with all tests passing.

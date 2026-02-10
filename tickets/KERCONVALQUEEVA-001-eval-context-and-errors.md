# KERCONVALQUEEVA-001 - Eval Context and Typed Evaluation Errors

**Status**: TODO

## Goal
Introduce the shared evaluation context type and a typed runtime error surface used by all Spec 04 evaluators.

## Scope
- Add `EvalContext` definition and defaulting helper for `maxQueryResults`.
- Add `EvalError` class with required `code` union:
  - `MISSING_BINDING`
  - `MISSING_VAR`
  - `TYPE_MISMATCH`
  - `SELECTOR_CARDINALITY`
  - `QUERY_BOUNDS_EXCEEDED`
  - `SPATIAL_NOT_IMPLEMENTED`
- Add helper constructors/guards to standardize diagnostic-rich error messages.

## File List Expected To Touch
- `src/kernel/eval-context.ts`
- `src/kernel/eval-error.ts`
- `src/kernel/index.ts`
- `test/unit/eval-error.test.ts`

## Out Of Scope
- Selector resolution logic.
- Reference/value/condition/query evaluation logic.
- Any effect application or state mutation behavior.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/eval-error.test.ts`:
  - constructing each error code sets `.code` correctly.
  - error message includes structured context payload when provided.
  - default `maxQueryResults` resolves to `10_000`.
- Existing regression checks remain green:
  - `test/unit/smoke.test.ts`
  - `test/unit/types-foundation.test.ts`

### Invariants That Must Remain True
- `EvalContext` remains immutable (`readonly` fields and no mutation helpers).
- Error codes are stable string literals for downstream assertions.
- No runtime side effects are introduced in context/error modules.

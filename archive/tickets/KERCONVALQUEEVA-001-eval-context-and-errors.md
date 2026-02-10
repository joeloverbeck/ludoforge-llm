# KERCONVALQUEEVA-001 - Eval Context and Typed Evaluation Errors

**Status**: ✅ COMPLETED

## Goal
Introduce the shared evaluation context type and a typed runtime error surface used by all Spec 04 evaluators.

## Reassessed Assumptions (Current Codebase)
- `src/kernel/eval-context.ts` and `src/kernel/eval-error.ts` do not exist yet.
- No selector/reference/query/value/condition evaluation modules exist yet in `src/kernel/`.
- `src/kernel/types.ts` already contains the AST/reference/query domain types this ticket should build on.
- There is no existing `test/unit/eval-error.test.ts`; regression baselines currently available are `test/unit/smoke.test.ts` and `test/unit/types-foundation.test.ts`.
- Because evaluator execution modules are deferred to tickets `KERCONVALQUEEVA-002` through `KERCONVALQUEEVA-006`, this ticket should only add reusable context/error foundations and tests for those primitives.

## Scope
- Add new `src/kernel/eval-context.ts` with:
  - `EvalContext` definition.
  - defaulting helper for `maxQueryResults`.
- Add new `src/kernel/eval-error.ts` with `EvalError` class and required `code` union:
  - `MISSING_BINDING`
  - `MISSING_VAR`
  - `TYPE_MISMATCH`
  - `SELECTOR_CARDINALITY`
  - `QUERY_BOUNDS_EXCEEDED`
  - `SPATIAL_NOT_IMPLEMENTED`
- Add helper constructors/guards in `eval-error.ts` to standardize diagnostic-rich error messages for later evaluator tickets.
- Re-export new primitives from `src/kernel/index.ts`.

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

## Outcome
- **Completed**: February 10, 2026
- **What changed**:
  - Added `src/kernel/eval-context.ts` with immutable `EvalContext`, `DEFAULT_MAX_QUERY_RESULTS`, and `getMaxQueryResults`.
  - Added `src/kernel/eval-error.ts` with `EvalError`, stable `EvalErrorCode` union, constructor helpers per code, and error guards.
  - Updated `src/kernel/index.ts` to export the new evaluation context/error APIs.
  - Added `test/unit/eval-error.test.ts` to verify error codes, context-rich message formatting, guard behavior, and default query result bound behavior.
- **What changed vs original plan**:
  - Scope remained foundational only; no evaluator execution modules were introduced because they belong to follow-up tickets (`002`-`006`).
  - Added explicit guard coverage (`isEvalError`, `isEvalErrorCode`) in tests to lock down helper behavior for downstream evaluator tickets.
- **Verification**:
  - `npm run build` passes.
  - `npm test` passes (unit + integration).

# KEREFFINT-002 - Variable Effects (`setVar`, `addVar`) and Clamping

**Status**: ✅ COMPLETED
**Spec**: `specs/05-kernel-effect-interpreter.md`
**Depends on**: `KEREFFINT-001`

## Goal
Implement variable mutation effects for global and per-player scopes with strict runtime validation and clamping to declared variable bounds.

## Reassessed Assumptions (Current Codebase)
- `src/kernel/effects.ts` currently has only dispatcher skeleton behavior from `KEREFFINT-001`; `setVar` and `addVar` are still unimplemented.
- `test/unit/effects-runtime.test.ts` currently asserts that `setVar` is not implemented. Once this ticket lands, that assertion must be updated to use a still-unimplemented effect kind.
- `src/kernel/effect-error.ts` already contains the required runtime error primitives; no new error types are needed for this ticket.
- Spec 04 evaluators already exist as `evalValue` and `resolvePlayerSel`. For effect execution, bindings must use Spec 05 precedence: `effectiveBindings = { ...moveParams, ...bindings }`.

## Scope
- Implement `setVar` handler.
- Implement `addVar` handler.
- Use Spec 04 evaluators (`evalValue`, `resolvePlayerSel`) to resolve inputs.
- Validate variable existence and type (`int` only).
- Clamp post-update value to `[VariableDef.min, VariableDef.max]`.
- Ensure scalar player selection for per-player variable operations.
- Keep `moveTokenAdjacent` stub and all other effect handlers unchanged.
- Update `effects-runtime` assertions impacted by this ticket.

## File List Expected To Touch
- `src/kernel/effects.ts`
- `test/unit/effects-var.test.ts` (new)
- `test/unit/effects-runtime.test.ts`

## Out Of Scope
- Token movement effects (`moveToken`, `moveAll`, `draw`, `shuffle`).
- Token lifecycle effects (`createToken`, `destroyToken`).
- Control flow and choice assertion effects.
- Any change to variable declaration schemas or `validate-gamedef` rules.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/effects-var.test.ts`
  - `setVar` global updates the targeted global variable.
  - `setVar` pvar updates only the resolved player variable.
  - `setVar` clamps above max and below min.
  - `addVar` global and pvar apply signed deltas correctly.
  - `addVar` clamps above max and below min.
  - unknown variable name throws descriptive runtime error.
  - non-numeric evaluated value/delta throws type mismatch runtime error.
  - per-player scalar cardinality mismatch throws descriptive runtime error.
- `test/unit/effects-runtime.test.ts`
  - remains green with its dispatcher-order assertion updated to target an effect kind that is still out of scope in this ticket.

## Invariants That Must Remain True
- Only the targeted variable cell changes; unrelated state branches remain byte-for-byte equivalent references where possible.
- All updated variable values remain within declared min/max bounds.
- Input state object is never mutated.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented `setVar` and `addVar` handlers in `src/kernel/effects.ts` with:
    - Spec 05 binding precedence via `effectiveBindings = { ...moveParams, ...bindings }`.
    - global/per-player variable definition lookup and `int` type validation.
    - scalar-player enforcement for per-player operations.
    - finite safe-integer validation for evaluated `value`/`delta`.
    - min/max clamping to declared variable bounds.
    - immutable state updates with unchanged-state fast path when result equals current value.
  - Added `test/unit/effects-var.test.ts` covering variable updates, clamping, unknown-variable errors, non-numeric input errors, scalar-cardinality enforcement, and moveParams/bindings precedence.
  - Updated `test/unit/effects-runtime.test.ts` to keep dispatcher-order semantics valid after `setVar`/`addVar` implementation.
- **Deviations from original plan**:
  - `src/kernel/effect-error.ts` was not modified; existing runtime error types were sufficient.
  - `test/unit/effects-runtime.test.ts` required fixture/expectation updates because `setVar` and `addVar` are no longer "not implemented."
- **Verification**:
  - `npm run test:unit` passed.
  - `npm test` passed.

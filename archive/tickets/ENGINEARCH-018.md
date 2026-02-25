# ENGINEARCH-018: Type-Narrow Defer-Class Contracts by EvalError Code

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel defer-class typing + classifier API + type/runtime tests
**Deps**: None

## Problem

`hasEvalErrorDeferClass` currently accepts the full `EvalErrorDeferClass` union even though it only operates on `SELECTOR_CARDINALITY`. This allows semantically invalid defer-class/code combinations to compile, reducing type-safety as defer-class taxonomy expands.

## Assumption Reassessment (2026-02-25)

1. `EVAL_ERROR_DEFER_CLASSES_BY_CODE` exists and currently maps only `SELECTOR_CARDINALITY` defer classes.
2. `hasEvalErrorDeferClass` is currently typed with the broad `EvalErrorDeferClass` parameter instead of a code-specific subtype.
3. `ENGINEARCH-019` is active and depends on this ticket; it addresses map-driven classifier parity, not type-level code/defer-class narrowing.

## Architecture Check

1. Per-code defer-class typing is cleaner than broad unions because it prevents invalid combinations at compile time.
2. This change is kernel-generic and does not introduce game-specific behavior into GameDef/runtime/simulator.
3. No backwards-compatibility aliases/shims are introduced; invalid call patterns become direct type failures.
4. This is beneficial over current architecture because it separates concerns cleanly:
   - `ENGINEARCH-018`: compile-time contract correctness (type system).
   - `ENGINEARCH-019`: runtime taxonomy sourcing/parity (behavioral source-of-truth).

## What to Change

### 1. Introduce code-specific defer-class utility types

Add utility types (for example `EvalErrorCodeWithDeferClass` and `EvalErrorDeferClassForCode<C>`) derived from `EVAL_ERROR_DEFER_CLASSES_BY_CODE`.

### 2. Narrow classifier contracts to code-specific defer classes

Update `hasEvalErrorDeferClass` (or replace with a code-parameterized variant) so the defer-class parameter is constrained to the selected error code branch. Keep this ticket scoped to type-level narrowing plus parity runtime behavior for existing `SELECTOR_CARDINALITY` paths; do not fold in map-consumption refactors from `ENGINEARCH-019`.

### 3. Add compile-time guardrails and parity runtime checks

Add type-level tests that reject invalid code/defer-class pairings and keep runtime behavior parity for current `SELECTOR_CARDINALITY` usage.

## Files to Touch

- `packages/engine/src/kernel/eval-error-defer-class.ts` (modify)
- `packages/engine/src/kernel/eval-error-classification.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-error-classification.test.ts` (modify)

## Out of Scope

- Adding new defer classes or new eval error codes
- Selector runtime behavior changes
- GameSpecDoc / visual-config format changes

## Acceptance Criteria

### Tests That Must Pass

1. Invalid defer-class/code combinations are compile-time failures.
2. Existing selector-cardinality defer behavior remains unchanged at runtime.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Defer-class typing is code-specific and cannot silently accept invalid combinations.
2. GameDef and simulator remain game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add `@ts-expect-error` cases for invalid code/defer-class combinations and acceptance for valid combinations.
2. `packages/engine/test/unit/eval-error-classification.test.ts` — verify runtime classification behavior parity after API narrowing.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error-classification.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Added code-derived utility types `EvalErrorCodeWithDeferClass` and `EvalErrorDeferClassForCode<C>` in `eval-error-defer-class.ts`.
  - Narrowed `hasEvalErrorDeferClass` to a code-parameterized contract in `eval-error-classification.ts`.
  - Updated the `missing-binding-policy` caller to pass explicit code + defer class.
  - Strengthened compile-time contract coverage in `types-foundation.test.ts`.
  - Updated runtime parity assertions in `eval-error-classification.test.ts`.
- Deviations from original plan:
  - `missing-binding-policy.ts` was touched in implementation even though it was removed from the revised “Files to Touch” list during reassessment; this was required to satisfy the stricter classifier signature.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error-classification.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (159/159).
  - `pnpm -F @ludoforge/engine lint` passed.

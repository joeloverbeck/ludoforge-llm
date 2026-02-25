# ENGINEARCH-018: Type-Narrow Defer-Class Contracts by EvalError Code

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel defer-class typing + classifier API + type/runtime tests
**Deps**: None

## Problem

`hasEvalErrorDeferClass` currently accepts the full `EvalErrorDeferClass` union even though it only operates on `SELECTOR_CARDINALITY`. This allows semantically invalid defer-class/code combinations to compile, reducing type-safety as defer-class taxonomy expands.

## Assumption Reassessment (2026-02-25)

1. `EVAL_ERROR_DEFER_CLASSES_BY_CODE` exists and currently maps only `SELECTOR_CARDINALITY` defer classes.
2. `hasEvalErrorDeferClass` is currently typed with the broad `EvalErrorDeferClass` parameter instead of a code-specific subtype.
3. No active ticket currently introduces per-code defer-class narrowing for classifier signatures.

## Architecture Check

1. Per-code defer-class typing is cleaner than broad unions because it prevents invalid combinations at compile time.
2. This change is kernel-generic and does not introduce game-specific behavior into GameDef/runtime/simulator.
3. No backwards-compatibility aliases/shims are introduced; invalid call patterns become direct type failures.

## What to Change

### 1. Introduce code-specific defer-class utility types

Add utility types (for example `EvalErrorCodeWithDeferClass` and `EvalErrorDeferClassForCode<C>`) derived from `EVAL_ERROR_DEFER_CLASSES_BY_CODE`.

### 2. Narrow classifier contracts to code-specific defer classes

Update `hasEvalErrorDeferClass` (or replace with a code-parameterized variant) so the defer-class parameter is constrained to the selected error code branch.

### 3. Add compile-time guardrails and parity runtime checks

Add type-level tests that reject invalid code/defer-class pairings and keep runtime behavior parity for current `SELECTOR_CARDINALITY` usage.

## Files to Touch

- `packages/engine/src/kernel/eval-error-defer-class.ts` (modify)
- `packages/engine/src/kernel/eval-error-classification.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify, if needed)
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


# ENGINEARCH-013: Seal EvalError Context Typing and Enforce Typed Selector-Cardinality Metadata

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-error contracts + selector error emission + type tests
**Deps**: ENGINEARCH-012

## Problem

`EvalError` now has code-aware context typing, but current construction still allows context values to be widened to `Record<string, unknown>` and bypass stricter compile-time checks. In practice, invalid `deferClass` literals can still compile when context objects are assembled in untyped intermediate variables.

## Assumption Reassessment (2026-02-25)

1. `EvalErrorContextForCode<'SELECTOR_CARDINALITY'>` exists and includes typed `deferClass` support in `packages/engine/src/kernel/eval-error.ts`.
2. `resolveSingleZoneSel` currently constructs selector-cardinality context using `Record<string, unknown>` before passing to `selectorCardinalityError`.
3. Existing tests validate runtime behavior, but no type-level test currently fails when invalid `deferClass` values are assigned through widened context objects.

## Architecture Check

1. A type contract is only robust if invalid states are unrepresentable at compile time; allowing widened intermediary context objects keeps this partially convention-based.
2. Tightening error context construction and validation remains fully game-agnostic and concerns generic kernel/runtime contracts only.
3. No backwards-compatibility aliases/shims are introduced; the contract is hardened in-place.

## What to Change

### 1. Remove widening escape hatches in selector-cardinality context construction

Replace `Record<string, unknown>` context assembly in selector-resolution paths with typed context objects (`EvalErrorContextForCode<'SELECTOR_CARDINALITY'>` or dedicated helper builders).

### 2. Tighten eval-error context contracts for selector-cardinality metadata

Refine `eval-error` typings so selector-cardinality `deferClass` cannot be silently bypassed via broad context intermediates used in internal call sites.

### 3. Add compile-time guardrail tests

Add/extend type-focused unit tests using `@ts-expect-error` to assert invalid `deferClass` assignments are rejected and valid metadata remains accepted.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify) 
- `packages/engine/test/unit/eval-error.test.ts` (modify, if needed)

## Out of Scope

- New selector language semantics
- Changes to GameSpecDoc/YAML schema
- Runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Type-level test fails compilation for invalid selector-cardinality `deferClass` assignments.
2. Runtime selector-cardinality deferral tests continue to pass with typed context construction.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `EvalError` classification metadata remains generic and policy-driven, not game-specific.
2. Selector-cardinality defer metadata is compile-time constrained where emitted.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add `@ts-expect-error` assertions for invalid `deferClass` literals and widened context misuse.
2. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — retain behavior assertions to ensure policy still defers only typed unresolved-binding cardinality.
3. `packages/engine/test/unit/resolve-selectors.test.ts` — retain metadata emission assertions for intended selector-cardinality path.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
4. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
5. `pnpm -F @ludoforge/engine test:unit`

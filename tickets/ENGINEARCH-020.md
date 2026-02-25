# ENGINEARCH-020: Enforce Exact, Mutually Exclusive Selector-Cardinality Context Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel eval-error type contracts + compile-time type tests
**Deps**: None

## Problem

`SELECTOR_CARDINALITY` now has a discriminator, but branch payload exclusivity is still not fully enforced when contexts are widened. The current branch shapes inherit from `EvalErrorContext` (`Readonly<Record<string, unknown>>`), which permits extra keys and leaves room for mixed player+zone payload objects to type-check in non-literal flows.

## Assumption Reassessment (2026-02-25)

1. `TypedSelectorCardinalityEvalErrorContext` currently uses `selectorKind` discrimination in `packages/engine/src/kernel/eval-error.ts`.
2. Branch types currently intersect with `EvalErrorContext` (index-signature map), which can weaken exactness/excess-property protections for discriminated unions.
3. Existing tests in `packages/engine/test/unit/types-foundation.test.ts` reject some invalid literal shapes, but do not yet guarantee mixed-branch payload rejection for widened/non-literal objects.

## Architecture Check

1. Exact and mutually exclusive branch contracts are cleaner and more robust than permissive map intersections because invalid mixed payloads fail at compile time in more real-world call flows.
2. This is pure kernel typing hardening and preserves game-agnostic GameDef/simulation behavior with no GameSpecDoc or visual-config coupling.
3. No backwards-compatibility aliases/shims are introduced; invalid payload shapes become direct type errors.

## What to Change

### 1. Remove permissive map intersection from selector-cardinality branches

Refactor selector-cardinality branch types so they do not inherit the broad `Readonly<Record<string, unknown>>` index signature.

### 2. Make branch payloads structurally exclusive

Add explicit `never`-typed exclusions (or equivalent exactness strategy) so player branch cannot include zone-only keys and zone branch cannot include player-only keys.

### 3. Keep non-selector error contexts unchanged

Do not broaden this into a global eval-error context redesign; scope is selector-cardinality type contract hardening only.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

## Out of Scope

- Selector runtime semantics changes
- Defer taxonomy policy changes (`EVAL_ERROR_DEFER_CLASSES_BY_CODE` behavior)
- GameSpecDoc / visual-config format changes

## Acceptance Criteria

### Tests That Must Pass

1. Mixed player+zone selector-cardinality payloads are compile-time failures for literal and widened contexts.
2. Valid player and zone branch payloads still type-check.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `SELECTOR_CARDINALITY` context is compile-time unambiguous and branch-exclusive.
2. GameDef/simulator/runtime remain game-agnostic and free from game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time cases that reject payloads containing both player and zone branch fields, including widened-object paths.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/types-foundation.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

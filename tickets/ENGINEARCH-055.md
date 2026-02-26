# ENGINEARCH-055: Derive malformed scoped-endpoint contract from strict contract to prevent type drift

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel scoped-endpoint type contract refactor + type guard tests
**Deps**: ENGINEARCH-054

## Problem

`ScopedVarResolvableEndpoint` (strict) and `ScopedVarMalformedResolvableEndpoint` (tolerant) are currently maintained as two manually duplicated unions. This creates a drift seam: a future endpoint-shape edit can update one union but not the other.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/src/kernel/scoped-var-runtime-access.ts` currently defines strict and tolerant endpoint unions separately.
2. Resolver behavior is correct today, but type-maintenance is not single-source-of-truth.
3. Existing tests assert strict/tolerant behavior, but they do not enforce that tolerant endpoint type shape is mechanically derived from strict endpoint shape.
4. **Mismatch + correction**: endpoint type architecture should be DRY, with tolerant selector optionality derived from strict endpoint definitions.

## Architecture Check

1. Deriving tolerant endpoint contracts from strict contracts is cleaner and more extensible than dual handwritten unions, and removes a predictable source of type drift.
2. This is a pure kernel type-layer refactor; GameSpecDoc/GameDef runtime behavior remains game-agnostic and unchanged.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Refactor endpoint type declarations to single-source strict contract

In `scoped-var-runtime-access.ts`, define strict endpoint branches as canonical and derive tolerant branch type(s) via mapped/utility types that optionalize only selector fields (`player`, `zone`) for scoped branches.

### 2. Strengthen type-level contract assertions

Add compile-time assertions proving:
- strict contract requires selector fields for `pvar`/`zoneVar`
- tolerant contract allows selector omission only for those fields
- non-selector endpoint shape (scope/var and discriminants) remains aligned between strict and tolerant contracts

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)

## Out of Scope

- Effect runtime behavior changes
- Resolver normalization policy changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Strict and tolerant endpoint types share one canonical shape source and no longer require manual duplicated unions.
2. Existing runtime behavior and diagnostics for strict/tolerant resolver paths remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped endpoint contract evolution is DRY and deterministic at the type layer.
2. Kernel runtime remains game-agnostic with malformed payload tolerance explicitly bounded.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — expanded compile-time assertions for strict/tolerant endpoint type derivation and selector optionality boundaries.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

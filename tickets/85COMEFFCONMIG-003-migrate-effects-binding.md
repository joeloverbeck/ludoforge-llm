# 85COMEFFCONMIG-003: Replace fromEnvAndCursor in effects-binding.ts (1 call site)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-binding.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-binding.ts` has 1 `fromEnvAndCursor` call site in `applyBindValue`. This constructs a full `EffectContext` (~30 field spread) when the downstream call only needs `ReadContext` (~13 fields). Replacing with `mergeToReadContext` eliminates unnecessary field copies.

## Assumption Reassessment (2026-03-26)

1. `applyBindValue` has exactly 1 `fromEnvAndCursor` call at line ~17 — confirmed
2. The resulting `evalCtx` is passed to `evalValue()` which accepts `ReadContext` — confirmed
3. No trace provenance or other `EffectContext`-specific field usage in this handler — confirmed

## Architecture Check

1. `mergeToReadContext` is already used in 6 call sites in `effects-control.ts` — proven V8-safe
2. No game-specific logic (Foundation 1)
3. No shims — direct replacement (Foundation 9)

## What to Change

### 1. Replace fromEnvAndCursor with mergeToReadContext

In `applyBindValue`:
- `const evalCtx = fromEnvAndCursor(env, cursor)` -> `const evalCtx = mergeToReadContext(env, cursor)`
- Update import: remove `fromEnvAndCursor`, add `mergeToReadContext` (from `effect-context.ts`)
- Remove `EffectContext` from imports if no longer used

## Files to Touch

- `packages/engine/src/kernel/effects-binding.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to `evalValue` or other eval functions
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing binding effect tests: `pnpm -F @ludoforge/engine test`
2. Determinism tests pass (same seed + same actions = identical stateHash)
3. TypeScript strict mode confirms `mergeToReadContext` return type satisfies all downstream calls

### Invariants

1. `mergeToReadContext` produces an object with the same fields accessed by downstream eval calls
2. No new imports of `EffectContext` introduced
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. No new tests needed — identical observable behavior

### Commands

1. `pnpm turbo typecheck` — verify type compatibility
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions

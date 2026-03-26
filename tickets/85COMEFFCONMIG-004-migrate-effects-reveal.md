# 85COMEFFCONMIG-004: Replace fromEnvAndCursor in effects-reveal.ts (2 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-reveal.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-reveal.ts` has 2 `fromEnvAndCursor` call sites in `applyConceal` and `applyReveal`. Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext`.

## Assumption Reassessment (2026-03-26)

1. `applyConceal` has 1 `fromEnvAndCursor` call at line ~41 — confirmed
2. `applyReveal` has 1 `fromEnvAndCursor` call at line ~140 — confirmed
3. Both pass the result to `evalValue`/`evalCondition`/`resolveRef` functions that accept `ReadContext` — confirmed
4. Check whether trace provenance functions are called in these handlers — if so, inline pick objects needed

## Architecture Check

1. `mergeToReadContext` is proven V8-safe in `effects-control.ts`
2. No game-specific logic (Foundation 1)
3. No shims — direct replacement (Foundation 9)

## What to Change

### 1. Replace fromEnvAndCursor in applyConceal

- `const evalCtx = fromEnvAndCursor(env, cursor)` -> `const evalCtx = mergeToReadContext(env, cursor)`
- Or `mergeToEvalContext` if moveParams binding resolution is needed — check the call site

### 2. Replace fromEnvAndCursor in applyReveal

- Same pattern as applyConceal

### 3. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext` (and/or `mergeToEvalContext`)
- Remove `EffectContext` from imports if no longer used

## Files to Touch

- `packages/engine/src/kernel/effects-reveal.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to eval functions
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing reveal/conceal effect tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising reveal/conceal mechanics
3. Determinism tests pass

### Invariants

1. Downstream eval calls receive objects with all required `ReadContext` fields
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

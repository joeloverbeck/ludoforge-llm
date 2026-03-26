# 85COMEFFCONMIG-005: Replace fromEnvAndCursor in effects-subset.ts (2 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-subset.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-subset.ts` has 2 `fromEnvAndCursor` call sites in `applyEvaluateSubset`. Each constructs a full `EffectContext` (~30 field spread) when downstream calls only need `ReadContext`.

## Assumption Reassessment (2026-03-26)

1. `applyEvaluateSubset` has 2 `fromEnvAndCursor` calls at lines ~43 and ~97 — confirmed
2. The resulting contexts are passed to eval functions accepting `ReadContext` — confirmed
3. Check whether both calls use the same binding resolution pattern or differ

## Architecture Check

1. `mergeToReadContext`/`mergeToEvalContext` are proven V8-safe
2. No game-specific logic (Foundation 1)
3. No shims — direct replacement (Foundation 9)

## What to Change

### 1. Replace both fromEnvAndCursor calls in applyEvaluateSubset

For each call site:
- If bindings are resolved before the call: use `mergeToEvalContext(env, cursor)` or `mergeToReadContext(env, evalCursor)`
- If using raw cursor bindings: use `mergeToReadContext(env, cursor)`
- Match the existing pattern used in `effects-control.ts`

### 2. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used

## Files to Touch

- `packages/engine/src/kernel/effects-subset.ts` (modify)

## Out of Scope

- Any changes to `effect-context.ts`
- Any changes to other effect handler files
- Signature changes to eval functions
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing subset evaluation tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising evaluateSubset mechanics
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

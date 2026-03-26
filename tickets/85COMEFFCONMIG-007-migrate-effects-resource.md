# 85COMEFFCONMIG-007: Replace fromEnvAndCursor in effects-resource.ts (2 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-resource.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-resource.ts` has 2 `fromEnvAndCursor` call sites in `applyTransferVar`. These construct full `EffectContext` objects (~30 field spread) when `ReadContext` suffices for eval calls and inline pick objects suffice for trace calls.

Similar to -006: this ticket calls `resolveRuntimeScopedEndpointWithMalformedSupport` (widened in -001) and must pass `env.mode`, and uses trace functions needing inline pick objects.

## Assumption Reassessment (2026-03-26)

1. `applyTransferVar` has 2 `fromEnvAndCursor` calls at lines ~184-185 — confirmed
2. One creates an eval context (resolved bindings), one creates a raw context — confirmed
3. Both are used for `resolveEndpoint` which calls `resolveRuntimeScopedEndpointWithMalformedSupport` — confirmed
4. `evalValue` is called for amount evaluation — confirmed
5. Trace functions may be called — check for `emitVarChangeTraceIfChanged` usage

## Architecture Check

1. Same patterns proven in `effects-control.ts` and planned for -006
2. Explicit `env.mode` threading is cleaner than full `EffectContext` passthrough
3. No shims (Foundation 9), no game-specific logic (Foundation 1)

## What to Change

### 1. Replace both fromEnvAndCursor calls in applyTransferVar

- For eval context (resolved bindings): use `mergeToEvalContext(env, cursor)` or `mergeToReadContext(env, evalCursor)`
- For raw context: use `mergeToReadContext(env, cursor)`
- For `resolveRuntimeScopedEndpointWithMalformedSupport`: pass ReadContext + `env.mode`
- For trace calls: construct inline pick object (~4 fields)

### 2. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used

## Files to Touch

- `packages/engine/src/kernel/effects-resource.ts` (modify)

## Out of Scope

- Any changes to `scoped-var-runtime-access.ts` (done in -001)
- Any changes to `effect-context.ts`
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing transferVar tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising resource transfer (transferVar operations)
3. Determinism tests pass
4. Trace output includes correct provenance for transfers

### Invariants

1. `resolveRuntimeScopedEndpointWithMalformedSupport` receives `ReadContext` + correct `mode` value
2. Trace pick objects contain all 4 required fields
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. No new tests needed — identical observable behavior

### Commands

1. `pnpm turbo typecheck` — verify type compatibility
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions

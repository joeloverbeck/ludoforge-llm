# 85COMEFFCONMIG-006: Replace fromEnvAndCursor in effects-var.ts (3 call sites)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effects-var.ts
**Deps**: 85COMEFFCONMIG-001

## Problem

`effects-var.ts` has 3 `fromEnvAndCursor` call sites in `applySetVar`, `applyAddVar`, and `applySetActivePlayer`. These construct full `EffectContext` objects (~30 field spread) where `ReadContext` suffices for eval calls, and inline pick objects suffice for trace calls.

This ticket is more involved than -003/-004/-005 because:
1. It calls `resolveRuntimeScopedEndpoint` (widened in -001) and must pass `env.mode` as the new explicit parameter
2. It calls `emitVarChangeTraceIfChanged` which uses `Pick<EffectContext, 'collector' | 'state' | 'traceContext' | 'effectPath'>` — requires an inline pick object from env + cursor fields

## Assumption Reassessment (2026-03-26)

1. `applySetVar` at line ~79: calls `evalValue`, `resolveRuntimeScopedEndpoint`, `resolveScopedVarDef`, `emitVarChangeTraceIfChanged` — confirmed
2. `applyAddVar` at line ~162: same pattern as setVar — confirmed
3. `applySetActivePlayer` at line ~223: simpler, mainly `evalValue` — confirmed
4. `resolveRuntimeScopedEndpoint` now accepts `ReadContext` + `mode` param (from -001) — dependency confirmed
5. `resolveScopedVarDef` / `readScopedVarValue` / `readScopedIntVarValue` were also narrowed in -001, so this ticket should stop passing a full merged context to those helpers and instead thread `{ def }` / `{ state }` explicitly
6. The `env.mode` threading step has already landed in current code; the remaining value of this ticket is removing the unnecessary full-context merge and finishing the narrowing at the file boundary

## Architecture Check

1. Inline pick objects for trace calls are cheaper than `mergeToReadContext` (~4 fields vs ~13 fields) — follows the existing optimization pattern in `trace-provenance.ts`
2. Explicit `env.mode` parameter threading is cleaner than passing full `EffectContext` just for `mode`
3. No shims (Foundation 9), no game-specific logic (Foundation 1)

## What to Change

### 1. Replace fromEnvAndCursor in applySetVar

- For `evalValue`/`resolveRef` calls: use `mergeToReadContext(env, evalCursor)` or `mergeToEvalContext(env, cursor)`
- For `resolveRuntimeScopedEndpoint`: pass `mergeToReadContext` result + `env.mode`
- For `resolveScopedVarDef`: pass `{ def: env.def }` (narrowest possible)
- For `emitVarChangeTraceIfChanged`: construct inline pick: `{ collector: env.collector, state: cursor.state, traceContext: env.traceContext, effectPath: cursor.effectPath }`

### 2. Replace fromEnvAndCursor in applyAddVar

- Same pattern as applySetVar

### 3. Replace fromEnvAndCursor in applySetActivePlayer

- For eval calls: use `mergeToReadContext(env, evalCursor)`
- Check whether trace calls exist — if so, same inline pick pattern

### 4. Update imports

- Remove `fromEnvAndCursor`, add `mergeToReadContext`/`mergeToEvalContext`
- Remove `EffectContext` from imports if no longer used

### Note

This ticket should preserve the architectural direction introduced by -001:
- do not keep passing a broad `evalCtx` to helpers that now accept `{ def }` or `{ state }`
- prefer explicit narrow objects plus a tiny trace pick over retaining `EffectContext`-shaped plumbing out of convenience

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify)

## Out of Scope

- Any changes to `scoped-var-runtime-access.ts` (done in -001)
- Any changes to `effect-context.ts`
- Any changes to `trace-provenance.ts` or `var-change-trace.ts` signatures
- Any changes to other effect handler files
- Performance benchmarking

## Acceptance Criteria

### Tests That Must Pass

1. All existing setVar/addVar/setActivePlayer tests: `pnpm -F @ludoforge/engine test`
2. FITL e2e tests exercising variable manipulation (operations, events, triggers)
3. Determinism tests pass
4. Trace output includes correct provenance (existing trace tests validate this)

### Invariants

1. `resolveRuntimeScopedEndpoint` receives `ReadContext` + correct `mode` value
2. `emitVarChangeTraceIfChanged` receives all 4 required Pick fields
3. Determinism parity maintained
4. Zero `fromEnvAndCursor` references remain in this file

## Test Plan

### New/Modified Tests

1. No new tests needed — identical observable behavior, trace output unchanged

### Commands

1. `pnpm turbo typecheck` — verify type compatibility (catches missing `mode` param)
2. `pnpm turbo test` — full suite passes
3. `pnpm turbo lint` — no lint regressions

# 89SCOMUTEXECON-001: Fix EffectCursor conditional spread polymorphism

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts
**Deps**: Spec 89 (Phase 0). No ticket dependencies.

## Problem

`toEffectCursor`, `toTraceProvenanceContext`, and `toTraceEmissionContext` use conditional spreads (`...(x === undefined ? {} : { x })`) to optionally include `effectPath` and `traceContext` fields. This creates two possible V8 hidden classes per call site — a prerequisite blocker for the monomorphism invariant that the rest of Spec 89 depends on.

## Assumption Reassessment (2026-03-28)

1. `toEffectCursor` (effect-context.ts:240-246) uses `...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })` — **confirmed** from exploration.
2. `toTraceProvenanceContext` (effect-context.ts:251-258) uses conditional spread for both `traceContext` and `effectPath` — **confirmed**.
3. `toTraceEmissionContext` (effect-context.ts:260-266) uses the same conditional spread pattern — **confirmed**.
4. No other conditional spread patterns exist in these factory functions — **confirmed**.

## Architecture Check

1. This is the simplest possible fix: replace conditional spread with always-present properties set to `undefined` when absent. V8 sees one hidden class instead of two per call site.
2. No game-specific logic involved — purely engine-internal context construction.
3. No backwards-compatibility shims. The property is always present; consumers that check `if (ctx.effectPath)` still work because `undefined` is falsy.

## What to Change

### 1. Fix `toEffectCursor` — always set `effectPath`

Replace the conditional spread with a direct property assignment:

```typescript
// Before
...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })

// After
effectPath: ctx.effectPath,   // undefined is fine — property always exists
```

### 2. Fix `toTraceProvenanceContext` — always set `traceContext` and `effectPath`

Same pattern: replace conditional spreads with direct assignments.

### 3. Fix `toTraceEmissionContext` — always set `traceContext` and `effectPath`

Same pattern.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify) — fix 3 functions

## Out of Scope

- MutableReadScope type or factory functions (ticket 002).
- Changes to effect-dispatch.ts or any effects-*.ts handler files.
- Changes to `mergeToEvalContext` or `mergeToReadContext`.
- Changes to `EffectCursor` interface definition (the `effectPath?` optional marker stays — only the object literal construction changes).
- Performance benchmarking (Phase 0 has near-zero runtime impact per spec).

## Acceptance Criteria

### Tests That Must Pass

1. `effect-context-construction-contract.test.ts` — existing tests for `toEffectCursor`, `toTraceProvenanceContext`, `toTraceEmissionContext` must pass without weakening assertions.
2. Full engine test suite: `pnpm -F @ludoforge/engine test`
3. Typecheck: `pnpm -F @ludoforge/engine run typecheck` (or `pnpm turbo typecheck`)

### Invariants

1. `toEffectCursor` always returns an object with `effectPath` as an own property (whether defined or `undefined`).
2. `toTraceProvenanceContext` always returns an object with `traceContext` and `effectPath` as own properties.
3. `toTraceEmissionContext` always returns an object with `traceContext` and `effectPath` as own properties.
4. No conditional spreads (`...(x ? {} : { y })`) remain in these three functions.
5. Determinism: same seed + same actions = identical Zobrist hash (existing determinism tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — add assertions that `effectPath` is an own property of the returned object (via `Object.hasOwn`) even when the source value is `undefined`. Same for `traceContext` on trace context objects.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effect-context"` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (lint)

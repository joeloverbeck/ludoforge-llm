# 78DRASTAEFF-004: Migrate effects-var handlers to native (env, cursor) signature

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-var.ts, effect-registry.ts
**Deps**: 78DRASTAEFF-002, 78DRASTAEFF-003

## Problem

`effects-var.ts` contains 3 handlers (`applySetVar`, `applyAddVar`, `applySetActivePlayer`) currently wrapped with `simple()` in the registry. Each call reconstructs a full ~30-field EffectContext via `fromEnvAndCursor` and creates a new GameState via `writeScopedVarsToState`. This ticket migrates all 3 to native `(effect, env, cursor, budget, applyBatch)` signatures and switches var writes to use `writeScopedVarsMutable`.

## Assumption Reassessment (2026-03-23)

1. All 3 handlers have signature `(effect, ctx: EffectContext) => EffectResult` — confirmed.
2. They import from `effect-context.ts` the `EffectContext` type. After migration they'll use `EffectEnv`, `EffectCursor`, `mergeToEvalContext`, `resolveEffectBindings`.
3. `applySetActivePlayer` spreads state directly (`{ ...ctx.state, activePlayerId: ... }`) — must switch to mutable assignment.
4. `applySetVar` and `applyAddVar` call `writeScopedVarsToState` — must switch to `writeScopedVarsMutable`.
5. Helper functions `resolveRuntimeScopedEndpoint`, `resolveScopedVarDef`, `readScopedVarValue`, `readScopedIntVarValue` currently take `EffectContext` — they need `ReadContext` which can be produced via `mergeToEvalContext(env, cursor)`.

## Architecture Check

1. Each handler is independent — migration can proceed handler-by-handler within this file.
2. The `resolveEffectBindings` local helper duplicates the one in `effect-context.ts` — migration removes this file-local duplicate.
3. Scoped-var-runtime-access functions that take `EffectContext` will receive the merged `ReadContext` — structurally compatible since `ReadContext` is a subset of `EffectContext`.

## What to Change

### 1. Migrate `applySetVar` in `effects-var.ts`

- Change signature to `EffectHandler<'setVar'>` (i.e., `(effect, env, cursor, _budget, _applyBatch) => EffectResult`)
- Replace `ctx.state`, `ctx.rng` → `cursor.state`, `cursor.rng`
- Replace `resolveEffectBindings(ctx)` → `resolveEffectBindings(env, cursor)` (from effect-context.ts)
- Replace `writeScopedVarsToState(ctx.state, writes)` → `writeScopedVarsMutable(cursor.state as MutableGameState, writes, cursor.tracker!)`
- Return `{ state: cursor.state, rng: cursor.rng, emittedEvents: [...] }`

### 2. Migrate `applyAddVar` in `effects-var.ts`

Same pattern as `applySetVar`.

### 3. Migrate `applySetActivePlayer` in `effects-var.ts`

- Change signature to `EffectHandler<'setActivePlayer'>`
- Replace `{ ...ctx.state, activePlayerId: ... }` → mutate `(cursor.state as MutableGameState).activePlayerId = resolvedPlayer`
- Return `{ state: cursor.state, rng: cursor.rng }`

### 4. Update registry entries in `effect-registry.ts`

Change:
```typescript
setVar: simple(applySetVar),
addVar: simple(applyAddVar),
setActivePlayer: simple(applySetActivePlayer),
```
To:
```typescript
setVar: applySetVar,
addVar: applyAddVar,
setActivePlayer: applySetActivePlayer,
```

### 5. Remove file-local `resolveEffectBindings` from `effects-var.ts`

Import `resolveEffectBindings` from `effect-context.ts` instead.

## Files to Touch

- `packages/engine/src/kernel/effects-var.ts` (modify — migrate 3 handlers)
- `packages/engine/src/kernel/effect-registry.ts` (modify — unwrap 3 simple() calls)

## Out of Scope

- Migrating handlers in other effect files (tickets 005–007)
- Changes to `scoped-var-runtime-access.ts` helper signatures — these accept `EffectContext` which is structurally compatible with `ReadContext` from `mergeToEvalContext`
- Removing the `simple()` function definition itself (ticket 008)
- Changes to `state-draft.ts` or `effect-dispatch.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `effects-var.test.ts` — all existing setVar/addVar/setActivePlayer tests pass without modification
2. `effects.golden.test.ts` — golden output unchanged
3. `effects.property.test.ts` — property tests pass
4. FITL and Texas Hold'em E2E tests pass
5. Existing suite: `pnpm turbo test --force`
6. Typecheck: `pnpm turbo typecheck`

### Invariants

1. Handler return values produce identical game state as before migration (determinism preserved).
2. `cursor.tracker!` assertion is safe because ticket 002 guarantees tracker is always set in the dispatch loop.
3. Registry entry types remain `EffectHandler<K>` — no type widening.

## Test Plan

### New/Modified Tests

1. No new tests — existing tests are the regression suite. If any test calls handlers directly with `EffectContext`, those calls must be updated to pass `(effect, env, cursor, budget, applyBatch)`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "setVar|addVar|setActivePlayer"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

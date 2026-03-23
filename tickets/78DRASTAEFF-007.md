# 78DRASTAEFF-007: Migrate turn-flow handlers and compat()-wrapped handlers to native (env, cursor) signature

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effects-turn-flow.ts, effects-subset.ts, effects-choice.ts (rollRandom only), effect-registry.ts
**Deps**: 78DRASTAEFF-002

## Problem

This ticket migrates the remaining wrapped handlers:

**5 `simple()`-wrapped turn-flow handlers** in `effects-turn-flow.ts`:
- `applyGrantFreeOperation`
- `applyGotoPhaseExact`
- `applyAdvancePhase`
- `applyPushInterruptPhase`
- `applyPopInterruptPhase`

**2 `compat()`-wrapped handlers** (more complex — they receive `budget` and `applyBatch`):
- `applyRollRandom` in `effects-choice.ts`
- `applyEvaluateSubset` in `effects-subset.ts`

The `compat()` handlers are the most complex migration because they currently receive an `OldApplyEffectsWithBudget` that takes `EffectContext`, and must be updated to use the native `ApplyEffectsWithBudget` that takes `(env, cursor)`.

## Assumption Reassessment (2026-03-23)

1. Turn-flow handlers call `dispatchLifecycleEvent` which internally calls `applyEffectsWithBudgetState` — creating its own mutable scope. These handlers may still spread state for phase transition setup (`{ ...state, currentPhase: targetPhaseId }`). This is acceptable — they're low-frequency.
2. `applyRollRandom` uses `compat()` because it receives `budget` and `applyBatch`. Its signature is `(effect, ctx, budget, oldApply) => EffectResult`. Migration changes to native `(effect, env, cursor, budget, applyBatch)`.
3. `applyEvaluateSubset` uses `compat()` for the same reason — it calls `applyBatch` to execute sub-effects for each subset combination.
4. `gotoPhaseExact` and `advancePhase` modify multiple state fields (currentPhase, actionUsage, etc.) — some may still use spread patterns for clarity since they're low-frequency.

## Architecture Check

1. Turn-flow handlers are low-frequency (a few per game) — mutable optimization is nice-to-have but the primary goal is removing `simple()`/`fromEnvAndCursor` overhead.
2. `compat()` removal is the critical path — it eliminates both `fromEnvAndCursor` reconstruction AND the `toEffectEnv`/`toEffectCursor` round-trip in `oldApply`.
3. Phase transition handlers that call `dispatchLifecycleEvent` naturally create nested mutable scopes — safe by design.

## What to Change

### 1. Migrate 5 turn-flow handlers in `effects-turn-flow.ts`

For each handler:
- Change signature to `EffectHandler<K>`
- Replace `ctx.*` → `env.*` or `cursor.*`
- For state mutations: mutate `cursor.state as MutableGameState` directly where convenient, or use spread for complex multi-field phase transitions (acceptable for low-frequency handlers)
- `gotoPhaseExact` and `advancePhase` may keep some spread patterns for clarity

### 2. Migrate `applyRollRandom` in `effects-choice.ts`

- Change from `(effect, ctx, budget, oldApply)` to native `EffectHandler<'rollRandom'>`: `(effect, env, cursor, budget, applyBatch)`
- Remove `OldApplyEffectsWithBudget` wrapper — call `applyBatch(effects, env, cursor, budget)` directly
- Update eval calls to use `mergeToEvalContext(env, cursor)`

### 3. Migrate `applyEvaluateSubset` in `effects-subset.ts`

- Change from `(effect, ctx, budget, oldApply)` to native `EffectHandler<'evaluateSubset'>`: `(effect, env, cursor, budget, applyBatch)`
- Remove local `ApplyEffectsWithBudget` type alias (uses the old EffectContext-based signature)
- Call `applyBatch(effects, env, innerCursor, budget)` directly with cursor containing updated bindings
- Remove file-local `resolveEffectBindings` helper

### 4. Update registry entries in `effect-registry.ts`

Change:
```typescript
grantFreeOperation: simple(applyGrantFreeOperation),
gotoPhaseExact: simple(applyGotoPhaseExact),
advancePhase: simple(applyAdvancePhase),
pushInterruptPhase: simple(applyPushInterruptPhase),
popInterruptPhase: simple(applyPopInterruptPhase),
rollRandom: compat(applyRollRandom),
evaluateSubset: compat(applyEvaluateSubset),
```
To direct references (no wrappers).

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` (modify — migrate 5 handlers)
- `packages/engine/src/kernel/effects-choice.ts` (modify — migrate applyRollRandom)
- `packages/engine/src/kernel/effects-subset.ts` (modify — migrate applyEvaluateSubset)
- `packages/engine/src/kernel/effect-registry.ts` (modify — unwrap 5 simple() + 2 compat() calls)

## Out of Scope

- Migrating var/token/reveal/binding/resource handlers (tickets 004–006)
- Removing `simple()`/`compat()` function definitions (ticket 008)
- Optimizing phase transition handlers for mutable performance — they're low-frequency
- Changes to `dispatchLifecycleEvent` or `phase-lifecycle.ts`

## Acceptance Criteria

### Tests That Must Pass

1. `effects-turn-flow.test.ts` — all turn-flow tests pass
2. `effects-choice.test.ts` — rollRandom tests pass
3. `effects-control-flow.test.ts` — evaluateSubset tests pass
4. `effects-lifecycle.test.ts` — lifecycle event dispatching tests pass
5. `effects-complex.test.ts` — complex multi-effect sequences pass
6. `effects.golden.test.ts` — golden output unchanged
7. `effects.property.test.ts` — property tests pass
8. FITL and Texas Hold'em E2E tests pass
9. Existing suite: `pnpm turbo test --force`
10. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `applyBatch` calls from `applyRollRandom` and `applyEvaluateSubset` must pass `(effects, env, cursor, budget)` — no more `EffectContext` reconstruction.
2. Phase transitions via `dispatchLifecycleEvent` create independent mutable scopes — the outer scope's tracker is NOT shared.
3. `interruptPhaseStack` mutations (push/pop) require `(cursor.state as MutableGameState).interruptPhaseStack` to be cloned if not yet cloned — `createMutableState` already handles this for the array.

## Test Plan

### New/Modified Tests

1. No new tests — existing suites cover all handlers. Update direct handler calls if any tests invoke handlers with `EffectContext` directly.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "turnFlow|gotoPhase|advancePhase|rollRandom|evaluateSubset|grantFreeOperation|interruptPhase"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

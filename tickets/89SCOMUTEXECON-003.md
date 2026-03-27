# 89SCOMUTEXECON-003: Wire MutableReadScope into effect dispatch and migrate simple handlers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect dispatch + handler signatures + 4 handler files
**Deps**: 89SCOMUTEXECON-002 (MutableReadScope type and factories must exist)

## Problem

`applyEffectsWithBudgetState` creates 24-field ReadContext objects via `mergeToEvalContext`/`mergeToReadContext` on every effect handler call (~10K+ per game). This ticket creates the scope at dispatch entry, threads it through the handler call convention, and migrates the simpler handler files to use it.

## Assumption Reassessment (2026-03-28)

1. `applyEffectsWithBudgetState` (effect-dispatch.ts:90-157) already maintains a mutable `workCursor` pattern — **confirmed**. The scope will be created alongside it.
2. Effect handlers are dispatched via `applyEffectWithBudget` (effect-dispatch.ts:61-88) which calls registry handlers — **confirmed**. Handler type signature lives in `effect-registry.ts`.
3. Handler type currently receives `(effect, env, cursor, budget, applyBatch)` — **confirmed**. Adding `scope: MutableReadScope` as a 6th parameter.
4. Simple handlers (effects-binding.ts, effects-var.ts, effects-resource.ts, effects-reveal.ts) use `mergeToEvalContext` and/or `mergeToReadContext` with straightforward patterns — **confirmed**.
5. Complex handlers (effects-control.ts, effects-choice.ts, effects-subset.ts, effects-token.ts) have nested iteration, recursive dispatch, or multi-site merge calls — deferred to ticket 004.

## Architecture Check

1. Adding `scope` to the handler signature is a clean extension — no shims. All handlers receive scope from dispatch; simple handlers use it immediately, complex handlers use it in ticket 004.
2. Game-agnostic: scope carries the same engine-internal context as before, just reused instead of recreated.
3. No backwards-compatibility: `mergeToEvalContext`/`mergeToReadContext` calls are removed from migrated handlers. They remain available (temporarily) for handlers migrated in ticket 004.

## What to Change

### 1. Update handler type signature in `effect-registry.ts`

Add `scope: MutableReadScope` as the 6th parameter to the `EffectHandler` type.

### 2. Create scope in `applyEffectsWithBudgetState` (effect-dispatch.ts)

- Create `MutableReadScope` via `createMutableReadScope(env, cursor)` at function entry, alongside the existing `workCursor`.
- Before each effect handler call, call `updateReadScope(scope, workCursor, env)`.
- Pass `scope` to `applyEffectWithBudget`, which forwards it to the handler.

### 3. Thread scope through `applyEffectWithBudget` (effect-dispatch.ts)

Add `scope` parameter; forward to the handler dispatch call.

### 4. Migrate `effects-binding.ts`

Replace `mergeToEvalContext(env, cursor)` calls with direct use of `scope`. Remove import of `mergeToEvalContext`.

### 5. Migrate `effects-var.ts`

Replace `mergeToReadContext(env, cursor)` calls with direct use of `scope`. Remove imports of `mergeToReadContext` and `resolveEffectBindings` (if no longer needed).

### 6. Migrate `effects-resource.ts`

Replace `mergeToEvalContext(env, cursor)` and `mergeToReadContext(env, cursor)` calls with `scope`. Remove merge imports.

### 7. Migrate `effects-reveal.ts`

Replace `mergeToEvalContext(env, cursor)` calls with `scope`. Remove merge import.

### 8. Update remaining handler files to accept (but not yet use) scope

`effects-choice.ts`, `effects-control.ts`, `effects-subset.ts`, `effects-token.ts`, `effects-turn-flow.ts` — add `scope` parameter to handler function signatures. These files continue to call `mergeToEvalContext`/`mergeToReadContext` internally until ticket 004.

## Files to Touch

- `packages/engine/src/kernel/effect-registry.ts` (modify) — handler type signature
- `packages/engine/src/kernel/effect-dispatch.ts` (modify) — scope creation, threading, updateReadScope calls
- `packages/engine/src/kernel/effects-binding.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-var.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-resource.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-reveal.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-choice.ts` (modify) — accept scope parameter (no usage yet)
- `packages/engine/src/kernel/effects-control.ts` (modify) — accept scope parameter (no usage yet)
- `packages/engine/src/kernel/effects-subset.ts` (modify) — accept scope parameter (no usage yet)
- `packages/engine/src/kernel/effects-token.ts` (modify) — accept scope parameter (no usage yet)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify) — accept scope parameter (no usage yet)

## Out of Scope

- Deleting `mergeToEvalContext` or `mergeToReadContext` from effect-context.ts (ticket 004).
- Migrating complex handlers (effects-choice, effects-control, effects-subset, effects-token) to actually use scope (ticket 004).
- Changes to `legal-moves.ts` / `enumerateParams` (ticket 005).
- Changes to `createEvalContext` call sites outside effect dispatch (ticket 006).
- Performance benchmarking (deferred to after ticket 004 completes Phase 1).
- Changes to compiled effect path (`effect-compiler-runtime.ts`, `effect-compiler-codegen.ts`).
- Changes to `ReadContext`, `EffectEnv`, or `EffectCursor` interface definitions.

## Acceptance Criteria

### Tests That Must Pass

1. All existing effect handler tests pass without weakening assertions — especially:
   - `effects-lifecycle.test.ts`
   - `effects-control-flow.test.ts`
   - `effects.golden.test.ts`
   - `effects-complex.test.ts`
2. Determinism tests: same seed + same actions = identical Zobrist hash.
3. Full engine test suite: `pnpm -F @ludoforge/engine test`
4. Typecheck: `pnpm turbo typecheck`

### Invariants

1. Handler type signature includes `scope: MutableReadScope` as 6th parameter across ALL handler files.
2. `applyEffectsWithBudgetState` creates exactly ONE `MutableReadScope` per invocation and calls `updateReadScope` before each handler dispatch.
3. Migrated handlers (binding, var, resource, reveal) do NOT import or call `mergeToEvalContext`/`mergeToReadContext`.
4. Non-migrated handlers (choice, control, subset, token, turn-flow) still call merge functions — they accept but do not use the `scope` parameter.
5. External contract unchanged: `applyMove(state) -> newState` remains immutable.
6. Scope does not escape handler calls (no storing in closures, return values, or result objects).

## Test Plan

### New/Modified Tests

1. No new test files required — existing tests exercise all handler paths via `applyEffects`/`applyMove`. The change is internal plumbing.
2. If test helpers in `effect-context-test-helpers.ts` construct handler calls directly, they must be updated to pass a scope argument.

### Commands

1. `pnpm -F @ludoforge/engine test` (full engine suite — covers all effect handlers)
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/src/kernel/effects-binding.ts packages/engine/src/kernel/effects-var.ts packages/engine/src/kernel/effects-resource.ts packages/engine/src/kernel/effects-reveal.ts` — must return zero matches.

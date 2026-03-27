# 89SCOMUTEXECON-003: Wire MutableReadScope into effect dispatch and migrate simple handlers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect dispatch + handler signatures + 4 handler files
**Deps**: tickets/89SCOMUTEXECON-002.md

## Problem

`applyEffectsWithBudgetState` creates 24-field ReadContext objects via `mergeToEvalContext`/`mergeToReadContext` on every effect handler call (~10K+ per game). This ticket creates the scope at dispatch entry, threads it through the handler call convention, and migrates the simpler handler files to use it.

## Assumption Reassessment (2026-03-28)

1. `applyEffectsWithBudgetState` (effect-dispatch.ts:90-157) already maintains a mutable `workCursor` pattern — **confirmed**. The scope will be created alongside it.
2. Effect handlers are dispatched via `applyEffectWithBudget` (effect-dispatch.ts:61-88) which calls registry handlers — **confirmed**. Handler type signature lives in `effect-registry.ts`.
3. Handler type currently receives `(effect, env, cursor, budget, applyBatch)` — **confirmed**. Adding `scope: MutableReadScope` as a 6th parameter.
4. Simple handlers (effects-binding.ts, effects-var.ts, effects-resource.ts, effects-reveal.ts) use `mergeToEvalContext` and/or `mergeToReadContext` with straightforward patterns — **confirmed**.
5. Complex handlers (effects-control.ts, effects-choice.ts, effects-subset.ts, effects-token.ts) have nested iteration, recursive dispatch, or multi-site merge calls — deferred to ticket 004.
6. Ticket `002` proved the `MutableReadScope` foundation and the fixed-shape `ReadContext` contract, but it did **not** prove that adding `scope` as a sixth parameter to every handler is the cleanest long-term handler API — **confirmed architectural caution**.

## Architecture Check

1. This ticket must treat handler-signature expansion as a design decision to re-justify during implementation, not as a foregone conclusion. The cleaner outcome may still be to keep the mutable scope local to dispatch/eval boundaries if that avoids widening every handler interface.
2. If the implementation does widen the handler signature, it must do so because that option is measurably cleaner than localized helper updates, not just because the spec sequence originally assumed it.
3. Game-agnostic: scope carries the same engine-internal context as before, just reused instead of recreated.
4. No backwards-compatibility: `mergeToEvalContext`/`mergeToReadContext` calls are removed from migrated handlers. They remain available (temporarily) for handlers migrated in ticket 004.

## Architectural Note

Before changing `effect-registry.ts`, re-evaluate whether the ideal architecture is:

1. A widened handler contract that passes `scope` into every handler.
2. A dispatch-local eval helper layer that reuses one mutable scope without widening every handler signature.
3. A mixed approach where only the hot handlers that truly benefit receive `scope`.

Default recommendation: prefer the narrowest interface expansion that still removes the hot-path allocations cleanly.

## What to Change

### 1. Reassess the handler-boundary design before editing `effect-registry.ts`

Choose the narrowest clean architecture that removes the hot-path bridge allocations. Do **not** assume upfront that all handlers must receive `scope`.

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

### 8. If the chosen design widens handler signatures, update remaining handler files consistently

`effects-choice.ts`, `effects-control.ts`, `effects-subset.ts`, `effects-token.ts`, `effects-turn-flow.ts` — only accept a new `scope` parameter if step 1 concludes that widening the handler contract is the cleanest design. Otherwise, keep those signatures unchanged and localize the reuse strategy.

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

1. The chosen dispatch/eval architecture is explicitly justified in the implementation notes, especially if it widens the handler contract.
2. `applyEffectsWithBudgetState` creates exactly ONE `MutableReadScope` per invocation and calls `updateReadScope` before each handler dispatch.
3. Migrated handlers (binding, var, resource, reveal) do NOT import or call `mergeToEvalContext`/`mergeToReadContext`.
4. If non-migrated handlers receive `scope`, that temporary widening is intentional and documented; otherwise their signatures remain unchanged.
5. External contract unchanged: `applyMove(state) -> newState` remains immutable.
6. Scope does not escape handler calls or dispatch-local helper boundaries (no storing in closures, return values, or result objects).

## Test Plan

### New/Modified Tests

1. No new test files required — existing tests exercise all handler paths via `applyEffects`/`applyMove`. The change is internal plumbing.
2. If test helpers in `effect-context-test-helpers.ts` construct handler calls directly, they must be updated to pass a scope argument.

### Commands

1. `pnpm -F @ludoforge/engine test` (full engine suite — covers all effect handlers)
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/src/kernel/effects-binding.ts packages/engine/src/kernel/effects-var.ts packages/engine/src/kernel/effects-resource.ts packages/engine/src/kernel/effects-reveal.ts` — must return zero matches.

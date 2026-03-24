# 79COMEFFPATRED-004: Rebuild `createFallbackFragment` with lightweight bridging

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel compiled effect fallback path
**Deps**: 79COMEFFPATRED-002, 79COMEFFPATRED-003

## Problem

`createFallbackFragment` currently wraps non-compilable effects via
`createCompiledExecutionContext` (reconstructs a full `ExecutionEffectContext`)
plus `normalizeFragmentResult`. For the 26-42% of effects that fall through to
the interpreter, this **adds** overhead versus running the interpreter directly.

This ticket replaces the fallback's bridging with the lightweight
`buildEffectEnvFromCompiledCtx` helper (from 79COMEFFPATRED-002) and builds an
`EffectCursor` directly, calling `applyEffectsWithBudgetState` without
intermediate objects.

## Assumption Reassessment (2026-03-24)

1. `createFallbackFragment` is in `effect-compiler.ts` — **confirmed**.
2. It currently calls `createCompiledExecutionContext` from `effect-compiler-runtime.ts` — **confirmed**.
3. `applyEffectsWithBudgetState` is exported from `effect-dispatch.ts` — **confirmed**.
4. `EffectCursor` has fields: `state`, `rng`, `bindings`, `decisionScope`, `effectPath`, and `tracker` — **must verify** exact shape at implementation time.
5. `normalizeFragmentResult` is still present after 79COMEFFPATRED-003 (003 removed its use from `composeFragments` but retained it for `createFallbackFragment`). **This ticket must delete it** after inlining the fallback logic.
6. `applyEffectsWithBudgetState` creates its own `MutableGameState` + `DraftTracker` at entry — nested mutable scope is safe (per spec design note).

## Architecture Check

1. Direct `EffectEnv` + `EffectCursor` construction eliminates the intermediate
   `ExecutionEffectContext` object, matching the interpreter's entry point.
2. Nested mutable scopes (fallback creates its own tracker inside
   `applyEffectsWithBudgetState`) are safe — copy-on-write nesting is correct.
   Sharing the parent tracker is a future optimization.
3. No backwards-compatibility shim — the old path is replaced, not wrapped.

## What to Change

### 1. Rewrite `createFallbackFragment` execute function

Replace:
```typescript
// OLD
const execCtx = createCompiledExecutionContext(state, rng, bindings, ctx);
const result = ctx.fallbackApplyEffects(effects, execCtx);
return normalizeFragmentResult(result, bindings, ctx.decisionScope);
```

With:
```typescript
// NEW
const env = buildEffectEnvFromCompiledCtx(ctx);
const cursor: EffectCursor = {
  state,
  rng,
  bindings,
  decisionScope: ctx.decisionScope,
  effectPath: ctx.effectPath,
  tracker: ctx.tracker,
};
const budget = createEffectBudgetState(env);
return applyEffectsWithBudgetState(effects, env, cursor, budget);
```

### 2. Update imports

- Add: `buildEffectEnvFromCompiledCtx` from `./effect-compiler-runtime.js`
- Add: `applyEffectsWithBudgetState`, `createEffectBudgetState` from `./effect-dispatch.js`
- Add: `EffectCursor` type from `./effect-context.js`
- Remove: `createCompiledExecutionContext` import (if no longer used in this file)
- Remove: `normalizeFragmentResult` reference (already deleted in 003)

### 3. Remove `fallbackApplyEffects` usage

If `createFallbackFragment` was the only consumer of `ctx.fallbackApplyEffects`
in `effect-compiler.ts`, note this for the dead-code ticket (79COMEFFPATRED-006).
Do NOT remove the field from `CompiledEffectContext` in this ticket — that
happens in 006 after all consumers are verified.

### 4. Update tests

Update fallback fragment tests to verify the new bridging path produces
identical results. Test that fallback fragments work correctly when composed
with compiled fragments (integration within `composeFragments`).

## Files to Touch

- `packages/engine/src/kernel/effect-compiler.ts` (modify — rewrite `createFallbackFragment`)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify — update fallback tests)

## Out of Scope

- Deleting `createCompiledExecutionContext` — deferred to 79COMEFFPATRED-006.
- Removing `fallbackApplyEffects` from `CompiledEffectContext` — deferred to 79COMEFFPATRED-006.
- Sharing the parent tracker with fallback fragments — future optimization per spec.
- `effect-compiler-codegen.ts` — deferred to 79COMEFFPATRED-005.
- `phase-lifecycle.ts` — no changes.
- `state-draft.ts`, `effect-dispatch.ts` — read only.
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: fallback fragment executes non-compilable effects and returns correct `EffectResult`.
2. Unit test: fallback fragment works within `composeFragments` — mixed compiled + fallback fragments produce correct output.
3. Unit test: fallback fragment receives `tracker` from `composeFragments` context.
4. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
5. `pnpm -F @ludoforge/engine test:e2e` — E2E parity tests pass (compiled path === interpreted path).
6. `pnpm turbo typecheck` — no type errors.
7. `pnpm turbo lint` — no lint violations.

### Invariants

1. Compiled path produces bit-identical results to the interpreter (Zobrist hash match).
2. `applyEffectsWithBudgetState` creates its own nested mutable scope — no state leak.
3. Effect budget is enforced in fallback fragments (budget creation + consumption).
4. `emittedEvents` from fallback fragments are correctly accumulated by `composeFragments`.
5. `pendingChoice` from fallback fragments triggers early return in `composeFragments`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — fallback fragment bridging, mixed composition, tracker threading.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

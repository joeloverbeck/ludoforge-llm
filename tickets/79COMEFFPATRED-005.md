# 79COMEFFPATRED-005: Make codegen fragments draft-aware

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel compiled effect codegen
**Deps**: 79COMEFFPATRED-001, 79COMEFFPATRED-002

## Problem

The codegen functions (`compileSetVar`, `compileAddVar`) and the
`executeEffectList` fallback path in `effect-compiler-codegen.ts` do not use the
`DraftTracker` from the compiled context. They either:

- Call `writeScopedVarsToState` (immutable — allocates a new state object) even
  when a tracker is available, or
- Use `createCompiledExecutionContext` + `ctx.fallbackApplyEffects` for the
  `executeEffectList` fallback instead of the lightweight
  `buildEffectEnvFromCompiledCtx` + `applyEffectsWithBudgetState` path.

This ticket makes codegen fragments draft-aware so they benefit from the mutable
scope created by `composeFragments` (79COMEFFPATRED-003).

## Assumption Reassessment (2026-03-24)

1. `compileSetVar` and `compileAddVar` are in `effect-compiler-codegen.ts` — **confirmed**.
2. They currently use `writeScopedVarsMutable` with tracker from `ctx.effectBudget.tracker` — **must verify** exact current usage pattern. The spec says to use `ctx.tracker` (the new field from 001).
3. `executeEffectList` exists in `effect-compiler-codegen.ts` as an internal fallback — **confirmed**.
4. `writeScopedVarsMutable` is exported from `scoped-var-runtime-access.ts` — **confirmed**.
5. `buildEffectEnvFromCompiledCtx` is added by 79COMEFFPATRED-002 — **confirmed by dependency**.

## Architecture Check

1. When `ctx.tracker` is present, codegen fragments use `writeScopedVarsMutable`
   for in-place mutation — returning the same `state` reference (mutated).
2. When `ctx.tracker` is absent (defensive), fall back to immutable
   `writeScopedVarsToState` — backwards compatible.
3. The `executeEffectList` fallback mirrors the pattern from 79COMEFFPATRED-004
   (direct `EffectEnv` + `EffectCursor` + `applyEffectsWithBudgetState`).

## What to Change

### 1. Update `compileSetVar` and `compileAddVar` to prefer `ctx.tracker`

Currently these functions may already use a tracker from `ctx.effectBudget`.
Update them to prefer `ctx.tracker` (the new context field) when present:

```typescript
const tracker = ctx.tracker;
if (tracker) {
  writeScopedVarsMutable(state as MutableGameState, writes, tracker);
  return { state, rng, emittedEvents: [...], bindings };
} else {
  const newState = writeScopedVarsToState(state, writes);
  return { state: newState, rng, emittedEvents: [...], bindings };
}
```

**Important**: Verify the exact current implementation at implementation time.
The tracker source may already be `ctx.tracker` if a previous ticket introduced
it, or it may be threaded differently. Adapt accordingly.

### 2. Update `executeEffectList` fallback path

Replace:
```typescript
// OLD
const execCtx = createCompiledExecutionContext(state, rng, bindings, ctx);
return ctx.fallbackApplyEffects(effects, execCtx);
```

With:
```typescript
// NEW
const env = buildEffectEnvFromCompiledCtx(ctx);
const cursor: EffectCursor = {
  state, rng, bindings,
  decisionScope: ctx.decisionScope,
  effectPath: ctx.effectPath,
  tracker: ctx.tracker,
};
const budget = createEffectBudgetState(env);
return applyEffectsWithBudgetState(effects, env, cursor, budget);
```

### 3. Update imports

- Add: `buildEffectEnvFromCompiledCtx` from `./effect-compiler-runtime.js`
- Add: `applyEffectsWithBudgetState`, `createEffectBudgetState` from `./effect-dispatch.js` (if not already imported)
- Add: `EffectCursor` type from `./effect-context.js` (if not already imported)
- Remove: `createCompiledExecutionContext` import (if no longer used in this file)

### 4. Update codegen tests

Test that `compileSetVar` and `compileAddVar` use `writeScopedVarsMutable` when
`ctx.tracker` is present, and `writeScopedVarsToState` when absent. Test that
`executeEffectList` produces correct results via the new fallback path.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)

## Out of Scope

- `effect-compiler.ts` — already done in 79COMEFFPATRED-003 and 004.
- `effect-compiler-runtime.ts` — already done in 79COMEFFPATRED-002.
- Deleting `createCompiledExecutionContext` — deferred to 79COMEFFPATRED-006.
- Removing `fallbackApplyEffects` from context — deferred to 79COMEFFPATRED-006.
- `phase-lifecycle.ts` — no changes.
- `state-draft.ts`, `effect-dispatch.ts` — read only.
- `emitVarChangeArtifacts` optimization — future follow-up per spec risks section.
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `compileSetVar` with `ctx.tracker` present uses `writeScopedVarsMutable` and returns same state reference.
2. Unit test: `compileSetVar` without `ctx.tracker` uses `writeScopedVarsToState` and returns new state reference.
3. Unit test: `compileAddVar` with `ctx.tracker` present uses `writeScopedVarsMutable` and returns same state reference.
4. Unit test: `compileAddVar` without `ctx.tracker` uses `writeScopedVarsToState` and returns new state reference.
5. Unit test: `executeEffectList` fallback produces correct `EffectResult` via `applyEffectsWithBudgetState`.
6. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
7. `pnpm -F @ludoforge/engine test:e2e` — E2E parity tests pass.
8. `pnpm turbo typecheck` — no type errors.
9. `pnpm turbo lint` — no lint violations.

### Invariants

1. Compiled path produces bit-identical results to the interpreter.
2. When tracker is present, `compileSetVar`/`compileAddVar` mutate in-place — no new state object allocated.
3. When tracker is absent, behavior is unchanged from pre-ticket (immutable path).
4. Effect budget enforcement is preserved in `executeEffectList` fallback.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — draft-aware setVar/addVar, executeEffectList fallback.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

# 79COMEFFPATRED-002: Add `buildEffectEnvFromCompiledCtx` helper

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel runtime helper
**Deps**: 79COMEFFPATRED-001

## Problem

The compiled path's fallback mechanism uses `createCompiledExecutionContext` to
reconstruct a full `ExecutionEffectContext` from `CompiledEffectContext` fields.
This is heavyweight — the interpreter only needs an `EffectEnv` (the ~12 static
fields) plus a small `EffectCursor`. A direct `CompiledEffectContext → EffectEnv`
mapper eliminates the intermediate `ExecutionEffectContext` object entirely.

This ticket adds the new helper **alongside** the old one. The old function is
not deleted yet (that happens in 79COMEFFPATRED-006 after all consumers migrate).

## Assumption Reassessment (2026-03-24)

1. `EffectEnv` is defined in `effect-context.ts` — **verified**. 21 fields total (12 required, 9 optional).
2. `CompiledEffectContext` does NOT carry all fields needed for `EffectEnv`. Three required `EffectEnv` fields are absent from `CompiledEffectContext`: `collector`, `decisionAuthority`, `mode`. Six optional fields are also absent: `freeOperationOverlay`, `maxQueryResults`, `freeOperation`, `transientDecisionSelections`, `freeOperationProbeScope`, `chooseNTemplateCallback`. The function must accept extra parameters for the three missing required fields.
3. `createCompiledExecutionContext` lives in `effect-compiler-runtime.ts` — **confirmed** (30-line file).
4. The new helper is a pure function with no side effects — safe to add.

## Architecture Check

1. Placing the helper in `effect-compiler-runtime.ts` keeps the compiled-path
   runtime bridge code in one file.
2. This is a straightforward field-mapping function — no abstraction overhead.
3. No shim or alias — the old function remains until 79COMEFFPATRED-006.

## What to Change

### 1. Add `buildEffectEnvFromCompiledCtx` to `effect-compiler-runtime.ts`

```typescript
export function buildEffectEnvFromCompiledCtx(
  ctx: CompiledEffectContext,
  collector: ExecutionCollector,
  decisionAuthority: DecisionAuthorityStrictContext | DecisionAuthorityProbeContext,
  mode: 'execution' | 'discovery',
): EffectEnv {
  return {
    def: ctx.def,
    adjacencyGraph: ctx.adjacencyGraph,
    resources: ctx.resources,
    activePlayer: ctx.activePlayer,
    actorPlayer: ctx.actorPlayer,
    moveParams: ctx.moveParams,
    runtimeTableIndex: ctx.runtimeTableIndex,
    traceContext: ctx.traceContext,
    maxEffectOps: ctx.maxEffectOps,
    verifyCompiledEffects: ctx.verifyCompiledEffects,
    phaseTransitionBudget: ctx.phaseTransitionBudget,
    profiler: ctx.profiler,
    cachedRuntime: ctx.cachedRuntime,
    collector,
    decisionAuthority,
    mode,
  };
}
```

**Note**: `CompiledEffectContext` is missing three required `EffectEnv` fields
(`collector`, `decisionAuthority`, `mode`) and six optional fields
(`freeOperationOverlay`, `maxQueryResults`, `freeOperation`,
`transientDecisionSelections`, `freeOperationProbeScope`,
`chooseNTemplateCallback`). The three required fields are passed as explicit
parameters. The six optional fields default to `undefined` (omitted from the
object literal).

### 2. Add unit test for the new helper

Verify that given a `CompiledEffectContext` with known values, the returned
`EffectEnv` contains exactly the expected static fields.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-runtime.ts` (modify — add function)
- `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` (new or modify)

## Out of Scope

- Deleting `createCompiledExecutionContext` — deferred to 79COMEFFPATRED-006.
- Changing any consumers of `createCompiledExecutionContext` — deferred to 79COMEFFPATRED-003 and 004.
- `effect-compiler.ts`, `effect-compiler-codegen.ts` — no changes in this ticket.
- `effect-context.ts` — read only (import `EffectEnv` type).
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `buildEffectEnvFromCompiledCtx` maps all `EffectEnv` fields correctly from a `CompiledEffectContext`.
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
3. `pnpm turbo typecheck` — no type errors.
4. `pnpm turbo lint` — no lint violations.

### Invariants

1. `createCompiledExecutionContext` is NOT deleted or modified — existing consumers unaffected.
2. `buildEffectEnvFromCompiledCtx` is a pure function — no side effects, no state.
3. The returned `EffectEnv` satisfies the `EffectEnv` type (all required fields present).
4. No runtime behavior change — no existing code path is modified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` — test `buildEffectEnvFromCompiledCtx` field mapping.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-24
- **What changed**:
  - Added `buildEffectEnvFromCompiledCtx` to `packages/engine/src/kernel/effect-compiler-runtime.ts`
  - Created `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` (4 test cases)
- **Deviations from original plan**: The ticket assumed `CompiledEffectContext` carried `collector`, `decisionAuthority`, and `mode` — it does not. The function signature was corrected to accept these three as explicit parameters. Optional fields use conditional spreads to satisfy `exactOptionalPropertyTypes`.
- **Verification**: 4674 engine tests pass, typecheck clean, lint clean.

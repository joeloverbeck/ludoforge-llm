# 74COMEFFSEQ-005: Compiled Effect Cache and Runtime Integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — gamedef-runtime.ts, phase-lifecycle.ts
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-004

## Problem

The compiled effect sequences must be stored on `GameDefRuntime` (computed once at game load) and consumed by `dispatchLifecycleEvent` when executing phase onEnter/onExit effects. This ticket connects the compiler output to the hot path.

## Assumption Reassessment (2026-03-21)

1. `createGameDefRuntime(def)` in `gamedef-runtime.ts` constructs the runtime. This is the place to call `compileAllLifecycleEffects`. Confirmed.
2. `dispatchLifecycleEvent` in `phase-lifecycle.ts` resolves lifecycle effects via `resolveLifecycleEffects` then calls `applyEffects`. Lines 50-69. Confirmed.
3. `dispatchLifecycleEvent` receives `cachedRuntime?: GameDefRuntime` — the compiled map will be available through this parameter. Confirmed.
4. `EffectResult` is the return type from both `applyEffects` and the compiled path. Confirmed.
5. The profiler already instruments `lifecycle:applyEffects` (line 69). The compiled path should use a distinct profiler key.
6. Follow-up from completed `74COMEFFSEQ-004`: the current orchestrator preserves interpreter fallback semantics, but full effect-operation budget parity is still unresolved because `CompiledEffectContext` does not carry the interpreter's `maxEffectOps` budget state. This ticket owns that gap, since budget parity only matters once compiled sequences are wired into the live lifecycle path.

## Architecture Check

1. `createGameDefRuntime` is the natural home for eager compilation — it already pre-computes adjacency graphs and runtime table indices.
2. `dispatchLifecycleEvent` is the single entry point for lifecycle effect execution. Intercepting here guarantees full coverage.
3. The compiled path reuses the same `EffectResult` contract — downstream trigger dispatch, trace emission, and state threading are unchanged.
4. No backwards-compatibility shims: if `compiledLifecycleEffects` is undefined (e.g., compilation disabled), the existing interpreter path runs unchanged.
5. Architectural follow-up from 74COMEFFSEQ-003: `phase-lifecycle.ts` must not open-code yet another partial execution-context shape for the compiled path. Reuse the shared compiled-to-execution context adapter established by the compiler work so `CompiledEffectContext` stays aligned with `EffectContext` semantics instead of drifting further.
6. Budget enforcement must remain a single runtime contract. The compiled path must not bypass `maxEffectOps` or implement a second incompatible budget model. If the current compiled contract is insufficient, extend it cleanly here and update all compiled execution sites in the same change.

## What to Change

### 1. Extend `createGameDefRuntime`

Modify `gamedef-runtime.ts`:
- Import `compileAllLifecycleEffects` from `effect-compiler.ts`.
- Call it after building the existing runtime structures.
- Store the result in the new `compiledLifecycleEffects` field.

```typescript
export function createGameDefRuntime(def: GameDef): GameDefRuntime {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  return {
    adjacencyGraph,
    runtimeTableIndex,
    zobristTable: createZobristTable(def),
    ruleCardCache: new Map(),
    compiledLifecycleEffects: compileAllLifecycleEffects(def, { adjacencyGraph, runtimeTableIndex } as GameDefRuntime),
  };
}
```

Note: The partial runtime passed to `compileAllLifecycleEffects` must be sufficient for compilation. The compiler needs `adjacencyGraph` and `runtimeTableIndex` but not `zobristTable` or `ruleCardCache`.

### 2. Modify `dispatchLifecycleEvent` to use compiled path

In `phase-lifecycle.ts`, after resolving lifecycle effects, check for a compiled version:

```typescript
const compiledKey = `${event.phase}:${event.type === 'phaseEnter' ? 'onEnter' : 'onExit'}`;
const compiledSeq = cachedRuntime?.compiledLifecycleEffects?.get(compiledKey);

if (compiledSeq !== undefined) {
  // Use compiled path
  const t0_apply = perfStart(profiler);
  const effectResult = compiledSeq.execute(currentState, currentRng, {}, {
    def,
    adjacencyGraph,
    runtimeTableIndex,
    resources: runtimeResources,
    activePlayer: currentState.activePlayer,
    actorPlayer: currentState.activePlayer,
    moveParams: {},
    fallbackApplyEffects: applyEffects,
    traceContext: { eventContext: 'lifecycleEffect', effectPathRoot: `${effectPathRoot}.effects` },
    ...(policy?.phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget: policy.phaseTransitionBudget }),
  });
  perfDynEnd(profiler, 'lifecycle:applyEffects:compiled', t0_apply);
  // ... continue with trigger dispatch as before
} else {
  // Existing interpreter path (unchanged)
}
```

Note: if 74COMEFFSEQ-004 introduces a helper for building compiled execution context, use it here rather than duplicating this object shape inline.

### 3. Preserve effect-operation budget semantics

Before enabling the compiled branch in production runtime:

- Reassess how `applyEffects` enforces `maxEffectOps` through the interpreter budget state.
- Extend the compiled execution contract as needed so lifecycle execution with compiled effects cannot exceed the same operation budget that the interpreter would enforce.
- Keep this as one architectural contract, not dual accounting. Either compiled sequencing consumes the same shared budget state, or compiled lifecycle dispatch must be wrapped so the budget boundary is still enforced with equivalent semantics.
- Add targeted tests that force lifecycle execution near the budget limit and prove that compiled and interpreted paths fail or succeed identically.

### 4. Add compiled path profiler bucket

The compiled path uses `'lifecycle:applyEffects:compiled'` as its profiler key so performance can be compared to the interpreter key `'lifecycle:applyEffects'`.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — call compiler in createGameDefRuntime)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify — add compiled path branch in dispatchLifecycleEvent)

## Out of Scope

- The compiler itself (74COMEFFSEQ-002, 003, 004) — this ticket only wires it in
- Debug verification mode (74COMEFFSEQ-006) — the dual-path comparison is a separate concern
- Action effect compilation — this ticket covers lifecycle effects only (onEnter/onExit)
- Modifying any effect handler
- Modifying `applyEffects` or `effect-dispatch.ts`
- Benchmarking (74COMEFFSEQ-007)

## Acceptance Criteria

### Tests That Must Pass

1. `createGameDefRuntime(texasHoldemDef)` produces a runtime with a non-empty `compiledLifecycleEffects` map.
2. `createGameDefRuntime(fitlDef)` produces a runtime with a non-empty `compiledLifecycleEffects` map.
3. `createGameDefRuntime` for a GameDef with no lifecycle effects produces an empty map.
4. `dispatchLifecycleEvent` with a cached runtime containing compiled effects uses the compiled path (verified via profiler bucket `lifecycle:applyEffects:compiled` having non-zero count).
5. `dispatchLifecycleEvent` without a cached runtime falls back to the interpreter path (existing behavior unchanged).
6. Compiled lifecycle execution respects the same `maxEffectOps` boundary as interpreted lifecycle execution for both success and failure cases.
7. Full Texas Hold'em simulation with compiled effects produces identical final state hash to simulation without compiled effects.
8. Full FITL simulation (if lifecycle effects exist) produces identical final state hash.
9. Existing suite: `pnpm -F @ludoforge/engine test`
10. Existing e2e suite: `pnpm -F @ludoforge/engine test:e2e`

### Invariants

1. **Determinism**: Compiled path produces bit-identical state to interpreter path for all games (Foundation 5).
2. **Backwards compatibility**: If `compiledLifecycleEffects` is undefined, behavior is identical to pre-change.
3. **Trigger dispatch unchanged**: Emitted events from the compiled path are dispatched identically to the interpreter path.
4. **Budget parity**: Compiled lifecycle execution cannot bypass, weaken, or double-count the interpreter's effect-operation budget contract.
5. **No performance regression in compilation**: `createGameDefRuntime` should not add more than 50ms to startup time.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiled-cache.test.ts` — tests that `createGameDefRuntime` populates the compiled map correctly.
2. `packages/engine/test/integration/compiled-lifecycle-dispatch.test.ts` — tests that `dispatchLifecycleEvent` uses the compiled path, preserves lifecycle semantics, and enforces the same effect budget limits as the interpreter.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiled-cache.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/compiled-lifecycle-dispatch.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo typecheck`

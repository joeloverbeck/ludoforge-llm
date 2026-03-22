# 74COMEFFSEQ-005: Compiled Lifecycle Cache and Runtime Dispatch Integration

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — runtime cache population, lifecycle dispatch integration, compiled context parity
**Deps**: archive/tickets/74COMEFFSEQ/74COMEFFSEQ-001-types-and-interfaces.md, archive/tickets/74COMEFFSEQ/74COMEFFSEQ-004-compiler-core.md, specs/74-compiled-effect-sequences.md

## Problem

The codebase already has the compiled-effect compiler stack:

- `effect-compiler.ts` bulk-compiles non-empty phase `onEnter` / `onExit` effect sequences.
- `effect-compiler-runtime.ts` adapts compiled execution into the interpreter runtime context.
- `GameDefRuntime` already exposes `compiledLifecycleEffects`.

What is still missing is the actual runtime integration:

- `createGameDefRuntime` leaves `compiledLifecycleEffects` empty.
- `dispatchLifecycleEvent` always interprets lifecycle effects and never consults the cache.
- `CompiledEffectContext` does not yet carry the interpreter's `maxEffectOps` / profiler fields, so compiled execution cannot currently preserve the same execution contract as interpreted execution.

Until those gaps are closed, compiled lifecycle effects exist only as isolated unit-tested infrastructure and provide no production benefit.

## Assumption Reassessment (2026-03-22)

1. `GameDefRuntime.compiledLifecycleEffects` already exists in [packages/engine/src/kernel/gamedef-runtime.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/gamedef-runtime.ts). This ticket must populate that existing field, not introduce a new cache shape.
2. `compileAllLifecycleEffects(def)` already exists in [packages/engine/src/kernel/effect-compiler.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-compiler.ts). The ticket’s older wording that implied adding this compiler step from scratch is outdated.
3. `dispatchLifecycleEvent` in [packages/engine/src/kernel/phase-lifecycle.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/phase-lifecycle.ts) still resolves lifecycle effects and calls `applyEffects` directly. This is the real integration point.
4. `dispatchLifecycleEvent` only executes phase `onEnter` / `onExit` effects. `turnStart` and `turnEnd` events emit trace and trigger dispatch, but they do not have phase lifecycle arrays to compile.
5. The shared compiled-to-interpreter adapter already exists in [packages/engine/src/kernel/effect-compiler-runtime.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-compiler-runtime.ts). The runtime integration should reuse and extend that adapter rather than open-coding a second partial execution-context shape in `phase-lifecycle.ts`.
6. The current compiled contract does not include `maxEffectOps` or `profiler`, while `applyEffects` enforces budget and per-effect instrumentation through `EffectContext`. Runtime integration must close that gap in the shared contract instead of accepting semantic drift.
7. Current production coverage is asymmetric: Texas Hold'em has phase lifecycle effects, while the current FITL production `GameDef` has zero non-empty phase `onEnter` / `onExit` arrays. The ticket must not require nonexistent FITL compiled cache entries.
8. Existing unit tests already cover compiler orchestration and types. This ticket should update those tests where assumptions changed and add focused lifecycle integration tests rather than duplicate compiler-core coverage.

## Architecture Check

1. Wiring compiled lifecycle execution into the runtime is beneficial only if it preserves one execution contract. A faster path that bypasses budget enforcement or profiler threading would be a regression in architecture, not an improvement.
2. The clean design is to keep the compiler as a pure optimization layer and make the runtime decide between compiled and interpreted execution at one choke point: `dispatchLifecycleEvent`.
3. The compiled path should reuse the same context construction semantics as the interpreter. If the shared adapter is missing fields, extend the adapter and compiled context types there once, then use that path everywhere.
4. Runtime creation is the right place for eager lifecycle compilation. `createGameDefRuntime` already owns immutable precomputed execution data, so compiled lifecycle sequences belong there with adjacency graphs and runtime table indices.
5. The ticket should not require broad architectural rewrites or full-file rewrites. The ideal architecture here is small and explicit: one populated cache, one dispatch branch, one shared execution contract, and proof through targeted tests.

## What to Change

### 1. Populate the existing lifecycle cache in `createGameDefRuntime`

Modify [packages/engine/src/kernel/gamedef-runtime.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/gamedef-runtime.ts):

- import `compileAllLifecycleEffects`
- populate `compiledLifecycleEffects` during runtime creation
- keep the runtime object immutable aside from the existing lazy `ruleCardCache`

Do not add a parallel cache field or a lazy-on-first-dispatch compilation path.

### 2. Route lifecycle execution through the compiled cache when present

Modify [packages/engine/src/kernel/phase-lifecycle.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/phase-lifecycle.ts):

- resolve the canonical lifecycle key with `makeCompiledLifecycleEffectKey`
- if `cachedRuntime?.compiledLifecycleEffects` contains a compiled sequence for the current phase `onEnter` / `onExit`, execute it
- otherwise use the existing interpreter path
- keep downstream emitted-event trigger dispatch exactly the same

The compiled branch must remain inside `dispatchLifecycleEvent`; do not introduce a second lifecycle-execution entry point.

### 3. Extend the shared compiled execution contract for budget and profiler parity

Modify the shared compiled runtime contract so compiled execution can preserve the same runtime semantics as interpreted execution:

- add `maxEffectOps?: number` to `CompiledEffectContext`
- add `profiler?: PerfProfiler` to `CompiledEffectContext`
- thread both through `createCompiledExecutionContext`
- ensure fallback subtrees and compiled fragments observe the same effect budget boundary and profiler plumbing that interpreter execution would

This is the architectural core of the ticket. Do not implement a separate compiled-only budget model.

### 4. Add a distinct profiler bucket for compiled lifecycle application

The compiled lifecycle branch should use `lifecycle:applyEffects:compiled`, while the interpreter branch keeps `lifecycle:applyEffects`. This preserves apples-to-apples performance visibility without changing behavior.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts`
- `packages/engine/src/kernel/phase-lifecycle.ts`
- `packages/engine/src/kernel/effect-compiler-types.ts`
- `packages/engine/src/kernel/effect-compiler-runtime.ts`
- tests that validate the changed runtime contract and lifecycle integration

## Out of Scope

- New effect-family compiler support
- Action effect compilation
- Debug dual-path verification mode
- Benchmark targets / startup-time performance budgets
- Changing individual effect handlers
- Replacing the closure-based compiler architecture with code-string generation or a second execution pipeline

## Acceptance Criteria

### Tests That Must Pass

1. `createGameDefRuntime` populates `compiledLifecycleEffects` for a definition with non-empty lifecycle effects.
2. `createGameDefRuntime` leaves `compiledLifecycleEffects` empty for a definition with no lifecycle effects.
3. Production Texas Hold'em produces a non-empty lifecycle cache, while the current FITL production definition still produces an empty cache because it has no phase lifecycle effects.
4. `dispatchLifecycleEvent` uses the compiled path when a matching compiled sequence is available and records `lifecycle:applyEffects:compiled`.
5. `dispatchLifecycleEvent` still uses the interpreter path when no cached runtime is supplied.
6. Compiled lifecycle execution preserves state/rng/emitted-event parity with the interpreter for a representative lifecycle sequence.
7. Compiled lifecycle execution respects the same `maxEffectOps` boundary as interpreted execution for both pass and fail cases.
8. Existing suite: `pnpm -F @ludoforge/engine test`
9. Existing e2e suite: `pnpm -F @ludoforge/engine test:e2e`
10. `pnpm turbo lint`
11. `pnpm turbo typecheck`

### Invariants

1. **Single execution contract**: compiled lifecycle execution cannot bypass interpreter budget enforcement or omit interpreter-only runtime fields.
2. **Determinism**: compiled lifecycle execution produces the same state and RNG results as interpreted lifecycle execution for the same definition, state, and seed.
3. **No semantic fork**: trigger dispatch after lifecycle execution remains identical regardless of whether the lifecycle effects were compiled or interpreted.
4. **No duplicate runtime model**: context adaptation logic remains centralized in the shared compiled runtime adapter.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — update runtime-cache expectations now that `createGameDefRuntime` should eagerly populate the existing lifecycle cache when effects exist and stay empty when none exist.
2. `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` — add focused runtime integration coverage for current production lifecycle coverage (Texas non-empty, FITL empty), compiled dispatch selection, interpreter fallback, profiler bucket usage, representative parity, and `maxEffectOps` parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler-types.test.ts`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/compiled-lifecycle-runtime.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`

## Outcome

Completed: 2026-03-22

What actually changed:

- `createGameDefRuntime` now eagerly populates the existing `compiledLifecycleEffects` cache with `compileAllLifecycleEffects(def)`.
- `dispatchLifecycleEvent` now selects the compiled lifecycle sequence when a cached runtime provides one, while preserving the existing interpreter path when no cache is supplied.
- The lifecycle runtime now records `lifecycle:applyEffects:compiled` for the compiled branch and threads the profiler through the interpreter lifecycle path too.
- `CompiledEffectContext` and `createCompiledExecutionContext` now carry `maxEffectOps` and `profiler`.
- The budget-parity gap was deeper than the original ticket wording implied: fully compiled nodes bypassed the interpreter's effect counter. To keep one execution contract, budget state was centralized so compiled nodes and interpreter fallback consume the same shared budget instead of maintaining dual accounting.
- Focused tests were added/updated for eager cache population, current production coverage (Texas non-empty, FITL empty), compiled lifecycle dispatch selection, interpreter fallback, representative parity, and `maxEffectOps` parity.

Deviations from original plan:

- The ticket was corrected to reflect that the compiler stack and shared adapter already existed; the missing work was runtime integration plus contract parity.
- The original assumption that FITL production should produce compiled lifecycle entries was wrong. Current FITL production has no phase lifecycle effects, so the verified scope is Texas non-empty / FITL empty.
- Achieving real budget parity required touching shared budget plumbing in `effect-dispatch.ts` and compiled codegen/orchestration, not only the runtime integration files originally named.

Verification results:

- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine test:e2e`
- `pnpm turbo lint`
- `pnpm turbo typecheck`

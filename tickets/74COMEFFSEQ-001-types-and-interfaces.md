# 74COMEFFSEQ-001: Compiled Effect Sequence Types and Interfaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, GameDefRuntime interface
**Deps**: None

## Problem

The compiled effect sequences feature needs well-defined types before any implementation can begin. The `CompiledEffectSequence` interface, the `GameDefRuntime` extension, and supporting types must be established as the contract for all subsequent tickets.

## Assumption Reassessment (2026-03-21)

1. `GameDefRuntime` is defined in `packages/engine/src/kernel/gamedef-runtime.ts` with 4 fields (adjacencyGraph, runtimeTableIndex, zobristTable, ruleCardCache). Confirmed.
2. `EffectResult` is defined in `packages/engine/src/kernel/effect-context.ts` with fields: state, rng, emittedEvents, bindings, pendingChoice, decisionScope. Confirmed.
3. `ExecutionOptions` is in `packages/engine/src/kernel/types-core.ts` with trace/profiler flags. Confirmed — `verifyCompiledEffects` does not yet exist.
4. `Rng` type is used throughout as `{ state: bigint }`. Confirmed via effect-context.ts usage.

## Architecture Check

1. Adding a new readonly field to `GameDefRuntime` is the cleanest integration — it's the designated home for pre-computed runtime structures derived from a GameDef.
2. `CompiledEffectSequence` is game-agnostic — it compiles based on AST node types, not game-specific knowledge (Foundation 1).
3. No backwards-compatibility shims: the new field is optional at first (undefined = no compiled effects available), so existing consumers are unaffected.

## What to Change

### 1. Define `CompiledEffectSequence` interface

In a new file `packages/engine/src/kernel/effect-compiler-types.ts`:

```typescript
export interface CompiledEffectSequence {
  readonly phaseId: string;
  readonly lifecycle: 'onEnter' | 'onExit';
  readonly execute: CompiledEffectFn;
  readonly coverageRatio: number; // 0.0–1.0: fraction of AST nodes compiled
}

export type CompiledEffectFn = (
  state: GameState,
  rng: Rng,
  bindings: Readonly<Record<string, unknown>>,
  ctx: CompiledEffectContext,
) => EffectResult;

export interface CompiledEffectContext {
  readonly def: GameDef;
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly resources: EvalRuntimeResources;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
  readonly moveParams: Record<string, MoveParamValue>;
  readonly fallbackApplyEffects: (effects: readonly EffectAST[], ctx: EffectContext) => EffectResult;
  readonly traceContext?: { eventContext: string; effectPathRoot: string };
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
}
```

### 2. Extend `GameDefRuntime` interface

Add the optional `compiledLifecycleEffects` field:

```typescript
readonly compiledLifecycleEffects?: ReadonlyMap<string, CompiledEffectSequence>;
```

The map key is `${phaseId}:${lifecycle}` (e.g., `"flop:onEnter"`).

### 3. Add `verifyCompiledEffects` to `ExecutionOptions`

Add the boolean flag to `ExecutionOptions` in `types-core.ts`:

```typescript
readonly verifyCompiledEffects?: boolean;
```

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-types.ts` (new)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add optional field to interface)
- `packages/engine/src/kernel/types-core.ts` (modify — add flag to ExecutionOptions)

## Out of Scope

- Compiler implementation (74COMEFFSEQ-003, 004)
- Pattern matching logic (74COMEFFSEQ-002)
- Code generation (74COMEFFSEQ-003)
- Integration with `dispatchLifecycleEvent` (74COMEFFSEQ-005)
- Verification mode implementation (74COMEFFSEQ-006)
- Any effect handler changes
- Any changes to `applyEffects` or `effect-dispatch.ts`

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compilation succeeds: `pnpm -F @ludoforge/engine build`
2. All existing tests pass: `pnpm -F @ludoforge/engine test`
3. New unit test in `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — imports all exported types and verifies the key format helper (if any) works correctly.

### Invariants

1. `GameDefRuntime` remains backwards-compatible — existing code that doesn't supply `compiledLifecycleEffects` continues to work unchanged.
2. No runtime behavior changes — this ticket is types-only plus the optional field.
3. All new types use branded types where appropriate (Foundation 12).
4. `CompiledEffectFn` returns `EffectResult` (same contract as the interpreter path).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — verifies type exports are importable, key format helper if provided.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

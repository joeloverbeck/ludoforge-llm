# 74COMEFFSEQ-001: Compiled Effect Sequence Types and Interfaces

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, GameDefRuntime interface, kernel barrel export
**Deps**: None

## Problem

The compiled effect sequences feature needs a stable kernel contract before any implementation can begin. The `CompiledEffectSequence` interface, the `GameDefRuntime` extension, and supporting key/context types must be established in a way that matches the existing runtime architecture and the repo foundations.

## Assumption Reassessment (2026-03-21)

1. `GameDefRuntime` is defined in `packages/engine/src/kernel/gamedef-runtime.ts` with 4 fields (adjacencyGraph, runtimeTableIndex, zobristTable, ruleCardCache). Confirmed.
2. `EffectResult` is defined in `packages/engine/src/kernel/effect-context.ts` with fields: state, rng, emittedEvents, bindings, pendingChoice, decisionScope. Confirmed.
3. `ExecutionOptions` is in `packages/engine/src/kernel/types-core.ts` with trace/profiler flags. Confirmed — `verifyCompiledEffects` does not yet exist.
4. `Rng` is defined in `packages/engine/src/kernel/types-core.ts` as `{ state: RngState }`, and `GameState.rng` stores the underlying `RngState`. The compiled contract must preserve that split. Confirmed.
5. `dispatchLifecycleEvent` currently resolves runtime structures from `GameDefRuntime` and falls back to ad hoc construction only when no runtime is supplied. Confirmed in `packages/engine/src/kernel/phase-lifecycle.ts`.
6. `packages/engine/src/kernel/index.ts` is the public kernel barrel. Any externally consumable compiled-effect contract added by this ticket must be exported there. Confirmed.
7. The test suite contains at least one hand-built `GameDefRuntime` fixture (`packages/engine/test/unit/kernel/condition-annotator.test.ts`), so any interface change must update both the runtime factory and manual fixtures. Confirmed.

## Architecture Check

1. Adding compiled lifecycle artifacts to `GameDefRuntime` is the cleanest integration point. `GameDefRuntime` already owns immutable, precomputed runtime structures derived from `GameDef`.
2. `CompiledEffectSequence` is game-agnostic. It compiles against effect AST shapes and kernel runtime contracts, not per-game behavior (Foundation 1).
3. The ticket must not introduce a backwards-compatibility gap. Per Foundations 9 and 10, `GameDefRuntime` should gain a non-optional compiled-effects map and `createGameDefRuntime` should initialize it to an empty map until later tickets populate it.
4. The contract should avoid ad hoc string concatenation at call sites. A canonical lifecycle-key helper is cleaner and more extensible than open-coded `${phaseId}:${lifecycle}` strings.
5. `phaseId` on `CompiledEffectSequence` should use the branded `PhaseId` type rather than raw `string` (Foundation 12).

## What to Change

### 1. Define compiled-effect contract types

In a new file `packages/engine/src/kernel/effect-compiler-types.ts`:

```typescript
export type CompiledLifecycle = 'onEnter' | 'onExit';

export type CompiledLifecycleEffectKey = `${string}:${CompiledLifecycle}`;

export interface CompiledEffectSequence {
  readonly phaseId: PhaseId;
  readonly lifecycle: CompiledLifecycle;
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

export const makeCompiledLifecycleEffectKey = (
  phaseId: PhaseId,
  lifecycle: CompiledLifecycle,
): CompiledLifecycleEffectKey => `${phaseId}:${lifecycle}`;
```

### 2. Extend `GameDefRuntime` interface

Add the non-optional `compiledLifecycleEffects` field and initialize it in `createGameDefRuntime`:

```typescript
readonly compiledLifecycleEffects: ReadonlyMap<CompiledLifecycleEffectKey, CompiledEffectSequence>;
```

This stays empty in this ticket because the compiler has not been implemented yet. The map key is produced through `makeCompiledLifecycleEffectKey(phaseId, lifecycle)`.

### 3. Add `verifyCompiledEffects` to `ExecutionOptions`

Add the boolean flag to `ExecutionOptions` in `types-core.ts`:

```typescript
readonly verifyCompiledEffects?: boolean;
```

### 4. Export the new contract through the kernel barrel

Add `effect-compiler-types.ts` to `packages/engine/src/kernel/index.ts` so downstream kernel consumers and later tickets can import the canonical types from the public surface.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-types.ts` (new)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add required field to interface and initialize it)
- `packages/engine/src/kernel/types-core.ts` (modify — add flag to ExecutionOptions)
- `packages/engine/src/kernel/index.ts` (modify — export compiled-effect contract types)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify — update manual `GameDefRuntime` fixture shape)

## Out of Scope

- Compiler implementation (74COMEFFSEQ-003, 004)
- Pattern matching logic (74COMEFFSEQ-002)
- Code generation (74COMEFFSEQ-003)
- Integration with `dispatchLifecycleEvent` (74COMEFFSEQ-005)
- Verification mode implementation (74COMEFFSEQ-006)
- Any effect handler changes
- Any changes to `applyEffects` or `effect-dispatch.ts`
- Any lifecycle dispatch integration beyond exposing the runtime contract

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compilation succeeds: `pnpm -F @ludoforge/engine build`
2. All existing tests pass: `pnpm -F @ludoforge/engine test`
3. New unit test in `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` verifies:
   - `makeCompiledLifecycleEffectKey` produces the canonical key format.
   - `createGameDefRuntime(def)` initializes `compiledLifecycleEffects` to an empty map.
   - the new compiled-effect contract is re-exported through `src/kernel/index.ts`.
4. Any existing test fixture that constructs `GameDefRuntime` manually is updated to the new required shape and continues to pass.

### Invariants

1. `GameDefRuntime` becomes the single canonical runtime contract for compiled lifecycle effects; no optional aliasing or fallback property shapes are introduced.
2. No compiled execution path is introduced in this ticket. Runtime behavior remains unchanged aside from always carrying an empty compiled-effects map.
3. All new types use branded identifiers where appropriate (notably `PhaseId`) per Foundation 12.
4. `CompiledEffectFn` returns `EffectResult`, preserving the same state/rng/result contract as the interpreter path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — verifies canonical key generation, runtime initialization, and barrel export.
2. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — updated fixture only; no behavioral assertions change.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added `packages/engine/src/kernel/effect-compiler-types.ts` with the canonical compiled lifecycle contracts, including `CompiledEffectSequence`, `CompiledEffectContext`, `CompiledLifecycle`, `CompiledLifecycleEffectKey`, and `makeCompiledLifecycleEffectKey`.
  - Extended `GameDefRuntime` with a required `compiledLifecycleEffects` map and initialized it in `createGameDefRuntime`.
  - Added `verifyCompiledEffects` to `ExecutionOptions`.
  - Exported the new compiled-effect contract through `packages/engine/src/kernel/index.ts`.
  - Added `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` and updated the hand-built runtime fixture in `packages/engine/test/unit/kernel/condition-annotator.test.ts`.
- Deviations from original plan:
  - The ticket was corrected before implementation to remove the original optional `compiledLifecycleEffects` compatibility path. The final implementation uses a required empty map to match Foundations 9 and 10.
  - The final implementation also included a kernel-barrel export and a canonical key helper because those are part of the clean public contract needed by follow-on tickets.
  - A small unrelated lint cleanup was required in `packages/engine/src/agents/prepare-playable-moves.ts`, `packages/engine/src/kernel/effects-control.ts`, and `packages/engine/src/kernel/effects-var.ts` so the requested lint gate could pass.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm turbo typecheck` passed.

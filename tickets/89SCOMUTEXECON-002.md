# 89SCOMUTEXECON-002: Add MutableReadScope type and factory functions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-001-effect-context-shape-contract.md

## Problem

The kernel needs a reusable, mutable ReadContext-compatible object that can be updated in-place between effect handler calls instead of creating new 24-field objects via spread. This ticket adds the type and factory functions without wiring them into any consumers — establishing the building blocks for subsequent tickets.

## Assumption Reassessment (2026-03-28)

1. `ReadContext` interface (eval-context.ts:27-39) has 11 fields, 3 of which are optional (`runtimeTableIndex?`, `freeOperationOverlay?`, `maxQueryResults?`) — **confirmed**.
2. `EffectEnv` (effect-context.ts:188-215) carries the static fields that feed into ReadContext — **confirmed**.
3. `EffectCursor` (effect-context.ts:221-229) carries dynamic fields (state, rng, bindings, decisionScope, effectPath) — **confirmed**.
4. `resolveEffectBindings` (effect-context.ts:279-286) merges moveParams into cursor.bindings — **confirmed**, needed by `createMutableReadScope`.
5. TypeScript structural typing allows `MutableReadScope` (non-optional `| undefined` fields) to satisfy `ReadContext` (optional `?` fields) — **confirmed** by TS spec.

## Architecture Check

1. `MutableReadScope` is a strict superset of `ReadContext` from V8's perspective: all 11 properties are always present as own properties. This guarantees a single hidden class.
2. Factory functions are pure and game-agnostic — they transform EffectEnv + EffectCursor into a flat mutable object.
3. No backwards-compatibility shims. These are new additions that coexist with existing `mergeToEvalContext`/`mergeToReadContext` until ticket 004 deletes them.

## What to Change

### 1. Add `MutableReadScope` interface to `effect-context.ts`

```typescript
interface MutableReadScope {
  def: GameDef;
  adjacencyGraph: AdjacencyGraph;
  state: GameState;
  activePlayer: PlayerId;
  actorPlayer: PlayerId;
  bindings: Readonly<Record<string, unknown>>;
  resources: EvalRuntimeResources;
  runtimeTableIndex: RuntimeTableIndex | undefined;
  freeOperationOverlay: FreeOperationExecutionOverlay | undefined;
  maxQueryResults: number | undefined;
  collector: ExecutionCollector;
}
```

All 11 fields non-optional with explicit `| undefined` for V8 monomorphism.

### 2. Add `createMutableReadScope(env, cursor)` factory

Creates the scope from static EffectEnv + dynamic EffectCursor. Calls `resolveEffectBindings` for initial binding merge.

### 3. Add `updateReadScope(scope, cursor, env)` mutator

Updates `scope.state` and `scope.bindings` (with moveParams merge via `resolveEffectBindings`).

### 4. Add `updateReadScopeRaw(scope, cursor)` mutator

Updates `scope.state` and `scope.bindings` directly from cursor (no moveParams merge). For sites that currently call `mergeToReadContext`.

### 5. Export new symbols from `effect-context.ts`

Export `MutableReadScope`, `createMutableReadScope`, `updateReadScope`, `updateReadScopeRaw`.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify) — add type + 3 functions
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify) — add unit tests

## Out of Scope

- Wiring `MutableReadScope` into effect-dispatch.ts or any effects-*.ts files (ticket 003).
- Deleting `mergeToEvalContext` or `mergeToReadContext` (ticket 004).
- Changes to `ReadContext` interface, `EffectEnv`, or `EffectCursor` interfaces.
- Changes to `legal-moves.ts` (ticket 005).
- Performance benchmarking (no hot-path integration yet).

## Acceptance Criteria

### Tests That Must Pass

1. New unit tests for `createMutableReadScope`: returned object has all 11 fields as own properties; values match env/cursor inputs; bindings include moveParams merge.
2. New unit tests for `updateReadScope`: state and bindings fields updated; other fields unchanged; moveParams merged into bindings.
3. New unit tests for `updateReadScopeRaw`: state and bindings updated from cursor directly; no moveParams merge.
4. New unit test: `MutableReadScope` object satisfies `ReadContext` type (compile-time check via function that accepts `ReadContext`).
5. Existing suite: `pnpm -F @ludoforge/engine test`
6. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `MutableReadScope` always has exactly 11 own properties — no more, no fewer.
2. `createMutableReadScope` returns an object where optional ReadContext fields (`runtimeTableIndex`, `freeOperationOverlay`, `maxQueryResults`) are present as own properties even when `undefined`.
3. `updateReadScope` and `updateReadScopeRaw` mutate in-place — they return `void`, not a new object.
4. Factory functions are pure with respect to their env/cursor inputs (no mutation of inputs).
5. Determinism: same seed + same actions = identical Zobrist hash (existing determinism tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — add test block for `MutableReadScope` covering:
   - `createMutableReadScope` produces correct field values from env + cursor
   - All 11 fields are own properties (via `Object.hasOwn`)
   - `updateReadScope` mutates state and bindings with moveParams merge
   - `updateReadScopeRaw` mutates state and bindings without moveParams merge
   - Unchanged fields remain stable after update
   - Type compatibility: scope passes where `ReadContext` is expected

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "effect-context"` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

# 74COMEFFSEQ-004: Effect Compiler Core Orchestrator

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: 74COMEFFSEQ-001, 74COMEFFSEQ-002, 74COMEFFSEQ-003

## Problem

The compiler core orchestrates the full compilation pipeline: it takes a sequence of `EffectAST` nodes (e.g., a phase's `onEnter` effects), walks each node through the pattern matchers, generates compiled fragments for matches, and stitches them together into a single `CompiledEffectSequence`. Non-compilable nodes are wrapped in interpreter fallback calls.

## Assumption Reassessment (2026-03-21)

1. Phase definitions have `onEnter?: readonly EffectAST[]` and `onExit?: readonly EffectAST[]`. Confirmed via `resolveLifecycleEffects` in phase-lifecycle.ts.
2. `GameDef.phases` is iterable and each phase has an `id` field. Must verify exact structure.
3. Pattern matchers return `PatternDescriptor | null` (from 74COMEFFSEQ-002). Will be available.
4. Code generators return `CompiledEffectFragment` (from 74COMEFFSEQ-003). Will be available.
5. The fallback must call the existing `applyEffects` function from `effect-dispatch.ts`.

## Architecture Check

1. The compiler is a pure function: `compileEffectSequence(effects, def, runtime) => CompiledEffectSequence`. No side effects.
2. Fallback strategy ensures 100% correctness — any unrecognized AST node delegates to the interpreter, so the compiler is strictly an optimization (Foundation 10).
3. The compiler processes effects at `createGameDefRuntime` time (once per game load), not per-move. This amortizes compilation cost.
4. Game-agnostic: compiles based on AST node types, not game-specific identifiers (Foundation 1).

## What to Change

### 1. Create `effect-compiler.ts`

**Core function:**
```typescript
export function compileEffectSequence(
  phaseId: string,
  lifecycle: 'onEnter' | 'onExit',
  effects: readonly EffectAST[],
  def: GameDef,
  runtime: GameDefRuntime,
): CompiledEffectSequence
```

**Compilation pipeline:**
1. Walk each `EffectAST` node through `classifyEffect` (from 74COMEFFSEQ-002).
2. For matches: call the appropriate code generator (from 74COMEFFSEQ-003) to get a `CompiledEffectFragment`.
3. For non-matches: create a fallback fragment that wraps `applyEffects([node], ctx)`.
4. Compose all fragments into a sequential executor that threads state/rng through each fragment.
5. Compute `coverageRatio` using `computeCoverageRatio` (from 74COMEFFSEQ-002).
6. Return the `CompiledEffectSequence`.

**Sequence composition:**
```typescript
function composeFragments(
  fragments: readonly CompiledEffectFragment[],
): CompiledEffectFn
```
- Threads `EffectResult` from one fragment to the next.
- Accumulates `emittedEvents` across fragments.
- Short-circuits on `pendingChoice` (same as interpreter behavior).

**Fallback wrapper:**
```typescript
function createFallbackFragment(
  effects: readonly EffectAST[],
): CompiledEffectFragment
```
- Wraps the interpreter call in a `CompiledEffectFragment` interface.
- Passes through the full `EffectContext` constructed from `CompiledEffectContext`.

**Bulk compilation:**
```typescript
export function compileAllLifecycleEffects(
  def: GameDef,
  runtime: GameDefRuntime,
): ReadonlyMap<string, CompiledEffectSequence>
```
- Iterates all phases in `def.phases`.
- Compiles `onEnter` and `onExit` for each phase (if present).
- Returns the map keyed by `${phaseId}:onEnter` / `${phaseId}:onExit`.
- Skips phases with empty/no effects.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler.ts` (new)

## Out of Scope

- Cache storage on GameDefRuntime (74COMEFFSEQ-005)
- Integration with `dispatchLifecycleEvent` (74COMEFFSEQ-005)
- Debug verification mode (74COMEFFSEQ-006)
- Modifying existing effect handlers
- Phase 2 pattern support
- Performance benchmarking (74COMEFFSEQ-007)

## Acceptance Criteria

### Tests That Must Pass

1. `compileEffectSequence` for a fully-compilable sequence (e.g., two `setVar` + one `if`) returns a `CompiledEffectSequence` with `coverageRatio === 1.0`.
2. `compileEffectSequence` for a mixed sequence (compilable + non-compilable) returns a `CompiledEffectSequence` with `0 < coverageRatio < 1.0`.
3. `compileEffectSequence` for a fully non-compilable sequence (e.g., `chooseOne` + `rollRandom`) returns a `CompiledEffectSequence` with `coverageRatio === 0.0` (all fallback).
4. The composed function produces bit-identical `EffectResult` to `applyEffects(sameEffects, sameContext)` for all test cases.
5. `composeFragments` correctly threads state/rng through sequential fragments.
6. `composeFragments` accumulates emittedEvents from all fragments.
7. `composeFragments` short-circuits on `pendingChoice`.
8. `compileAllLifecycleEffects` produces entries for all phases with non-empty onEnter/onExit.
9. `compileAllLifecycleEffects` produces an empty map for a GameDef with no lifecycle effects.
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. **Correctness**: For any effect sequence, `compiledSequence.execute(...)` produces bit-identical state to `applyEffects(...)` (Foundation 5).
2. **Fallback safety**: Non-compilable nodes always fall back to the interpreter — never skip or error (Foundation 10).
3. **Immutability**: The compiler itself and the composed functions never mutate inputs (Foundation 7).
4. **Bounded**: Compiled loops preserve the same iteration bounds as the interpreter (Foundation 6).
5. **Budget enforcement**: The fallback path still uses `EffectBudgetState` — compiled path does not bypass budget limits.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — integration tests using hand-crafted effect sequences, comparing compiled vs interpreted output.
2. Tests should cover: fully-compilable, partially-compilable, fully-non-compilable sequences, nested if/forEach, gotoPhaseExact with lifecycle implications.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

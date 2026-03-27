# Spec 89 -- Scoped Mutable Execution Context

## Status

Proposed

## Problem

The kernel creates and spreads execution context objects in tight loops.
Every effect handler that calls `mergeToEvalContext` or `mergeToReadContext`
triggers a 24-field spread of the static `EffectEnv` object to produce a
`ReadContext`. With **33 call sites** (10 for `mergeToEvalContext`, 23 for
`mergeToReadContext`) and ~10K+ calls per game in effect dispatch alone,
this pattern has reached **V8's hidden class optimization ceiling**: adding
ANY field to ANY hot-path object causes 2-7% regression.

Evidence from 4 performance campaigns (12+ experiments):

- exp-001 (FITL): WeakMap-cached Map lookups caused +3.1% regression.
- exp-002 (FITL): Adding a field to MoveEnumerationState caused +2.0%.
- exp-004 (FITL): Returning frozen arrays directly caused +5.6%.
- exp-005 (FITL): Map.get() for cached arrays caused +2.8%.
- exp-010 (FITL): Capturing a variable in a closure caused +9.1%.
- exp-003,006,013 (prior FITL campaign): Adding fields to EffectCursor or
  GameDefRuntime caused 4-7% regression each.
- exp-026,027 (Texas): Different object shapes at the same call site caused
  17% regression.

The root cause: V8's JIT compiler creates hidden classes based on object
property sets and creation order. Object literals created via spread
(`{ ...env, state: cursor.state, bindings: resolvedBindings }`) produce new
hidden classes when the source object's shape varies. The kernel's pattern of
creating new context objects on every call creates massive hidden class
polymorphism.

### Current Pattern (problematic)

After Specs 77-78 landed, the hot-path pattern is:

```typescript
// mergeToEvalContext -- called per effect handler (~10K+ times/game)
// Spreads 24-field EffectEnv + 2 overrides = new ReadContext every call
return { ...env, state: cursor.state, bindings: resolvedBindings } as ReadContext;

// mergeToReadContext -- called 23 times across effect handlers
// Same 24-field spread pattern
return { ...env, state: cursor.state, bindings: cursor.bindings } as ReadContext;

// enumerateParams -- called per parameter combination
const ctx = makeEvalContext(def, adj, rti, res, state, player, bindings, opts);
// calls createEvalContext which spreads input + adds collector

// toEffectCursor -- conditional spread creates polymorphic hidden class
const cursor = {
  state: ctx.state,
  rng: ctx.rng,
  bindings: ctx.bindings,
  decisionScope: ctx.decisionScope,
  ...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath }),
};
```

### What Foundation 7 Already Permits

> **Exception -- Scoped internal mutation**: Within a single synchronous
> effect-execution scope (e.g., `applyEffectsWithBudgetState`), effect
> handlers MAY mutate a working copy of the state for performance. The
> working copy is created at scope entry (shallow clone) and is not
> observable by external code.

This exception currently applies to GameState (via `createMutableState` and
`DraftTracker`). The `applyEffectsWithBudgetState` function already uses a
**reusable mutable `workCursor`** that's updated in-place between effect
iterations -- proving the pattern works.

This spec EXTENDS the exception to the execution context model.

## Prerequisites (Completed)

This spec builds on three completed predecessors:

| Spec | What It Landed | Why It Matters for Spec 89 |
|------|---------------|---------------------------|
| **77** (EffectContext Static/Dynamic Split) | Split ~25-field EffectContext into static EffectEnv (24 fields) + dynamic EffectCursor (5 fields) | Reduced per-effect cursor clones from ~25 to 5 fields. Spec 89 targets the remaining 24-field ReadContext spreads that `mergeToEvalContext`/`mergeToReadContext` still produce. |
| **78** (Draft State for Effect Execution) | Introduced mutable GameState + DraftTracker within `applyEffectsWithBudgetState` scope | Proved that scoped mutation is safe and performant. Eliminated ~25K intermediate GameState allocations per 10 games. Foundation 7 exception clause added. |
| **79** (Compiled Effect Path Redesign) | Integrated DraftTracker into compiled effect path | Proved both compiled and interpreted paths handle scoped mutable state correctly. Achieved performance parity. |

## Objective

Formalize a `MutableReadScope` pattern that allows the kernel to reuse
a single mutable ReadContext-compatible object within a synchronous execution
scope, updating only the fields that change between calls, instead of
creating new objects via spread.

## Design

### MutableReadScope

A scope-bounded mutable object that holds the ReadContext fields. Created at
scope entry, mutated during the scope, never escapes the scope.

```typescript
interface MutableReadScope {
  // ReadContext-compatible fields (always present for V8 monomorphism)
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

**V8 monomorphism requirement**: ALL fields are ALWAYS present (even if
`undefined`). No optional fields. No conditional spreads. The object has a
FIXED hidden class from creation to disposal.

Note: `ReadContext` declares `runtimeTableIndex`, `freeOperationOverlay`,
and `maxQueryResults` as optional (`?`). The `MutableReadScope` makes them
non-optional with explicit `| undefined` to ensure V8 sees a fixed property
set at every creation site. TypeScript's structural typing ensures the scope
satisfies the `ReadContext` interface.

### Factory Functions

```typescript
/** Create a mutable ReadContext-compatible scope from env + cursor.
 *  All fields always present -- fixed hidden class. */
function createMutableReadScope(env: EffectEnv, cursor: EffectCursor): MutableReadScope {
  return {
    def: env.def,
    adjacencyGraph: env.adjacencyGraph,
    state: cursor.state,
    activePlayer: env.activePlayer,
    actorPlayer: env.actorPlayer,
    bindings: resolveEffectBindings(env, cursor),
    resources: env.resources,
    runtimeTableIndex: env.runtimeTableIndex ?? undefined,
    freeOperationOverlay: env.freeOperationOverlay ?? undefined,
    maxQueryResults: env.maxQueryResults ?? undefined,
    collector: env.collector,
  };
}

/** Update the dynamic fields between effect handler calls. */
function updateReadScope(scope: MutableReadScope, cursor: EffectCursor, env: EffectEnv): void {
  scope.state = cursor.state;
  scope.bindings = resolveEffectBindings(env, cursor);
}

/** Variant for mergeToReadContext sites (no moveParams merge). */
function updateReadScopeRaw(scope: MutableReadScope, cursor: EffectCursor): void {
  scope.state = cursor.state;
  scope.bindings = cursor.bindings;
}
```

### Scope Lifecycle

```
createMutableReadScope(env, cursor) -> scope  // Create at scope entry
updateReadScope(scope, cursor, env)           // Mutate between effect calls
evalCondition(cond, scope)                    // Pass directly (ReadContext-compatible)
evalValue(expr, scope)                        // Pass directly
resolveRef(ref, scope)                        // Pass directly
// scope goes out of lexical scope -> GC collects
```

### Integration Points

#### 1. Effect Dispatch (`applyEffectsWithBudgetState`)

Already uses a mutable `workCursor`. Extend to also maintain a mutable
ReadContext-compatible scope:

```typescript
// Before (current): 24-field spread per effect handler
const evalCtx = mergeToEvalContext(env, cursor);

// After: 2-field update on shared scope
updateReadScope(scope, workCursor, env);
// Pass scope directly to evalCondition/evalValue
```

The scope is created once at `applyEffectsWithBudgetState` entry and updated
in the existing iteration loop (lines 118-124 in current code). This replaces
33 ReadContext allocations across the effect handlers called from this loop.

#### 2. Parameter Enumeration (`enumerateParams`)

Currently creates a new ReadContext via `makeEvalContext` for every parameter
combination (2 call sites in `legal-moves.ts`):

```typescript
// Before: new object per param combo
const ctx = makeEvalContext(def, adj, rti, res, state, player, bindings, opts);

// After: field updates on scope created at enumeration entry
scope.activePlayer = executionPlayer;
scope.bindings = bindings;
```

#### 3. forEach / let / reduce Effect Handlers

These already use a mutable `iterationCursor` or `nestedCursor` pattern for
EffectCursor fields. The same scope object created at
`applyEffectsWithBudgetState` propagates through recursive calls to
`applyEffectsWithBudgetState` -- there is NO separate scope creation for
inner iterations, because the inner call creates its own scope (or reuses
the parent's if the scope is threaded via the workCursor/env pair).

### Safety Constraints

1. **Scope-bounded**: The mutable scope MUST NOT escape the synchronous call
   that created it. No storing in closures, no returning, no passing to async
   callbacks.

2. **ReadContext compatibility**: The scope must satisfy the `ReadContext`
   interface so existing `evalCondition`, `evalValue`, and `resolveRef`
   functions work without signature changes.

3. **No retained references**: Effect handlers MUST NOT store references to
   the scope's fields beyond the handler's execution. The scope's `bindings`
   object may be replaced between calls.

4. **Determinism preserved**: The scope mutation order is deterministic
   (same as the current object creation order). Same inputs produce same
   outputs.

5. **Nested scope isolation**: When `applyEffectsWithBudgetState` calls
   itself recursively (e.g., for forEach body effects), each nesting level
   creates its own `MutableReadScope`. The parent scope is not visible to
   the child. This mirrors the existing `workCursor` nesting pattern.

### What This Does NOT Change

- The external contract: `applyMove(state) -> newState` remains immutable.
- The `ReadContext` interface definition (consumers don't change).
- Function signatures of `evalCondition`, `evalValue`, `resolveRef`.
- The `EffectEnv` or `EffectCursor` interfaces.
- The `GameDefRuntime` interface.
- Any public API.

### Phased Rollout

#### Phase 0: Fix EffectCursor Polymorphism (Prerequisite)

Fix `toEffectCursor` to always set `effectPath` (even as `undefined`),
eliminating the conditional spread that creates polymorphic hidden classes:

```typescript
// Before: conditional spread creates two possible hidden classes
...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })

// After: always-present field, single hidden class
effectPath: ctx.effectPath,   // undefined is fine -- property exists
```

Also fix `toTraceProvenanceContext` and `toTraceEmissionContext` which use
the same conditional spread pattern for `traceContext` and `effectPath`.

This is a small, low-risk change directly aligned with the monomorphism goal.

#### Phase 1: Mutable ReadContext Scope in Effect Dispatch

Replace both `mergeToEvalContext` (10 sites) and `mergeToReadContext`
(23 sites) with `MutableReadScope` updates in the `applyEffectsWithBudgetState`
hot path:

- Add `createMutableReadScope`, `updateReadScope`, `updateReadScopeRaw` to
  `effect-context.ts`.
- Create scope at `applyEffectsWithBudgetState` entry.
- Call `updateReadScope`/`updateReadScopeRaw` before each effect handler.
- Pass scope directly where handlers currently call `mergeToEvalContext` or
  `mergeToReadContext`.
- Delete `mergeToEvalContext` and `mergeToReadContext` once all call sites
  are migrated.

This is the highest-frequency call site (~10K+ per game). Eliminates
33 x 24-field spreads per effect dispatch sequence.

#### Phase 2: Mutable Scope in `enumerateParams`

Replace `makeEvalContext`/`createEvalContext` in parameter enumeration with
a mutable scope:

- Create scope at `enumerateParams` entry.
- Update `activePlayer` and `bindings` per parameter combination.
- 2 call sites in `legal-moves.ts`.

#### Phase 3: Audit Remaining `createEvalContext` Sites

23 `createEvalContext` call sites exist across the kernel (trigger dispatch,
apply-move, event execution, turn flow, terminal check, etc.). Audit each
for:

- Frequency (hot path vs. cold path).
- Whether the context escapes the call (stored in result, passed to callback).
- Whether a mutable scope is safe to introduce.

Convert hot-path sites. Leave cold-path sites (called once per move or less)
unchanged -- the optimization has negligible value there.

Each phase is independently measurable and independently revertable.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Execution context model is game-agnostic |
| F5 (Determinism) | Same mutation order = same results. Scope mutation is deterministic. |
| F7 (Immutability) | EXTENDS the existing scoped-mutation exception (added by Spec 78) to context objects. External contract preserved: `applyMove(state) -> newState` remains immutable. |
| F9 (No Backwards Compat) | Replaces internal pattern, no shims. `mergeToEvalContext` and `mergeToReadContext` are deleted, not deprecated. |
| F10 (Completeness) | Addresses root cause (V8 hidden class ceiling) rather than symptoms. |
| F11 (Testing as Proof) | Determinism tests (same seed + same actions = identical hash) prove correctness. Benchmark tests prove performance impact. |
| F12 (Branded Types) | No impact -- scope carries branded `PlayerId` values as-is. |

## Acceptance Criteria

1. `mergeToEvalContext` and `mergeToReadContext` no longer create new objects
   via spread in the effect dispatch hot path (Phase 1).
2. `MutableReadScope` has a FIXED hidden class: all 11 fields always present,
   no optional properties, no conditional spreads.
3. `toEffectCursor` always sets `effectPath` (no conditional spread) (Phase 0).
4. Scope does not escape the synchronous call that created it (verified by
   code review and grep for scope references in return statements/closures).
5. All existing tests pass without weakening assertions.
6. The effect dispatch hot path shows measurable improvement in FITL benchmark
   (target: >5% reduction in combined_duration_ms).
7. No changes to public API signatures or the `ReadContext` interface.
8. `mergeToEvalContext` and `mergeToReadContext` are deleted (not deprecated)
   after Phase 1 migration.

## Risk Assessment

**Medium-high complexity**: This changes the internal execution model. Every
effect handler that calls `mergeToEvalContext` or `mergeToReadContext` is
affected. Incorrect scope management could cause:

- Stale bindings (scope not updated before eval call).
- Cross-iteration contamination (scope state leaking between forEach items).
- Stale state visible to nested `applyEffectsWithBudgetState` calls.

**Mitigation**:

- **Phased rollout** with per-phase benchmarking. Phase 0 is near-zero risk.
  Phase 1 is the highest-value change. Phases 2-3 are optional.
- **Nested scope isolation**: Each `applyEffectsWithBudgetState` nesting level
  creates its own scope, preventing cross-level contamination.
- **Determinism tests**: Same seed + same actions = identical Zobrist hash.
  Any scope contamination would break determinism immediately.
- **No retained references**: Exploration confirmed 0 context retention sites
  across all 8 `effects-*.ts` handler files. All contexts are ephemeral.

## Estimated Impact

Phase 0: Near-zero runtime impact, but unblocks all subsequent phases by
establishing the monomorphism invariant for EffectCursor.

Phase 1 alone: 5-15% reduction in combined_duration_ms for FITL. Eliminates
~10K 24-field spreads per game across 33 call sites.

All phases combined: 15-30% reduction. Unlocks all the micro-optimizations
that currently fail due to V8 hidden class sensitivity.

## Files to Modify

### Phase 0

- `packages/engine/src/kernel/effect-context.ts` -- fix `toEffectCursor`,
  `toTraceProvenanceContext`, `toTraceEmissionContext` conditional spreads

### Phase 1

- `packages/engine/src/kernel/effect-context.ts` -- add `MutableReadScope`,
  `createMutableReadScope`, `updateReadScope`, `updateReadScopeRaw`; delete
  `mergeToEvalContext`, `mergeToReadContext`
- `packages/engine/src/kernel/effect-dispatch.ts` -- create scope at
  `applyEffectsWithBudgetState` entry, thread through effect loop
- `packages/engine/src/kernel/effects-binding.ts` -- receive scope instead
  of calling mergeToEvalContext
- `packages/engine/src/kernel/effects-choice.ts` -- receive scope instead
  of calling mergeToReadContext
- `packages/engine/src/kernel/effects-control.ts` -- receive scope, update
  forEach/let/reduce/if patterns
- `packages/engine/src/kernel/effects-resource.ts` -- receive scope
- `packages/engine/src/kernel/effects-reveal.ts` -- receive scope
- `packages/engine/src/kernel/effects-subset.ts` -- receive scope
- `packages/engine/src/kernel/effects-token.ts` -- receive scope
- `packages/engine/src/kernel/effects-var.ts` -- receive scope

### Phase 2

- `packages/engine/src/kernel/legal-moves.ts` -- replace `makeEvalContext`
  with mutable scope in `enumerateParams`

### Phase 3

- Audit: `trigger-dispatch.ts`, `apply-move.ts`, `action-executor.ts`,
  `event-execution.ts`, `turn-flow-eligibility.ts`, and other
  `createEvalContext` consumers

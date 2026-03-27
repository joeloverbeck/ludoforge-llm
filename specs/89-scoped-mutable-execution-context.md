# Spec 89 -- Scoped Mutable Execution Context

## Status

Proposed

## Problem

The kernel creates and spreads execution context objects (ReadContext,
EvalContext, EffectCursor) in tight loops. Every effect handler call, every
condition evaluation, and every parameter combination creates a new context
object via spread. This pattern has reached **V8's hidden class optimization
ceiling**: adding ANY field to ANY hot-path object causes 2-7% regression.

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
(`{ ...ctx, state: newState, bindings: newBindings }`) produce new hidden
classes when the source object's shape varies. The kernel's pattern of creating
new context objects on every call creates massive hidden class polymorphism.

### Current Pattern (problematic)

```typescript
// mergeToEvalContext -- called per effect handler (~10K+ times/game)
return { ...env, state: cursor.state, bindings: resolvedBindings };
// 17-field spread + 2 overrides = new object every call

// enumerateParams -- called per parameter combination
const ctx = makeEvalContext(def, adj, rti, res, state, player, bindings, opts);
// creates intermediate object + spread in createEvalContext = 2 allocations

// applyForEach -- called per forEach iteration
const iterationCursor = { ...cursor, state, rng, decisionScope, bindings };
// 5-6 field spread per iteration * 80 zones = 80 objects per forEach
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

## Objective

Formalize a `MutableExecutionScope` pattern that allows the kernel to reuse
a single mutable context object within a synchronous execution scope, updating
only the fields that change between calls, instead of creating new objects
via spread.

## Design

### MutableExecutionScope

A scope-bounded mutable object that holds the execution context fields.
Created at scope entry, mutated during the scope, never escapes the scope.

```typescript
interface MutableExecutionScope {
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

### Scope Lifecycle

```
createScope(env, cursor) -> scope     // Create at scope entry
scope.state = newState                // Mutate between calls
scope.bindings = newBindings          // Mutate between calls
evalCondition(cond, scope)            // Pass directly (ReadContext-compatible)
evalValue(expr, scope)                // Pass directly
resolveRef(ref, scope)                // Pass directly
disposeScope(scope)                   // Discard reference (GC collects)
```

### Integration Points

#### 1. Effect Dispatch (`applyEffectsWithBudgetState`)

Already uses a mutable `workCursor`. Extend to also maintain a mutable
`ReadContext`-compatible scope for `mergeToEvalContext` calls:

```typescript
// Before (current): 17-field spread per effect handler
const evalCtx = mergeToEvalContext(env, cursor);

// After: 2-field update on shared scope
scope.state = cursor.state;
scope.bindings = resolveEffectBindings(env, cursor);
// Pass scope directly to evalCondition/evalValue
```

#### 2. Parameter Enumeration (`enumerateParams`)

Currently creates a new `ReadContext` via `makeEvalContext` for every parameter
combination. Replace with a mutable scope updated per combination:

```typescript
// Before: new object per param combo (possibly 100+ per enumeration)
const ctx = makeEvalContext(def, adj, rti, res, state, player, bindings, opts);

// After: 2-field update
scope.activePlayer = executionPlayer;
scope.bindings = bindings;
```

#### 3. forEach Effect Handler (`applyForEach`)

Already uses a mutable `iterationCursor` pattern. Extend to the eval context:

```typescript
// Before: spread per iteration
const iterationCursor = { ...cursor, state, rng, decisionScope, bindings };

// After: field updates (cursor is already mutable in this scope)
workCursor.state = currentState;
workCursor.rng = currentRng;
workCursor.bindings = { ...cursor.bindings, [bind]: item };
```

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

### What This Does NOT Change

- The external contract: `applyMove(state) -> newState` remains immutable.
- The `ReadContext` interface definition (consumers don't change).
- Function signatures of `evalCondition`, `evalValue`, `resolveRef`.
- The `GameDefRuntime` interface.
- Any public API.

### Phased Rollout

1. **Phase 1**: `mergeToEvalContext` in effect dispatch. This is the highest-
   frequency call site (~10K+ per game). Replace the 17-field spread with
   2-field updates on a scope created at `applyEffectsWithBudgetState` entry.

2. **Phase 2**: `makeEvalContext` in `enumerateParams`. Replace per-param-
   combination context creation with scope updates.

3. **Phase 3**: Audit remaining context creation sites (trigger dispatch,
   probe contexts, etc.) and convert where safe.

Each phase is independently measurable and independently revertable.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Execution context model is game-agnostic |
| F5 (Determinism) | Same mutation order = same results |
| F7 (Immutability) | EXTENDS the existing scoped-mutation exception to context objects. External contract preserved. |
| F9 (No Backwards Compat) | Replaces internal pattern, no shims |
| F10 (Completeness) | Addresses root cause (V8 hidden class ceiling) |
| F11 (Testing as Proof) | Determinism and parity tests prove correctness |

## Acceptance Criteria

1. `mergeToEvalContext` no longer creates a new object via spread in the
   effect dispatch hot path.
2. `MutableExecutionScope` has a FIXED hidden class (all fields always
   present, no optional properties).
3. Scope does not escape the synchronous call that created it (verified by
   code review).
4. All existing tests pass without weakening assertions.
5. The effect dispatch hot path shows measurable improvement in FITL benchmark
   (target: >5% reduction in combined_duration_ms).
6. No changes to public API signatures or the `ReadContext` interface.

## Risk Assessment

**High complexity**: This changes the internal execution model. Every effect
handler that calls `mergeToEvalContext` is affected. Incorrect scope management
could cause:
- Stale bindings (scope not updated before eval call).
- Cross-iteration contamination (scope state leaking between forEach items).
- Test failures from retained references.

**Mitigation**: Phased rollout with per-phase benchmarking. Phase 1 (effect
dispatch) is the highest-value, lowest-risk change. Phases 2-3 are optional
and can be deferred.

## Estimated Impact

Phase 1 alone: 5-15% reduction in combined_duration_ms for FITL. Eliminates
~10K 17-field spreads per game in `mergeToEvalContext`.

All phases combined: 15-30% reduction. Unlocks all the micro-optimizations
that currently fail due to V8 hidden class sensitivity.

## Files to Modify

- `packages/engine/src/kernel/effect-context.ts` -- new scope creation/disposal
- `packages/engine/src/kernel/effect-dispatch.ts` -- use mutable scope
- `packages/engine/src/kernel/effects-control.ts` -- forEach/if/let use scope
- `packages/engine/src/kernel/effects-*.ts` -- effect handlers use scope
- `packages/engine/src/kernel/legal-moves.ts` -- parameter enumeration scope
- `packages/engine/test/` -- verify no retained references

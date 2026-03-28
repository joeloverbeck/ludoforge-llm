# Spec 90 — Compiled Condition Predicates

**Status**: Not started
**Dependencies**: Spec 76 (ValueExpr type-tag discriminants, completed), Spec 82
(Effect AST type tags, completed)
**Blocked by**: None
**Enables**: Spec 91 (first-decision-point precomputation) can reuse the
condition compiler for decision-domain queries

## Problem

Pipeline legality conditions are evaluated through the full
`evalCondition → evalValue → resolveRef → evalQuery` AST interpreter chain.
For every `legalMoves` call, each of the ~20 pipeline actions requires a
pipeline predicate evaluation via `evaluateDiscoveryPipelinePredicateStatus`.
This calls `evalCondition` on the pipeline's `legality` and `costValidation`
ConditionASTs against the current ReadContext.

### Why This Is Expensive

Each `evalCondition` call walks the ConditionAST recursively:

1. `evalCondition` dispatches on `cond.op` (switch over 10+ operators)
2. For comparison operators (`>`, `==`, `<=`, etc.): calls `evalValue` on both
   sides
3. `evalValue` dispatches on `_t` tag (switch over 6 tags)
4. For REF tags: calls `resolveRef` which dispatches on `ref.ref` type (14-way
   if-else chain)
5. For AGGREGATE tags: calls `evalQuery` which iterates zones/tokens
6. For AND/OR: recursively calls `evalCondition` on each arg

For a typical FITL pipeline legality condition like "aggregate count of troops
in provinces matching zone filter > 0", this chain involves:

- 1 `evalCondition` (op: `>`)
- 2 `evalValue` calls (left: aggregate, right: literal 0)
- 1 `evalQuery` call (iterates matching zones, filters tokens)
- 1 aggregate reduction (count items)
- Per-item `evalValue` for the aggregate valueExpr
- `resolveRef` for bindings, global vars, player vars

The per-call overhead (function dispatch, object allocation, recursive calls)
is multiplicative. With 20 pipeline actions × 2 conditions (legality + cost) ×
600 `legalMoves` calls = 24,000 condition evaluations per benchmark. At ~1ms
each, this is ~24 seconds — roughly 20% of the total runtime.

### Why Micro-Optimization Doesn't Work

The `fitl-perf-optimization` campaign (12 experiments) proved that V8's JIT has
fully optimized the current interpreter. Any modification to `evalCondition`,
`evalValue`, `resolveRef`, or `createEvalContext` causes 2-13% regression due
to V8 hidden class deoptimization. The interpreter is at its performance ceiling.

### What Existing Compiled Effect Specs Don't Cover

Specs 79/81 compiled EFFECT SEQUENCES — side-effectful operations involving
state mutation, draft tracking, decision points, and effect context management.
Condition predicates are fundamentally simpler: they are **pure read-only
boolean functions** of game state. They have no side effects, no state mutation,
no decision points, and no draft state. This makes them a much safer and simpler
compilation target.

## Objective

At `createGameDefRuntime` time, compile pipeline applicability, legality, and
costValidation condition predicates into direct JavaScript closures that bypass
the AST interpreter entirely. The compiled closures are stored in a module-level
`WeakMap` cache (not on `GameDefRuntime` — V8 hidden class sensitivity) and
invoked from `evaluateDiscoveryPipelinePredicateStatus` when available.

## Design

### Compilation Target

A compiled condition predicate is a pure function:

```typescript
type CompiledConditionPredicate = (state: GameState, activePlayer: PlayerId) => boolean;
```

It takes only the dynamic parts (state and active player) and closes over the
static parts (def, adjacencyGraph, runtimeTableIndex) at compilation time.

### Compilable Patterns

The compiler recognizes common ConditionAST shapes and emits direct closures:

#### Tier 1: Scalar comparisons (highest frequency)

```yaml
# Pattern: gvar comparison
{ op: '==', left: { _t: 2, ref: 'gvar', name: 'monsoon' }, right: true }
# Compiles to: (state) => state.globalVars.monsoon === true

# Pattern: pvar comparison (active player)
{ op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', name: 'resources' }, right: 3 }
# Compiles to: (state, player) => state.perPlayerVars[player].resources >= 3
```

#### Tier 2: Aggregate count checks

```yaml
# Pattern: count tokens in zone > 0
{ op: '>', left: { _t: 5, aggregate: { op: 'count', query: { query: 'tokens', zone: '...' } } }, right: 0 }
# Compiles to: (state) => state.zones[resolvedZone]?.length > 0
```

#### Tier 3: Boolean combinations

```yaml
# Pattern: and/or over compilable sub-conditions
{ op: 'and', args: [compilable_cond_1, compilable_cond_2] }
# Compiles to: (state, player) => compiled_1(state, player) && compiled_2(state, player)
```

#### Fallback

Conditions that don't match any compilable pattern fall through to the existing
`evalCondition` interpreter. The compilation is best-effort — partial
compilation of sub-conditions within `and`/`or` is not attempted (simplicity
over completeness).

### Storage Strategy

From the `fitl-perf-optimization` campaign: adding ANY field to `GameDefRuntime`
causes V8 hidden class deoptimization (2-7% regression across 5 experiments).
The compiled predicates MUST be stored externally.

```typescript
// In a new file: packages/engine/src/kernel/compiled-condition-cache.ts

const compiledPredicateCache = new WeakMap<
  readonly ActionPipelineDef[],
  ReadonlyMap<string, CompiledConditionPredicate>
>();

export function getCompiledPipelinePredicates(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
): ReadonlyMap<string, CompiledConditionPredicate> {
  const pipelines = def.actionPipelines;
  if (pipelines === undefined) return new Map();

  let cached = compiledPredicateCache.get(pipelines);
  if (cached === undefined) {
    cached = compilePipelinePredicates(def, adjacencyGraph, runtimeTableIndex);
    compiledPredicateCache.set(pipelines, cached);
  }
  return cached;
}
```

The WeakMap is keyed on `def.actionPipelines` (array reference), matching the
existing pattern used by `getActionPipelineLookup`. This is safe because:
- The cache is populated ONCE per GameDef (at the first `legalMoves` call)
- The WeakMap lookup is in the PREFLIGHT path (outside kernel execution),
  which was proven safe in exp-006 of the fitl-perf-optimization campaign

### Integration Point

`evaluateDiscoveryPipelinePredicateStatus` (pipeline-viability-policy.ts) is
the only call site that evaluates pipeline predicates during enumeration. The
integration adds a compiled-predicate check before falling through to the
interpreter:

```typescript
const evalDiscoveryPredicate = (
  action, profileId, predicate, condition, evalCtx,
): DiscoveryPredicateState => {
  if (condition == null) return 'passed';

  // Try compiled predicate first
  const compiled = getCompiledPredicate(evalCtx.def, profileId, predicate);
  if (compiled !== undefined) {
    return compiled(evalCtx.state, evalCtx.activePlayer) ? 'passed' : 'failed';
  }

  // Fallback to interpreter
  return evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx);
};
```

### Condition Compiler Architecture

```
ConditionAST
  │
  ├── tryCompileCondition(cond, staticCtx)
  │     │
  │     ├── cond is boolean literal → return () => cond
  │     │
  │     ├── cond.op is comparison (==, !=, <, <=, >, >=)
  │     │     ├── tryCompileValueExpr(left) + tryCompileValueExpr(right)
  │     │     │     ├── literal → return () => value
  │     │     │     ├── gvar ref → return (state) => state.globalVars[name]
  │     │     │     ├── pvar ref (active) → return (state, player) => state.perPlayerVars[player][name]
  │     │     │     ├── aggregate count (simple query) → return (state) => queryCount(state, querySpec)
  │     │     │     └── other → return null (not compilable)
  │     │     └── if both sides compiled → combine into comparison closure
  │     │
  │     ├── cond.op is 'and' → compile all args; if all succeed → combine with &&
  │     ├── cond.op is 'or' → compile all args; if all succeed → combine with ||
  │     ├── cond.op is 'not' → compile arg; if succeeds → negate
  │     │
  │     └── other → return null (not compilable)
  │
  └── null → fallback to evalCondition interpreter
```

### V8 Safety Analysis

- No fields added to GameDefRuntime, EffectCursor, ReadContext, or any hot-path
  object. The cache is in a module-level WeakMap.
- No changes to `evalCondition`, `evalValue`, `resolveRef`, or any kernel
  computation function.
- The compiled closures are called from `evalDiscoveryPredicate` which is in the
  PREFLIGHT path (not the kernel execution path). This distinction was proven
  critical in the fitl-perf-optimization campaign.
- The closures capture static references (def, adjacencyGraph) at compilation
  time — these are the same references V8 has already optimized.
- Compilation happens ONCE per GameDef. The compiled closures are called ~24K
  times per benchmark — the closure call overhead is negligible compared to the
  interpreter chain it replaces.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Generic pattern-matching compiler — no game-specific logic. Compiles any ConditionAST that matches recognized patterns. |
| F5 (Determinism) | Compiled predicates are pure functions producing identical results to the interpreter. Determinism test validates equivalence. |
| F6 (Bounded Computation) | Compilation is bounded (finite pattern set, finite condition depth). Compiled closures execute in O(1) per comparison, O(n) per aggregate — same complexity as interpreter but lower constant factor. |
| F7 (Immutability) | Compiled closures are read-only functions of state. No mutation. Cache is populated once and never modified. |
| F8 (Compiler-Kernel Boundary) | Condition compilation is an OPTIMIZATION of the kernel's condition evaluator, not a compiler change. The compiler (CNL) is untouched. |
| F9 (No Backwards Compat) | No shims. Compiled closures replace interpreter calls directly. Fallback to interpreter for unrecognized patterns is a clean "not compiled" path, not a compatibility layer. |
| F10 (Completeness) | Addresses root cause (AST interpretation overhead) rather than symptom (slow individual operations). |
| F11 (Testing as Proof) | Equivalence test: for every pipeline predicate, verify compiled result matches interpreter result across N random states. |

## Acceptance Criteria

1. Pipeline legality and costValidation conditions are compiled into direct
   closures when they match recognized patterns.
2. Compiled closures produce identical boolean results to the interpreter for
   all game states (proven by equivalence test).
3. Unrecognized conditions fall through to the interpreter without error.
4. No fields added to GameDefRuntime, EffectCursor, ReadContext, or Move.
5. Compilation happens once per GameDef (WeakMap-cached).
6. All existing tests pass without weakening assertions.
7. Performance benchmark shows measurable improvement in pipeline predicate
   evaluation time.

## Estimated Impact

**Conservative estimate: 5-15% reduction in total benchmark time.**

Pipeline predicate evaluation accounts for ~13% of total runtime (estimated from
per-function profiling breakdown). If compiled predicates are 5-10x faster than
the interpreter for compilable patterns, and 80%+ of FITL pipeline conditions
are compilable (scalar comparisons and aggregate counts are the most common
patterns), the pipeline predicate cost drops from ~15s to ~2-3s.

The secondary benefit is reduced GC pressure: each compiled predicate call
creates 0 intermediate objects (no ReadContext, no spread, no evalValue
dispatch), compared to 3-10 intermediate objects per interpreter evaluation.

## Files to Create

- `packages/engine/src/kernel/condition-compiler.ts` — pattern-matching compiler
  that produces `CompiledConditionPredicate` closures from ConditionASTs
- `packages/engine/src/kernel/compiled-condition-cache.ts` — WeakMap cache for
  compiled pipeline predicates

## Files to Modify

- `packages/engine/src/kernel/pipeline-viability-policy.ts` — call compiled
  predicate before falling through to interpreter
- `packages/engine/test/unit/` — add equivalence tests for compiled vs
  interpreted condition evaluation
- `packages/engine/test/integration/` — add benchmark test verifying
  performance improvement

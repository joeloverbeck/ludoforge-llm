# Spec 90 — Compiled Condition Predicates

**Status**: Completed
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
ConditionASTs against the current ReadContext. Stage-level predicates
(`ActionResolutionStageDef.legality`/`costValidation`) are evaluated through the
same path via `evaluateDiscoveryStagePredicateStatus`.

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

At `createGameDefRuntime` time, compile pipeline-level and stage-level
`legality` and `costValidation` condition predicates into direct JavaScript
closures that bypass the AST interpreter entirely. The compiled closures are
stored in a module-level `WeakMap` cache (not on `GameDefRuntime` — V8 hidden
class sensitivity) and invoked from `evaluateDiscoveryPipelinePredicateStatus`
and `evaluateDiscoveryStagePredicateStatus` when available.

**Scoping note — applicability excluded**: Pipeline `applicability` conditions
are evaluated in a different code path (profile dispatch in
`apply-move-pipeline.ts` and `resolveActionApplicabilityPreflight`), not through
the predicate evaluation path targeted here. Compiling applicability would
require a separate integration point with different error semantics. It is a
valid follow-up but out of scope for this spec.

## Design

### Compilation Target

A compiled condition predicate is a pure function:

```typescript
type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
) => boolean;
```

It takes the dynamic parts (state, active player, and bindings) and closes over
the static parts (def, adjacencyGraph, runtimeTableIndex) at compilation time.

**Why bindings are in the signature**: Real FITL pipeline conditions frequently
reference binding refs (e.g., `{ ref: 'binding', name: '__freeOperation' }`).
Approximately 35% of FITL pipeline conditions include binding comparisons.
Without bindings access, these conditions would fall through to the interpreter,
reducing compiled coverage from ~85% to ~50%.

**Deferred semantics**: During discovery-mode enumeration, some bindings (like
`__freeOperation`) may not be present in the context. When a compiled predicate
accesses a missing binding, it throws a missing-binding error — identical to the
interpreter's behavior. The existing `shouldDeferMissingBinding` catch in
`evalActionPipelinePredicateForDiscovery` converts this to the `'deferred'`
tri-state naturally. No special handling is required in the compiled closures.

### Compilable Patterns

The compiler recognizes common ConditionAST shapes and emits direct closures:

#### Tier 1: Scalar comparisons (highest frequency)

```yaml
# Pattern: gvar comparison
{ op: '==', left: { _t: 2, ref: 'gvar', var: 'monsoon' }, right: true }
# Compiles to: (state) => state.globalVars.monsoon === true

# Pattern: pvar comparison (active player)
{ op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 3 }
# Compiles to: (state, player) => state.perPlayerVars[player].resources >= 3

# Pattern: binding comparison
{ op: '==', left: { _t: 2, ref: 'binding', name: '__freeOperation' }, right: true }
# Compiles to: (state, player, bindings) => {
#   const v = bindings['__freeOperation'];
#   if (v === undefined) throw missingBindingError('__freeOperation');
#   return v === true;
# }
```

**Note on binding ref deferred semantics**: When the binding is present, the
compiled closure returns a boolean — the fast path. When the binding is absent,
the closure throws a missing-binding error. The discovery wrapper
(`evalActionPipelinePredicateForDiscovery`) already catches these errors via
`shouldDeferMissingBinding` and returns `'deferred'`. This preserves the
interpreter's tri-state behavior without complicating the compiled predicate's
return type.

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
# Compiles to: (state, player, bindings) => compiled_1(state, player, bindings) && compiled_2(state, player, bindings)
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

// Cache key encodes: pipelineId + predicateName + optional stageIndex
type ConditionCacheKey = string;

const compiledPredicateCache = new WeakMap<
  readonly ActionPipelineDef[],
  ReadonlyMap<ConditionCacheKey, CompiledConditionPredicate>
>();

export function getCompiledPipelinePredicates(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
): ReadonlyMap<ConditionCacheKey, CompiledConditionPredicate> {
  const pipelines = def.actionPipelines;
  if (pipelines === undefined) return new Map();

  let cached = compiledPredicateCache.get(pipelines);
  if (cached === undefined) {
    cached = compilePipelineAndStagePredicates(def, adjacencyGraph, runtimeTableIndex);
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

The cache covers both pipeline-level and stage-level conditions. The
`compilePipelineAndStagePredicates` function iterates all pipelines and their
stages, compiling any `legality` or `costValidation` ConditionAST that matches
a recognized pattern.

### Integration Point

The integration adds a boolean literal fast-path and compiled-predicate check
to `evalDiscoveryPredicate` and its stage-level counterpart, before falling
through to the interpreter.

#### Discovery path (pipeline-viability-policy.ts)

```typescript
const evalDiscoveryPredicate = (
  action, profileId, predicate, condition, evalCtx,
): DiscoveryPredicateState => {
  if (condition == null) return 'passed';

  // Fast-path: boolean literal conditions (~40% of FITL pipelines)
  if (typeof condition === 'boolean') return condition ? 'passed' : 'failed';

  // Try compiled predicate
  const compiled = getCompiledPredicate(evalCtx.def, profileId, predicate);
  if (compiled !== undefined) {
    return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings)
      ? 'passed'
      : 'failed';
  }

  // Fallback to interpreter
  return evalActionPipelinePredicateForDiscovery(action, profileId, predicate, condition, evalCtx);
};
```

**Boolean literal fast-path rationale**: Approximately 40% of FITL pipeline
conditions are `legality: true`. The existing `condition == null` check catches
`null` but not boolean `true`. A `typeof condition === 'boolean'` check
eliminates function call overhead for these conditions — zero compilation, zero
cache lookup, zero interpreter dispatch.

#### Stage-level path

The same pattern applies to `evaluateDiscoveryStagePredicateStatus` and
`evaluateStagePredicateStatus`. The compiled predicate cache key includes the
stage index to distinguish stage-level conditions from pipeline-level ones.

#### Execution path (non-discovery)

The execution path (`evaluateCheckpointPredicateStatus`) also benefits from
both the boolean literal fast-path and compiled predicates. The compiled
predicate is called directly (no `try/catch` for deferred — missing bindings
during execution are real errors, not deferral candidates).

### Condition Compiler Architecture

```
ConditionAST
  |
  +-- tryCompileCondition(cond, staticCtx)
  |     |
  |     +-- cond is boolean literal -> return () => cond
  |     |
  |     +-- cond.op is comparison (==, !=, <, <=, >, >=)
  |     |     +-- tryCompileValueExpr(left) + tryCompileValueExpr(right)
  |     |     |     +-- literal -> return () => value
  |     |     |     +-- gvar ref -> return (state) => state.globalVars[name]
  |     |     |     +-- pvar ref (active) -> return (state, player) => state.perPlayerVars[player][name]
  |     |     |     +-- binding ref -> return (state, player, bindings) => {
  |     |     |     |     if (bindings[name] === undefined) throw missingBindingError(name);
  |     |     |     |     return bindings[name];
  |     |     |     |   }
  |     |     |     +-- aggregate count (simple query) -> return (state) => queryCount(state, querySpec)
  |     |     |     +-- other -> return null (not compilable)
  |     |     +-- if both sides compiled -> combine into comparison closure
  |     |
  |     +-- cond.op is 'and' -> compile all args; if all succeed -> combine with &&
  |     +-- cond.op is 'or' -> compile all args; if all succeed -> combine with ||
  |     +-- cond.op is 'not' -> compile arg; if succeeds -> negate
  |     |
  |     +-- other -> return null (not compilable)
  |
  +-- null -> fallback to evalCondition interpreter
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
| F10 (Completeness) | Addresses root cause (AST interpretation overhead) comprehensively within the predicate evaluation path. Both pipeline-level and stage-level conditions are compiled — excluding either would leave a gap in the same hot path. Applicability is scoped out because it uses a different evaluation path (profile dispatch in `apply-move-pipeline.ts`), not because of incomplete coverage. |
| F11 (Testing as Proof) | Equivalence test: for every pipeline and stage predicate, verify compiled result matches interpreter result across N random states. |

## Acceptance Criteria

1. Pipeline-level `legality` and `costValidation` conditions are compiled into
   direct closures when they match recognized patterns.
2. Stage-level `legality` and `costValidation` conditions are compiled using the
   same compiler and cache infrastructure.
3. Compiled closures produce identical boolean results to the interpreter for
   all game states (proven by equivalence test).
4. Compiled closures that reference missing bindings throw missing-binding
   errors, which the discovery wrapper converts to `'deferred'` — matching
   interpreter behavior exactly.
5. Boolean literal conditions (`true`/`false`) are handled by a fast-path check
   before compilation lookup or interpreter fallback.
6. Unrecognized conditions fall through to the interpreter without error.
7. No fields added to GameDefRuntime, EffectCursor, ReadContext, or Move.
8. Compilation happens once per GameDef (WeakMap-cached).
9. All existing tests pass without weakening assertions.
10. Performance benchmark shows measurable improvement in pipeline predicate
    evaluation time.

## Estimated Impact

**Conservative estimate: 5-15% reduction in total benchmark time.**

Pipeline predicate evaluation accounts for ~13% of total runtime (estimated from
per-function profiling breakdown). If compiled predicates are 5-10x faster than
the interpreter for compilable patterns, and 80%+ of FITL pipeline conditions
are compilable (scalar comparisons, binding checks, and aggregate counts are the
most common patterns), the pipeline predicate cost drops from ~15s to ~2-3s.

The boolean literal fast-path contributes an additional small gain by
eliminating function call overhead for ~40% of conditions that are `legality:
true`.

The secondary benefit is reduced GC pressure: each compiled predicate call
creates 0 intermediate objects (no ReadContext, no spread, no evalValue
dispatch), compared to 3-10 intermediate objects per interpreter evaluation.

## Files to Create

- `packages/engine/src/kernel/condition-compiler.ts` — pattern-matching compiler
  that produces `CompiledConditionPredicate` closures from ConditionASTs
- `packages/engine/src/kernel/compiled-condition-cache.ts` — WeakMap cache for
  compiled pipeline and stage predicates

## Files to Modify

- `packages/engine/src/kernel/pipeline-viability-policy.ts` — add boolean
  literal fast-path and compiled predicate check before interpreter fallback,
  for both pipeline-level and stage-level evaluation functions
- `packages/engine/src/kernel/action-pipeline-predicates.ts` — ensure
  missing-binding error contract is preserved for compiled predicate callers
- `packages/engine/test/unit/` — add equivalence tests for compiled vs
  interpreted condition evaluation (pipeline-level and stage-level)
- `packages/engine/test/integration/` — add benchmark test verifying
  performance improvement

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Implemented the condition compiler, WeakMap-backed compiled predicate cache, and policy-layer fast-path integration in tickets 001-004.
  - Added production-proof coverage in ticket 005 with a shared FITL predicate-corpus helper, a production equivalence integration test, and a predicate benchmark harness.
- Deviation from the original spec narrative:
  - The cache implementation uses `ConditionAST` object identity rather than encoded pipeline/stage keys.
  - The benchmark validates the compiled predicate abstraction directly against `evalCondition(...)` instead of introducing an interpreter-only `legalMoves(...)` mode.
  - Coverage reporting is descriptive rather than threshold-gated to avoid brittle CI behavior.
- Verification:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`

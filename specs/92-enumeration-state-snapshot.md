# Spec 92 — Enumeration-Time State Snapshot

**Status**: Not started
**Dependencies**: None (independent of Specs 90-91, but composes well)
**Blocked by**: None
**Enables**: Faster condition and value evaluation during legal move enumeration
by pre-materializing commonly queried state metrics

## Problem

Within a single `legalMoves` call, the game state does not change. Yet each
pipeline action's evaluation independently queries the same state properties:

- Pipeline legality conditions call `evalCondition → evalValue → resolveRef`
  to read global variables, per-player variables, and aggregate token counts
- Pipeline cost conditions do the same
- Decision sequence probing (via `legalChoicesDiscover`) evaluates cost effects
  that also read the same state properties
- Actor/executor resolution reads player state
- Free operation grant analysis reads turn flow state

For FITL with 20 pipeline actions per legalMoves call, the SAME global variable
lookups, per-player variable lookups, and aggregate queries are independently
evaluated 20+ times against the identical state.

### Specific Redundancy Examples

1. **Global variable reads**: A pipeline legality condition checks
   `state.globalVars.monsoon === true`. This is evaluated via:
   `evalCondition → evalValue → resolveRef(gvar) → state.globalVars[name]`.
   Five function calls + AST dispatch for a single property access. Repeated
   20 times per legalMoves call = 100 function calls for 20 property accesses.

2. **Aggregate counts**: A legality condition checks "count of NVA troops in
   provinces > 3". This involves `evalQuery` iterating ALL province zones,
   filtering tokens, counting matches. If 5 pipeline actions share conditions
   that query NVA troop counts (across different zones or with different
   thresholds), the zone iteration is repeated 5 times.

3. **Per-player resources**: Multiple pipeline cost conditions check whether the
   active player has enough resources. Each check traverses the same
   `resolveRef(pvar) → resolveSinglePlayerSel → state.perPlayerVars[player][name]`
   chain.

### Why Per-Call Caching Doesn't Work

From the `fitl-perf-optimization` campaign:
- Adding WeakSet/WeakMap caches to kernel-execution-path functions (exp-012)
  causes V8 deoptimization (+12.9% regression)
- Adding fields to hot-path objects causes hidden class deoptimization
- Cross-module imports cause catastrophic deoptimization (+13%)

The kernel computation functions CANNOT be modified to add caching. The caching
must happen at a HIGHER level — outside the kernel execution path.

## Objective

At the start of each `enumerateRawLegalMoves` call, materialize
frequently-queried state metrics into a flat "state snapshot" object. Pipeline
predicate evaluators read from this snapshot instead of traversing the AST
interpreter chain.

The snapshot is:
- A local variable in `enumerateRawLegalMoves` (not on any kernel object)
- Computed once per legalMoves call
- Read-only (no mutation)
- Discarded when the function returns

## Design

### Snapshot Structure

```typescript
interface EnumerationStateSnapshot {
  /** All global variable values, keyed by variable name. */
  readonly globalVars: Readonly<Record<string, number | boolean | string>>;

  /** Active player's per-player variable values, keyed by variable name. */
  readonly activePlayerVars: Readonly<Record<string, number | boolean | string>>;

  /** Per-zone token counts by token type (or total). Lazily computed. */
  readonly zoneTotals: ReadonlyMap<string, number>;

  /** Active player ID (avoids repeated state.activePlayer access). */
  readonly activePlayer: PlayerId;
}
```

The snapshot captures the state properties most frequently accessed during
pipeline predicate evaluation. The exact set of materialized properties is
determined by profiling which `resolveRef` and `evalQuery` calls are most
frequent.

### Integration Strategy

The snapshot is NOT threaded through `evalCondition` or `resolveRef` — that
would require modifying kernel computation functions (proven unsafe). Instead,
the snapshot is used at the PIPELINE VIABILITY POLICY level:

```typescript
// In pipeline-viability-policy.ts or a new file

export const evaluateDiscoveryPipelinePredicateWithSnapshot = (
  action: ActionDef,
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
  snapshot: EnumerationStateSnapshot,
  options?: { readonly includeCostValidation?: boolean },
): DiscoveryPipelinePredicateStatus => {
  // Try snapshot-based fast evaluation
  const snapshotResult = tryEvaluateFromSnapshot(pipeline, snapshot);
  if (snapshotResult !== null) {
    return snapshotResult;
  }
  // Fallback to standard interpreter
  return evaluateDiscoveryCheckpointPredicateStatus(
    action, pipeline.id, pipeline, pipeline.atomicity, evalCtx, options,
  );
};
```

The `tryEvaluateFromSnapshot` function pattern-matches the pipeline's legality
and cost conditions against known snapshot-evaluable patterns — similar to
Spec 90's condition compilation, but operating on a pre-materialized snapshot
rather than compiling closures.

### Key Distinction from Spec 90

Spec 90 compiles conditions into closures at `createGameDefRuntime` time. The
closures still read state properties via `state.globalVars[name]` at call time.

This spec MATERIALIZES the state properties ONCE at the start of legalMoves,
then provides them as flat lookups. The difference matters when:
- The same property is read by multiple pipeline actions (materialization
  eliminates redundant property access chains)
- Aggregate queries iterate zones/tokens (materialization does the iteration
  once, not once per pipeline action)

**Composition**: Spec 90 closures can read from the snapshot instead of from
raw state, combining both optimizations.

### What the Snapshot Does NOT Replace

- Full effect execution in decision sequence probing (the snapshot helps
  pipeline PREDICATE evaluation, not the partial effect execution in
  `legalChoicesDiscover`)
- Agent template completion (operates on different state per move)
- Classification probes (use discovery cache from Spec 87)
- Free operation enumeration (uses different state variants per grant)

### V8 Safety Analysis

- The snapshot is a LOCAL VARIABLE in `enumerateRawLegalMoves` — no changes to
  function signatures of kernel computation functions
- The snapshot is a plain object with a consistent hidden class (created once
  per call, always the same shape)
- `tryEvaluateFromSnapshot` is a NEW function in the preflight path — callee
  modification is the proven safe pattern from the campaign (exp-005, exp-006)
- No changes to `evalCondition`, `evalValue`, `resolveRef`, or any kernel
  execution path
- No fields added to GameDefRuntime, ReadContext, EffectCursor, or Move

### Snapshot Computation Cost

Computing the snapshot involves:
- Copying `state.globalVars` reference: O(1) — globalVars is already an object
- Copying `state.perPlayerVars[activePlayer]` reference: O(1)
- Zone token count aggregation: O(zones × tokens) — same cost as ONE aggregate
  query, amortized across 20+ pipeline actions that would each do the same query

For FITL with ~40 zones and ~200 tokens, the aggregation is ~8,000 operations
ONCE per legalMoves call. Without the snapshot, 5+ pipeline actions might each
run similar queries = ~40,000 operations. Net savings: ~32,000 operations per
legalMoves call × 600 calls = ~19.2M operations saved per benchmark.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Snapshot is computed from generic state properties (globalVars, perPlayerVars, zones). No game-specific knowledge. The pattern-matching in `tryEvaluateFromSnapshot` operates on generic ConditionAST patterns. |
| F5 (Determinism) | Snapshot is a read-only view of immutable state. Produces identical results to direct state queries. |
| F6 (Bounded Computation) | Snapshot computation is O(zones × tokens) — bounded by the finite game state. |
| F7 (Immutability) | Snapshot is created as a new object, never mutated. State is never modified. |
| F8 (Compiler-Kernel Boundary) | This is a kernel-level optimization. No compiler changes. |
| F10 (Completeness) | Addresses root cause (redundant state queries across pipeline actions) rather than symptom. |
| F11 (Testing as Proof) | Equivalence test: verify snapshot-based evaluation matches interpreter evaluation for all pipeline predicates across N random states. |

## Acceptance Criteria

1. Snapshot is computed once per `enumerateRawLegalMoves` call.
2. Pipeline predicate evaluation uses the snapshot when conditions match
   known patterns.
3. Snapshot-based evaluation produces identical results to interpreter-based
   evaluation (proven by equivalence test).
4. Unrecognized conditions fall through to the interpreter.
5. No fields added to any hot-path kernel object.
6. All existing tests pass without weakening assertions.
7. Performance benchmark shows measurable improvement.

## Estimated Impact

**Conservative estimate: 3-8% reduction in total benchmark time.**

Pipeline predicate evaluation accounts for ~13% of total runtime. The snapshot
eliminates redundant state access across pipeline actions (20 actions sharing
~5 common state queries → 1 snapshot computation + 20 flat lookups vs. 100
interpreter traversals). The savings are proportional to the overlap in state
queries across pipeline actions.

If combined with Spec 90 (compiled conditions reading from the snapshot), the
combined impact could reach 10-15%.

## Files to Create

- `packages/engine/src/kernel/enumeration-snapshot.ts` — snapshot creation and
  pattern-matched evaluation

## Files to Modify

- `packages/engine/src/kernel/legal-moves.ts` — create snapshot at top of
  `enumerateRawLegalMoves`, pass to pipeline predicate evaluation
- `packages/engine/src/kernel/pipeline-viability-policy.ts` — add
  snapshot-aware evaluation path
- `packages/engine/test/unit/` — add equivalence tests
- `packages/engine/test/integration/` — add benchmark test

## Composition with Other Specs

- **Spec 90 (Compiled Conditions)**: Compiled closures can read from the
  snapshot's flat property maps instead of traversing `state.globalVars[name]`.
  This eliminates even the compiled closure's property access overhead.
- **Spec 91 (First-Decision-Domain)**: The snapshot's zone token counts can
  be used by first-decision domain checks to determine if a zone-based decision
  has any qualifying tokens, without re-iterating zones.
- **Spec 87 (Unified Viability Pipeline)**: The discovery cache from Spec 87
  operates at the effect-execution level. The snapshot operates at the
  predicate-evaluation level. They address different redundancy sources and
  compose multiplicatively.

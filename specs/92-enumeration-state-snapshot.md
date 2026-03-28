# Spec 92 — Enumeration-Time State Snapshot

**Status**: Not started
**Dependencies**: Spec 90 (compiled condition predicates) — snapshot feeds compiled closures
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

4. **Zone variables**: FITL pipeline conditions frequently check support and
   opposition levels in specific zones via
   `resolveRef(zoneVar) → resolveSingleZoneSel → state.zoneVars[zoneId][name]`.
   Multiple pipeline actions query the same zone's support level, each paying
   the 5-6 call depth cost independently.

5. **Marker states**: FITL conditions check control markers via
   `resolveRef(markerState) → resolveMapSpaceId → state.markers[spaceId][marker]`.
   Control markers influence multiple pipeline legality conditions.

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
frequently-queried state metrics into a flat "state snapshot" object. Spec 90's
compiled condition predicates read from this snapshot instead of traversing
raw state property chains.

The snapshot is:
- A local variable in `enumerateRawLegalMoves` (not on any kernel object)
- Computed once per legalMoves call
- Read-only (no mutation)
- Discarded when the function returns

## Design

### Snapshot Structure

```typescript
interface EnumerationStateSnapshot {
  /** All global variable values, keyed by variable name. Eager — O(1) reference copy. */
  readonly globalVars: Readonly<Record<string, number | boolean | string>>;

  /** All per-player variable values, keyed by player ID then variable name. Eager — O(1) reference copy. */
  readonly perPlayerVars: GameState['perPlayerVars'];

  /**
   * Lazy per-zone token counts with composite keys.
   *
   * Key formats:
   *   - `"zoneId:tokenType"` — count of tokens with that type in that zone
   *   - `"zoneId:*"` — total token count in that zone
   *
   * First access for a key computes and caches the count. Subsequent
   * accesses are O(1) Map lookups.
   */
  readonly zoneTotals: LazyZoneTotals;

  /**
   * Lazy zone variable accessor.
   *
   * `zoneVars.get(zoneId, varName)` returns the zone variable value.
   * First access for a (zoneId, varName) pair reads from state and caches.
   */
  readonly zoneVars: LazyZoneVars;

  /**
   * Lazy marker state accessor.
   *
   * `markerStates.get(spaceId, markerName)` returns the marker state value.
   * First access for a (spaceId, markerName) pair reads from state and caches.
   */
  readonly markerStates: LazyMarkerStates;
}
```

#### Lazy Accessor Types

```typescript
interface LazyZoneTotals {
  /** Get token count for the given composite key. Computes on first access. */
  get(key: string): number;
}

interface LazyZoneVars {
  /** Get zone variable value. Computes on first access for this (zone, var) pair. */
  get(zoneId: string, varName: string): number | boolean | string | undefined;
}

interface LazyMarkerStates {
  /** Get marker state value. Computes on first access for this (space, marker) pair. */
  get(spaceId: string, markerName: string): number | string | undefined;
}
```

Each lazy accessor is backed by a `Map<string, T>` that fills on first access.
The lazy implementation is a plain closure over the backing Map and the source
state — no class instances, no prototype chains, consistent V8 hidden class.

### Integration Strategy: Snapshot Feeds Compiled Closures

The snapshot does NOT introduce a separate evaluation path. Instead, it enriches
the existing Spec 90 compiled predicate fast path.

**Step 1 — Extend compiled predicate signature**:

```typescript
// condition-compiler.ts — updated type
export type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
  snapshot?: EnumerationStateSnapshot,
) => boolean;
```

The `snapshot` parameter is optional. When present, compiled closures prefer
snapshot reads over raw state reads. When absent (for call sites outside the
legal-moves enumeration path), closures read from raw state.

**Step 2 — Compiled closures read from snapshot**:

When `tryCompileCondition` compiles a condition like `gvar.monsoon == true`,
the generated closure becomes:

```typescript
// Before (Spec 90 only):
(state, activePlayer, _bindings) =>
  state.globalVars['monsoon'] === true;

// After (Spec 90 + Spec 92):
(state, activePlayer, _bindings, snapshot) =>
  (snapshot ? snapshot.globalVars['monsoon'] : state.globalVars['monsoon']) === true;
```

For zone-level queries, the closure uses the lazy accessor:

```typescript
// Compiled aggregate: count(tokens in zone_X with type NVA_troop) > 3
(state, activePlayer, _bindings, snapshot) =>
  (snapshot
    ? snapshot.zoneTotals.get('zone_X:NVA_troop')
    : countTokensInZone(state, 'zone_X', 'NVA_troop')
  ) > 3;
```

**Step 3 — Thread snapshot through invocation**:

```typescript
// pipeline-viability-policy.ts — evaluateCompiledPredicate updated
const evaluateCompiledPredicate = (
  condition: Exclude<ConditionAST, boolean>,
  evalCtx: ReadContext,
  snapshot?: EnumerationStateSnapshot,
): boolean | undefined => {
  const compiled = getCompiledPipelinePredicates(evalCtx.def).get(condition);
  if (compiled === undefined) {
    return undefined;
  }
  return compiled(evalCtx.state, evalCtx.activePlayer, evalCtx.bindings, snapshot);
};
```

The snapshot is passed from `enumerateRawLegalMoves` through to the pipeline
viability evaluation calls. When evaluating outside legalMoves (e.g., during
effect execution), no snapshot is provided and closures fall back to raw state.

### Key Distinction from Spec 90

Spec 90 compiles conditions into closures at `createGameDefRuntime` time. The
closures still read state properties via `state.globalVars[name]` at call time.

This spec MATERIALIZES the state properties ONCE at the start of legalMoves,
then provides them through the snapshot. The difference matters when:
- The same property is read by multiple pipeline actions (materialization
  eliminates redundant property access chains across actions)
- Aggregate queries iterate zones/tokens (lazy materialization does the
  iteration once, not once per pipeline action)
- Zone variable and marker state lookups traverse resolution chains
  (snapshot caches the resolved values)

**Composition**: Spec 90 closures read from the snapshot when available. The
compiled closure still skips the AST interpreter chain (Spec 90's win), AND
it reads from pre-materialized/cached state (Spec 92's win). Both optimizations
compose — Spec 90 eliminates interpreter overhead, Spec 92 eliminates redundant
state access across pipeline actions.

### What the Snapshot Does NOT Replace

- Full effect execution in decision sequence probing (the snapshot helps
  pipeline PREDICATE evaluation, not the partial effect execution in
  `legalChoicesDiscover`)
- Agent template completion (operates on different state per move)
- Classification probes (use discovery cache from Spec 87)
- Free operation enumeration (uses different state variants per grant)
- Non-compiled conditions (conditions that `tryCompileCondition` returns null
  for — these still use the interpreter fallback and do NOT access the snapshot)

### V8 Safety Analysis

- The snapshot is a LOCAL VARIABLE in `enumerateRawLegalMoves` — no changes to
  function signatures of kernel computation functions
- The snapshot is a plain object with a consistent hidden class (created once
  per call, always the same shape)
- The `CompiledConditionPredicate` signature adds an optional trailing parameter
  — V8 handles optional parameters efficiently (undefined if not provided)
- `evaluateCompiledPredicate` gains one optional parameter — this is a callee
  in the preflight path, proven safe from the campaign (exp-005, exp-006)
- No changes to `evalCondition`, `evalValue`, `resolveRef`, or any kernel
  execution path functions
- No fields added to GameDefRuntime, ReadContext, EffectCursor, or Move
- Lazy accessors use plain Map + closure pattern — no class instances or
  prototype lookups that could cause hidden class polymorphism

### Snapshot Computation Cost

Computing the snapshot involves:
- Copying `state.globalVars` reference: O(1) — globalVars is already an object
- Copying `state.perPlayerVars` reference: O(1)
- Creating lazy accessor closures: O(1) — just closure allocation, no iteration
- Zone token count (lazy, per access): O(tokens in zone) per unique key
- Zone variable (lazy, per access): O(1) per unique (zone, var) pair
- Marker state (lazy, per access): O(1) per unique (space, marker) pair

For FITL with ~40 zones and ~200 tokens:
- If 5 pipeline actions query the same zone token count → 1 lazy computation
  + 4 cache hits vs. 5 independent evalQuery traversals
- If 10 pipeline actions read the same global variable → 10 flat object
  property accesses vs. 10 × 5-call-depth interpreter traversals
- Net savings scale with the overlap in state queries across pipeline actions

### Snapshot Creation

```typescript
// enumeration-snapshot.ts

export const createEnumerationSnapshot = (
  def: GameDef,
  state: GameState,
): EnumerationStateSnapshot => ({
  globalVars: state.globalVars,
  perPlayerVars: state.perPlayerVars,
  zoneTotals: createLazyZoneTotals(state, def),
  zoneVars: createLazyZoneVars(state),
  markerStates: createLazyMarkerStates(state),
});
```

Lazy factory implementations use a backing `Map<string, T>` and a closure that
computes on first access:

```typescript
const createLazyZoneTotals = (state: GameState, def: GameDef): LazyZoneTotals => {
  const cache = new Map<string, number>();
  return {
    get(key: string): number {
      let cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      cached = computeZoneTotal(state, def, key);
      cache.set(key, cached);
      return cached;
    },
  };
};
```

The `computeZoneTotal` function parses the composite key (`zoneId:tokenType` or
`zoneId:*`) and iterates the appropriate zone's tokens once.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Snapshot is computed from generic state properties (globalVars, perPlayerVars, zones, zoneVars, markers). No game-specific knowledge. Lazy accessors operate on generic zone/marker IDs. |
| F2 (Evolution-First) | No impact — snapshot is a runtime optimization, not a data model change. |
| F3 (Visual Separation) | No impact — snapshot is engine-only, no visual data. |
| F4 (Schema Ownership) | No new schemas. Snapshot is an internal kernel type. |
| F5 (Determinism) | Snapshot is a read-only view of immutable state. Compiled closures produce identical results whether reading from snapshot or raw state. Equivalence test proves this. |
| F6 (Bounded Computation) | Lazy computation per unique key is bounded by the finite game state. No unbounded iteration. |
| F7 (Immutability) | Snapshot is created as a new object, never mutated. Lazy caches are write-once per key (internal implementation detail — external contract is read-only). Exception clause from F7 applies: lazy cache mutation is scoped to a single synchronous call, not observable externally. |
| F8 (Compiler-Kernel Boundary) | This is a kernel-level optimization. No compiler changes. The snapshot is created and consumed entirely within the kernel's legal-moves enumeration path. |
| F9 (No Backwards Compatibility) | The `CompiledConditionPredicate` signature change is a clean extension (optional parameter). All consumers are updated in the same change. No compatibility shims. |
| F10 (Completeness) | Addresses root cause (redundant state queries across pipeline actions) rather than symptom. Integrates cleanly with existing Spec 90 compiled predicate architecture. |
| F11 (Testing as Proof) | Equivalence test: verify compiled-with-snapshot evaluation matches compiled-without-snapshot evaluation for all pipeline predicates across N random states. Benchmark proves performance. |
| F12 (Branded Types) | Snapshot no longer privileges one `PlayerId`; compiled `pvar(active)` accessors still resolve a branded invocation player and index `perPlayerVars` with it. Zone and marker keys are strings matching existing kernel conventions. |

## Acceptance Criteria

1. Snapshot is computed once per `enumerateRawLegalMoves` call.
2. Compiled condition predicates (Spec 90) accept an optional snapshot parameter
   and prefer snapshot reads when available.
3. Compiled-with-snapshot evaluation produces identical results to
   compiled-without-snapshot evaluation for all pipeline predicates (proven by
   equivalence test across N random states).
4. Non-compiled conditions (interpreter fallback) are unaffected — they do not
   access the snapshot.
5. No fields added to any hot-path kernel object (GameDefRuntime, ReadContext,
   EffectCursor, Move).
6. All existing tests pass without weakening assertions.
7. Performance benchmark shows >=1% improvement in combined_duration_ms, OR
   equivalence test passes AND benchmark shows no regression (within +/-1%
   of baseline). Rationale: the snapshot's primary value is compositional
   (feeding Spec 90 closures); standalone impact may be below the noise floor,
   but correctness + no regression is sufficient to land.
8. Lazy accessors compute each unique key at most once per legalMoves call.

## Estimated Impact

**Conservative estimate: 3-8% reduction in total benchmark time.**

Pipeline predicate evaluation accounts for ~13% of total runtime. The snapshot
eliminates redundant state access across pipeline actions (20 actions sharing
~5 common state queries → 1 snapshot computation + 20 flat lookups vs. 100
interpreter traversals). With zone variables and marker states included, the
coverage extends beyond simple global/player var reads to the full set of
commonly-queried state dimensions.

If combined with Spec 91 (first-decision domain closures also reading from the
snapshot), the combined impact could reach 10-15%.

## Files to Create

- `packages/engine/src/kernel/enumeration-snapshot.ts` — snapshot type
  definitions, `createEnumerationSnapshot`, and lazy accessor factories
  (`createLazyZoneTotals`, `createLazyZoneVars`, `createLazyMarkerStates`)

## Files to Modify

- `packages/engine/src/kernel/condition-compiler.ts` — extend
  `CompiledConditionPredicate` type to accept optional `snapshot` parameter;
  update compiled closures to prefer snapshot reads when snapshot is present
- `packages/engine/src/kernel/compiled-condition-cache.ts` — no structural
  changes needed (type flows from condition-compiler)
- `packages/engine/src/kernel/pipeline-viability-policy.ts` — thread snapshot
  through `evaluateCompiledPredicate` and the discovery predicate evaluation
  functions
- `packages/engine/src/kernel/legal-moves.ts` — create snapshot at top of
  `enumerateRawLegalMoves`, pass to pipeline predicate evaluation calls
- `packages/engine/test/unit/` — add equivalence tests (compiled-with-snapshot
  vs. compiled-without-snapshot for all pipeline predicates)
- `packages/engine/test/integration/` — add benchmark regression test

## Composition with Other Specs

- **Spec 90 (Compiled Conditions)**: Direct composition — compiled closures
  accept the snapshot as an optional parameter and prefer snapshot reads. The
  compiled closure skips the AST interpreter chain (Spec 90's win) AND reads
  from pre-materialized/cached state (Spec 92's win). Both optimizations
  compose multiplicatively.
- **Spec 91 (First-Decision-Domain)**: First-decision domain closures can also
  accept the snapshot. Zone token counts from `snapshot.zoneTotals` feed
  directly into domain checks that determine if a zone-based decision has
  qualifying tokens, eliminating redundant zone iteration. This requires
  extending the first-decision domain closure signature similarly to Spec 90's.
- **Spec 87 (Unified Viability Pipeline)**: The discovery cache from Spec 87
  operates at the effect-execution level. The snapshot operates at the
  predicate-evaluation level. They address different redundancy sources and
  compose independently.

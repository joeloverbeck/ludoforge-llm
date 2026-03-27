# Spec 87 -- Unified Viability Pipeline

## Status

Completed (archived 2026-03-27)

## Problem

The legal move pipeline runs partial effect execution multiple times per move
per game step. The `legalChoicesDiscover` function — which runs the full effect
chain up to the first decision point — is the dominant per-call cost.

### Redundancy Analysis

There are three stages where partial effect execution occurs:

1. **Enumeration**: `isMoveDecisionSequenceAdmittedForLegalMove` calls
   `classifyDecisionSequenceSatisfiability` → `legalChoicesDiscover` to check
   decision-sequence satisfiability.
2. **Classification**: `probeMoveViability` calls `resolveMoveDecisionSequence`
   → `legalChoicesDiscover` to resolve the decision sequence and produce a
   `MoveViabilityProbeResult`.
3. **Agent completion**: `evaluatePlayableMoveCandidate` runs the full effect
   chain a third time to resolve decisions via agent choice.

Profiling from the `fitl-perf-optimization` campaign (12 experiments) showed:

- 96% of `legalMoves` cost is enumeration (step 1), only 4% is classification
  (step 2).
- Probes are 5-10x cheaper than agent completions, so bypassing probes to
  shift work to agents makes things worse (exp-012: +6.5% regression).
- Micro-optimizations (caching, object shape changes, spread elimination)
  consistently fail due to V8 hidden class sensitivity.
- The only successful optimizations were **structural work elimination**:
  removing hidden call paths (exp-006: -41%) and reducing redundant agent work
  (exp-008: -9.4%).

### Where Redundancy Exists

**Event moves**: During enumeration, `isMoveDecisionSequenceAdmittedForLegalMove`
(legal-moves.ts:1057) calls `legalChoicesDiscover(def, state, move)`. During
classification, `probeMoveViability` calls `resolveMoveDecisionSequence` which
calls `legalChoicesDiscover(def, state, move)` on the SAME `(def, state, move)`
tuple. The first `legalChoicesDiscover` call (on the base move) is duplicated.

### Where Redundancy Does NOT Exist

**Pipeline action variants**: Enumeration checks the TEMPLATE move
`{ actionId: action.id, params: {} }` (legal-moves.ts:1228). Classification
probes each PARAMETERIZED variant with specific params. These are different
moves — no `legalChoicesDiscover` call overlap.

**Plain actions in production**: `probePlainActionFeasibility` defaults to
`false` (legal-moves.ts:1094). No production caller (`simulator.ts:118`,
`phase-advance.ts:490`) enables it. Plain actions skip the enumeration
decision-sequence check entirely, so there is no enumeration↔classification
redundancy for them.

**Free operation moves**: These use `classifyMoveDecisionSequenceAdmissionForLegalMove`
on `candidateState` (not `state`), which differs from the state used during
classification. No safe cache reuse.

## Objective

Eliminate redundant `legalChoicesDiscover` calls between enumeration and
classification for event moves by caching discovery results during enumeration
and making them available to the probe during classification.

## Design

### Core Principle

Cache the result of `legalChoicesDiscover(def, state, baseMove)` when it is
first called during enumeration. During classification, inject the cache into
`resolveMoveDecisionSequence` so its first `legalChoicesDiscover` call is a
cache hit. All other validation steps in `probeMoveViability` still execute —
no probe bypass, no correctness loss.

### Why Not Bypass the Probe

`probeMoveViability` (apply-move.ts:1659-1797) performs 7 validation steps
BEFORE calling `resolveMoveDecisionSequence`:

1. Turn flow action class validation (line 1668)
2. Free operation analysis and denial (line 1675-1682)
3. Required pending free-operation grant check (line 1684-1691)
4. Preflight context resolution (line 1695)
5. Action precondition evaluation (line 1708)
6. Parameter domain validation (line 1712-1719)
7. Turn flow window access validation (line 1721)

And 1 step AFTER:

8. Free operation outcome policy validation (line 1744-1759)

Bypassing the probe would skip all of these. The enumeration pipeline does NOT
guarantee that all probe validations pass — some enumerated moves are rejected
by the probe (tracked via `MOVE_ENUM_PROBE_REJECTED` warnings in the parity
test). The probe MUST still run.

Additionally, `DecisionSequenceSatisfiabilityResult` only carries
`{ classification, warnings }` — it lacks the `complete` flag, resolved move
(with decision params filled in), `nextDecision`, `nextDecisionSet`,
`stochasticDecision`, and `trustedMove` data that `ClassifiedMove` requires.
Only `resolveMoveDecisionSequence` produces this rich result.

### Data Flow

```
enumerateLegalMoves:
  discoveryCache = new Map<Move, ChoiceRequest>()

  enumerateRawLegalMoves:
    creates cachedDiscoverer wrapping legalChoicesDiscover:
      on first call per Move object: call legalChoicesDiscover, store in cache
      on subsequent calls: return cached result

    for event moves:
      classifyDecisionSequenceSatisfiability uses cachedDiscoverer
        → first legalChoicesDiscover(baseMove) result stored in discoveryCache
      isMoveDecisionSequenceAdmittedForLegalMove decision unchanged

    for pipeline templates:
      classifyDecisionSequenceSatisfiability uses cachedDiscoverer
        → template move { actionId, params: {} } result cached
        → (but parameterized variants are different moves — no cache hit later)

    applyTurnFlowWindowFilters
      → returns subset of same Move object references

  classifyEnumeratedMoves (receives discoveryCache):
    for each surviving move:
      if alwaysComplete → push (unchanged)
      else → probeMoveViabilityWithCache(def, state, move, runtime, discoveryCache)
        → all 7 pre-decision validations execute (full correctness)
        → resolveMoveDecisionSequence checks discoveryCache before legalChoicesDiscover
        → for event moves: cache hit on first legalChoicesDiscover(baseMove) call
        → for pipeline variants: cache miss (different move), falls through to normal call
        → all post-decision validations execute
        → returns full MoveViabilityProbeResult (complete, resolved move, decisions, etc.)
```

### Implementation Strategy

**Critical V8 constraint**: Adding fields to Move, MoveEnumerationState,
ClassifiedMove, or any hot-path object causes 2-7% regression due to V8
hidden class deoptimization. The cache MUST be stored in a **parallel data
structure** external to the hot-path objects.

#### Step 1: Discovery cache type

```typescript
// In a new file or in move-decision-sequence.ts
export type DiscoveryCache = Map<Move, ChoiceRequest>;
```

The Map is keyed by Move **object reference** (not identity key string). This
works because:
- Enumeration creates Move objects and pushes them to the moves array
- `applyTurnFlowWindowFilters` returns a filtered array with the same Move
  object references (it calls `Array.prototype.filter`, preserving references)
- Classification iterates the filtered array — same Move objects

#### Step 2: Cached discoverer wrapper in enumeration

Create the cache in `enumerateRawLegalMoves` and wrap `legalChoicesDiscover`:

```typescript
const enumerateRawLegalMoves = (
  def: GameDef,
  state: GameState,
  options?: LegalMoveEnumerationOptions,
  runtime?: GameDefRuntime,
): RawLegalMoveEnumerationResult & { readonly discoveryCache: DiscoveryCache } => {
  const discoveryCache: DiscoveryCache = new Map();

  // Wrap legalChoicesDiscover to cache first call per move object
  const cachedDiscover: DecisionSequenceChoiceDiscoverer = (move, discoverOptions) => {
    const cached = discoveryCache.get(move);
    if (cached !== undefined) return cached;
    const result = legalChoicesDiscover(def, state, move, {
      ...(discoverOptions?.onDeferredPredicatesEvaluated === undefined
        ? {}
        : { onDeferredPredicatesEvaluated: discoverOptions.onDeferredPredicatesEvaluated }),
    }, runtime);
    discoveryCache.set(move, result);
    return result;
  };

  // Pass cachedDiscover to classifyMoveDecisionSequenceSatisfiability calls
  // ... rest of enumeration logic unchanged ...

  return { moves: finalMoves, warnings, discoveryCache };
};
```

#### Step 3: Thread cache to classifyDecisionSequenceSatisfiability

`classifyMoveDecisionSequenceSatisfiability` already accepts a custom discoverer
indirectly — it constructs one internally (move-decision-sequence.ts:191-198).
Add an optional `discoverer` override:

```typescript
export const classifyMoveDecisionSequenceSatisfiability = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: Omit<ResolveMoveDecisionSequenceOptions, 'choose'> & {
    readonly discoverer?: DecisionSequenceChoiceDiscoverer;
  },
  runtime?: GameDefRuntime,
): MoveDecisionSequenceSatisfiabilityResult => {
  const discover = options?.discoverer ?? ((move, discoverOptions) =>
    legalChoicesDiscover(def, state, move, { ... }, runtime));
  return classifyDecisionSequenceSatisfiability(baseMove, discover, { ... });
};
```

#### Step 4: Thread cache to resolveMoveDecisionSequence

Similarly, add an optional `discoveryCache` to `ResolveMoveDecisionSequenceOptions`:

```typescript
export interface ResolveMoveDecisionSequenceOptions {
  readonly choose?: DecisionSequenceChooseFunction;
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly onWarning?: (warning: RuntimeWarning) => void;
  readonly discoveryCache?: DiscoveryCache;  // NEW — optional cache
}
```

In `resolveMoveDecisionSequence`, check the cache before calling
`legalChoicesDiscover`:

```typescript
for (let step = 0; step < maxSteps; step += 1) {
  const cached = options?.discoveryCache?.get(move);
  const request = cached ?? legalChoicesDiscover(def, state, move, { ... }, runtime);
  // ... rest unchanged ...
}
```

#### Step 5: Thread cache through classification

In `enumerateLegalMoves`, pass the cache from enumeration to classification:

```typescript
export const enumerateLegalMoves = (def, state, options?, runtime?) => {
  const { moves, warnings: rawWarnings, discoveryCache } =
    enumerateRawLegalMoves(def, state, options, runtime);
  const warnings = [...rawWarnings];
  return {
    moves: classifyEnumeratedMoves(def, state, moves, warnings, runtime, discoveryCache),
    warnings,
  };
};
```

In `classifyEnumeratedMoves`, pass the cache to `probeMoveViability`:

```typescript
const classifyEnumeratedMoves = (
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  warnings: RuntimeWarning[],
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): readonly ClassifiedMove[] => {
  // ... for each move ...
  const viability = probeMoveViability(def, state, move, runtime, discoveryCache);
  // ... rest unchanged ...
};
```

#### Step 6: probeMoveViability accepts optional cache

Add `discoveryCache` as an optional parameter (internal use only — not exported
in the public overload):

```typescript
export const probeMoveViability = (
  def: GameDef,
  state: GameState,
  move: Move,
  runtime?: GameDefRuntime,
  discoveryCache?: DiscoveryCache,
): MoveViabilityProbeResult => {
  // ... all 7 pre-decision validations unchanged ...

  const sequence = resolveMoveDecisionSequence(
    def, state, move,
    { choose: () => undefined, discoveryCache },
    runtime,
  );
  // ... all post-decision validations unchanged ...
};
```

### What This Does NOT Change

- The `probeMoveViability` public API behavior (cache is optional, defaults to
  no-cache).
- The `isMoveDecisionSequenceAdmittedForLegalMove` function (still available
  for other callers).
- Any hot-path object shape (Move, MoveEnumerationState, EffectCursor,
  ReadContext, GameDefRuntime, ClassifiedMove).
- The parity test contract (`classified-move-parity.test.ts`): classified
  moves will have the same actionIds, viability, and count as before.
- The external `enumerateLegalMoves` return type.
- All 8 validation steps in `probeMoveViability` (probe is never bypassed).

### V8 Safety Analysis

- No fields added to hot-path objects (Map is a local variable in
  `enumerateRawLegalMoves`, threaded as a function parameter).
- No changes to closure scope in tight loops.
- No WeakMap (proven slower in this codebase).
- The cache Map is created once per `enumerateLegalMoves` call and discarded
  after classification completes.
- `ResolveMoveDecisionSequenceOptions` is an options bag (cold path) — adding
  an optional field does not affect hot-path object shapes.
- Move object references used as Map keys — no identity key computation cost.

### Composition with Specs 88 and 89

- **Spec 88 (phase-aware action filtering)**: Reduces the number of actions
  enumerated. Fewer actions = fewer `isMoveDecisionSequenceAdmittedForLegalMove`
  calls = smaller discovery cache. The two optimizations compose cleanly.
- **Spec 89 (scoped mutable execution context)**: Reduces per-call overhead of
  effect execution including `legalChoicesDiscover`. When both optimizations
  are active, each `legalChoicesDiscover` call is cheaper (Spec 89) AND
  redundant calls are eliminated (Spec 87).

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Generic pipeline — no game-specific logic |
| F5 (Determinism) | Same result as current — cache hit returns identical `ChoiceRequest`, determinism preserved |
| F6 (Bounded Computation) | Reduces total bounded work per step |
| F7 (Immutability) | Cache is scoped to a single synchronous `enumerateLegalMoves` call. `ChoiceRequest` objects are readonly. No external mutation. |
| F8 (Compiler-Kernel Boundary) | Change is kernel-internal, no compiler impact |
| F9 (No Backwards Compat) | Adds optional cache parameter, no shims or aliases |
| F10 (Completeness) | Addresses root cause (redundant `legalChoicesDiscover` calls), not symptom |
| F11 (Testing as Proof) | Parity test proves equivalence with current behavior |
| F12 (Branded Types) | No new ID types introduced |

## Acceptance Criteria

1. `resolveMoveDecisionSequence` checks `discoveryCache` before calling
   `legalChoicesDiscover` when a cache is provided.
2. Event moves that passed `isMoveDecisionSequenceAdmittedForLegalMove` during
   enumeration produce a cache hit during classification's
   `resolveMoveDecisionSequence` call.
3. The `classified-move-parity` integration test continues to pass (same
   classified moves, same viability, same count).
4. All existing tests pass without weakening assertions.
5. No new fields on Move, MoveEnumerationState, ClassifiedMove,
   EffectCursor, ReadContext, or GameDefRuntime.
6. `probeMoveViability` still executes all 8 validation steps for every move
   (no probe bypass).

## Estimated Impact

**Realistic estimate: ~1-3% reduction in `legalMoves` time for FITL.**

Classification accounts for ~4% of total `legalMoves` cost (per profiling).
The cache eliminates the first `legalChoicesDiscover` call in
`resolveMoveDecisionSequence` for event moves only (pipeline variants use
different Move objects). The savings are modest but architecturally clean, and
compose multiplicatively with Specs 88 and 89.

For the current best (135,857ms total, legalMoves at 106,773ms / 78.6%), a
2% reduction in legalMoves would save ~2,100ms (1.5% overall).

The primary value is architectural: the discovery cache establishes a pattern
for further deduplication (e.g., caching across pipeline template and variant
calls in future work) without correctness risk.

## Files to Modify

- `packages/engine/src/kernel/move-decision-sequence.ts` — add `DiscoveryCache`
  type, add optional `discoverer` to `classifyMoveDecisionSequenceSatisfiability`,
  add optional `discoveryCache` to `ResolveMoveDecisionSequenceOptions`, check
  cache in `resolveMoveDecisionSequence`
- `packages/engine/src/kernel/legal-moves.ts` — create cache in
  `enumerateRawLegalMoves`, wrap `legalChoicesDiscover` in cached discoverer,
  thread cache to `classifyEnumeratedMoves` and through to `probeMoveViability`
- `packages/engine/src/kernel/apply-move.ts` — add optional `discoveryCache`
  parameter to `probeMoveViability`, pass to `resolveMoveDecisionSequence`
- `packages/engine/test/` — update tests if internal signatures change;
  add unit test verifying cache hit for event moves during classification

## Future Work

The discovery cache pattern established here can be extended in future specs:

- **Pipeline variant caching**: If pipeline template and parameterized variant
  share initial effect execution paths, the cache could be extended to cache
  partial results keyed by action ID.
- **Cross-step caching**: For moves that appear in consecutive game steps with
  unchanged relevant state, the cache could persist across `enumerateLegalMoves`
  calls (requires careful invalidation based on state hash).
- **Agent completion caching**: The cache from classification could be passed
  to `evaluatePlayableMoveCandidate` to eliminate step 3 redundancy.

## Outcome

- Completion date: 2026-03-27
- What actually changed:
  - The discovery-cache architecture described here is already present in the kernel: `DiscoveryCache` is defined in `move-decision-sequence.ts`, raw enumeration creates and populates it, classification threads it into `probeMoveViability`, and probing forwards it into `resolveMoveDecisionSequence`.
  - Final closure work strengthened proof rather than rewriting architecture: a focused architecture-guard test now verifies that filtered raw-enumeration `Move` objects flow into classification without losing identity, which preserves cache-key correctness.
- Deviations from original plan:
  - The spec's implementation had largely landed before final archival work. The remaining work was reassessment, one targeted test strengthening, and verification rather than broad new kernel changes.
  - No extra indirection, aliasing, or hot-path object-shape changes were introduced.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/move-decision-sequence.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/apply-move.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/unit/kernel/legal-moves.test.ts` passed.
  - `pnpm -F @ludoforge/engine test -- test/integration/classified-move-parity.test.ts` passed.
  - `node --test dist/test/performance/policy-agent.perf.test.js` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.

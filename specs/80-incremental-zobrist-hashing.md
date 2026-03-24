# Spec 80 — Incremental Zobrist Hashing

**Status**: Draft
**Dependencies**: Spec 78 (Draft State, completed)
**Enables**: Faster simulation for all games, especially those with large state
(FITL, future complex games).

## Problem

`computeFullHash` recomputes the entire Zobrist hash from scratch on every
`applyMove` call. For Texas Hold'em with ~110 features (52 tokens + 16 global
vars + 36 per-player vars + phase/player/turn + action usage), each call takes
~29μs. Across 12,647 moves per 50-game benchmark: **~348ms (3.6% of total
simulation time)**.

Most state features do not change between moves. A simple fold modifies 1–2
variables but the hash iterates all ~110 features. The cost scales linearly
with state size: FITL has 500+ features (hundreds of zones, tokens, global
vars, per-player vars, markers) and will pay proportionally more.

### Current Architecture

```
applyMoveCore:
  1. Execute action effects    → mutates state via DraftTracker
  2. Phase advance / lifecycle → may mutate state further
  3. computeFullHash(table, progressedState) → iterates ALL features
  4. Return { ...progressedState, stateHash: hash }
```

Each `computeFullHash` call:
1. Creates a `ZobristFeature` object per feature (~110 allocations)
2. Calls `encodeFeature` to build a cache-key string (~110 template strings)
3. Does `Map.get` on the key cache (~110 lookups)
4. XORs the cached bigint into the running hash

Steps 1–3 are overhead that scales with total feature count, not with the
number of features that changed.

## Objective

Replace the per-move full-recompute with **incremental hash updates** inside
effect handlers. The running hash is carried on `MutableGameState` and updated
in-place whenever a feature changes. `computeFullHash` is only needed for
initial state creation and periodic verification.

**Target**: Eliminate ~95% of per-move hash computation cost (the ~5% that
changes between moves is updated incrementally).

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism)**: Incremental hashing is a generic
  kernel optimization. It applies to any game — no game-specific logic.
- **Foundation 5 (Determinism)**: The incremental hash must be **bit-identical**
  to the full-recompute hash. Verification tests prove this by comparing
  incremental vs. full hash for every move across multiple games and seeds.
- **Foundation 6 (Bounded Computation)**: Hash updates per effect are O(1) — a
  constant number of XOR operations regardless of state size.
- **Foundation 7 (Immutability)**: The running hash is updated within Spec 78's
  scoped-mutation exception (`MutableGameState` inside
  `applyEffectsWithBudgetState`). The external contract
  `applyMove(state) → newState` is preserved unchanged.
- **Foundation 11 (Testing)**: A dedicated verification mode re-runs
  `computeFullHash` every N moves and asserts equality with the incremental
  hash. Determinism tests already assert identical `stateHash` across runs.

## Design

### 1. Running Hash on GameState

Add a `_runningHash: bigint` field to `GameState`. This is the incrementally
maintained Zobrist hash. It is set to the full hash at initial state creation
and updated by effect handlers during execution.

```typescript
interface GameState {
  // ... existing fields ...
  readonly _runningHash: bigint;
}
```

The `stateHash` field remains as the final, published hash. At the end of
`applyMoveCore`, `stateHash` is set to `_runningHash` (instead of calling
`computeFullHash`).

### 2. ZobristTable Threading

The `ZobristTable` must be accessible from effect handlers. Two options:

**Option A** (recommended): Add `zobristTable` to `EffectEnv` (the static
portion of the effect context, created once per `applyEffects` call). This is
a single reference — zero per-effect overhead.

**Option B**: Access via `GameDefRuntime.zobristTable`, which is already
threaded via `EffectEnv.cachedRuntime`.

### 3. Hash Update Helpers

```typescript
/** XOR out the old feature and XOR in the new one. */
function updateRunningHash(
  state: MutableGameState,
  table: ZobristTable,
  oldFeature: ZobristFeature,
  newFeature: ZobristFeature,
): void {
  state._runningHash ^= zobristKey(table, oldFeature);
  state._runningHash ^= zobristKey(table, newFeature);
}

/** XOR in a new feature (e.g., token created). */
function addToRunningHash(
  state: MutableGameState,
  table: ZobristTable,
  feature: ZobristFeature,
): void {
  state._runningHash ^= zobristKey(table, feature);
}

/** XOR out a removed feature (e.g., token destroyed). */
function removeFromRunningHash(
  state: MutableGameState,
  table: ZobristTable,
  feature: ZobristFeature,
): void {
  state._runningHash ^= zobristKey(table, feature);
}
```

### 4. Effect Handlers Requiring Modification

Every effect handler that modifies hashed state features must call the
appropriate hash update helper. The full list:

| Effect | Features Modified | Update Pattern |
|--------|-------------------|----------------|
| `setVar` | globalVar or perPlayerVar | XOR out old, XOR in new |
| `addVar` | globalVar or perPlayerVar | XOR out old, XOR in new (value changes) |
| `transferVar` | Two perPlayerVars | Two XOR-out/XOR-in pairs |
| `setActivePlayer` | activePlayer | XOR out old, XOR in new |
| `moveToken` | Two tokenPlacements | XOR out old slot, XOR in new slot |
| `moveAll` | Multiple tokenPlacements | XOR out each old, XOR in each new |
| `moveTokenAdjacent` | tokenPlacement | XOR out old, XOR in new |
| `draw` | tokenPlacements (source → dest) | XOR out/in per token moved |
| `shuffle` | tokenPlacements (slot reorder) | XOR out all old, XOR in all new |
| `createToken` | tokenPlacement | XOR in new |
| `destroyToken` | tokenPlacement | XOR out old |
| `setTokenProp` | (not hashed — token props are in placement key via id only) | No update needed |
| `setMarker` | markerState | XOR out old, XOR in new |
| `shiftMarker` | markerState | XOR out old, XOR in new |
| `setGlobalMarker` | globalMarkerState | XOR out old, XOR in new |
| `flipGlobalMarker` | globalMarkerState | XOR out old, XOR in new |
| `shiftGlobalMarker` | globalMarkerState | XOR out old, XOR in new |
| `gotoPhaseExact` | currentPhase | XOR out old, XOR in new |
| `advancePhase` | currentPhase + turnCount + activePlayer | Multiple updates |
| `rollRandom` | (modifies rng only — not hashed) | No update needed |

Phase transitions (handled in `phase-advance.ts` and `phase-lifecycle.ts`)
also modify `currentPhase`, `turnCount`, `activePlayer`, and `actionUsage`.
These must update the hash when modifying state directly (outside effect
handlers).

### 5. Initial State and applyMoveCore Changes

**Initial state** (`initialState` function): Compute the full hash via
`computeFullHash` and store as both `stateHash` and `_runningHash`.

**applyMoveCore** (end of function): Replace the full-recompute with:
```typescript
const stateWithHash = {
  ...progressedState,
  stateHash: progressedState._runningHash,
};
```

### 6. Verification Mode

Add a verification option (`ExecutionOptions.verifyIncrementalHash`). When
enabled, `applyMoveCore` computes the full hash AND compares it to
`_runningHash`. If they differ, throw a determinism error with full diagnostic
context. This mode is enabled in:
- All determinism tests
- The first N moves of every test run (configurable)
- A periodic check every K moves (configurable via
  `REGRESSION_CHECK_INTERVAL`)

### 7. DraftTracker Integration

Within `applyEffectsWithBudgetState`, the `MutableGameState` is the working
copy. Hash updates are applied to this mutable copy. When the scope exits,
the final `_runningHash` on the mutable state reflects all hash changes made
during effect execution. No additional work is needed — the existing
copy-on-write pattern (Spec 78) handles propagation.

## Estimated Impact

| Game | Features | Full-recompute cost | Estimated savings |
|------|----------|---------------------|-------------------|
| Texas Hold'em | ~110 | ~348ms / 50 games | ~330ms (95%) |
| FITL | ~500+ | ~1600ms+ (estimated) | ~1520ms+ |
| Future complex games | 1000+ | Scales linearly | Larger absolute savings |

## Risks

1. **Silent determinism breakage**: If any effect handler fails to update the
   hash, the incremental hash drifts from the true hash. **Mitigation**:
   Verification mode catches this immediately. Run verification in CI.

2. **Increased coupling**: Effect handlers now depend on the hashing subsystem.
   **Mitigation**: The hash update is a single helper call per state mutation
   — mechanically straightforward.

3. **Performance of hash updates**: Each update involves `zobristKey` (cache
   lookup + potential string construction). For effects that modify many
   features (e.g., `shuffle` with 52 tokens), the per-effect cost increases.
   **Mitigation**: Only `shuffle` has high per-effect feature count; other
   effects modify 1–2 features.

## Testing Plan

1. **Parity test**: For every move in every existing determinism test, assert
   `_runningHash === computeFullHash(table, state)`.
2. **Golden hash test**: Verify that `stateHash` values in golden traces are
   unchanged (proves incremental == full for known game histories).
3. **Property test**: Random-play 1000 games, verify incremental hash every
   move.
4. **Edge cases**: Token creation/destruction, phase cycling, marker
   operations, empty zones, player elimination.

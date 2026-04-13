# Spec 128: Full-Scope Draft State for applyMove Boundary

**Status**: PROPOSED
**Priority**: P0
**Complexity**: XL
**Dependencies**: Spec 78 (scoped draft state — COMPLETED)
**Source**: `fitl-perf-optimization` campaign V8 profiling data (2026-04-13), 7 experiments across 5 prior perf campaigns

## Overview

Extend the existing `state-draft.ts` copy-on-write system from inner effect-execution scopes to the **entire `applyMove` boundary**. Convert all 61 `...state` spread sites in the kernel to use the draft system. Eliminate the remaining ~12% CPU overhead from immutable object spreads during state transitions.

### Rationale

V8 CPU profiling of FITL (the most complex game spec, 130 event cards, 40+ actions) reveals that object allocation and copying dominate runtime cost:

| V8 Builtin | CPU % | Cause |
|-----------|-------|-------|
| `Scavenger::ScavengeObject` (GC) | 4.5% | Allocation pressure from short-lived spread copies |
| `ScavengerCollector::CollectGarbage` | 1.5% | GC pauses from above |
| `CreateDataProperty` | 3.9% | Object property creation during spreads |
| `CloneObjectIC` + `CloneObjectIC_Slow` | 2.1% | Object cloning during spreads |
| **Total** | **~12%** | |

Seven experiments across the `fitl-perf-optimization` campaign proved that **any modification** to hot-path function internals causes V8 JIT deoptimization (2-5% regression per change). The only successful optimization was removing an entire redundant function call (-1.47%). The V8 JIT ceiling cannot be broken by micro-optimization — the remaining bottleneck is architectural.

### Foundation 11 Authorization

Foundation 11 (Immutability) explicitly carves out this optimization:

> *"Within a single synchronous effect-execution scope, the kernel MAY use a private draft state or copy-on-write working state for performance. That working state MUST be fully isolated from caller-visible state: no shared mutable descendants, no aliasing that can leak outside the scope, and no observation before finalization. The external contract remains `applyMove(state) -> newState`, where the input `state` is never modified. This guarantee MUST be enforced by regression tests."*

The existing Spec 78 implementation (`state-draft.ts`) satisfies these constraints within `applyEffectsWithBudgetState` scopes. This spec extends the same guarantees to the full `applyMove` boundary.

### Current State (Spec 78)

The draft system exists but its coverage is narrow:

- **Covered**: Effect handlers inside `applyEffectsWithBudgetState` — `setVar`, `moveToken`, `setMarkerState`, `createToken`, `destroyToken`
- **Not covered (61 spread sites)**:
  - `apply-move.ts` — lifecycle phase transitions, turn order updates, free operation state, hash computation boundary
  - `turn-flow-eligibility.ts` — eligibility window state updates (4 spread sites)
  - `effects-markers.ts` — global marker state transitions (6+ spread sites)
  - `effects-token.ts` — zone mutation finalization (2 spread sites outside draft scope)
  - `phase-advance.ts`, `grant-lifecycle.ts`, `event-execution.ts` — phase/grant/event state updates

These uncovered sites create new GameState objects via `{ ...state, field: newValue }` — each copying 15+ top-level properties plus nested record contents.

## Deliverables

### 1. Widen Draft Scope to applyMove Boundary

**Current scope**: `applyEffectsWithBudgetState` creates a mutable state and DraftTracker at the start of each effect execution batch. Multiple batches within a single `applyMove` each create their own draft.

**New scope**: The `applyMoveInternal` function (the single entry point for all state transitions) creates ONE mutable state + DraftTracker at the top. All downstream code — effect execution, lifecycle phase transitions, turn order updates, hash computation — operates on this single draft. The draft is frozen to immutable GameState at the `applyMoveInternal` exit.

```
BEFORE (Spec 78):
  applyMoveInternal(immutableState)
    → executeMoveAction(immutableState)
      → applyEffectsWithBudgetState(immutableState)  // creates draft #1
        → setVar (mutates draft #1)
        → forEach
          → applyEffectsWithBudgetState(draft #1)   // creates draft #2 (REDUNDANT)
            → moveToken (mutates draft #2)
        → freeze draft #2, merge back
      → freeze draft #1
    → advanceToDecisionPoint({...state, ...})        // SPREAD — new immutable state
    → applyTurnFlowEligibility({...state, ...})      // SPREAD — another copy
    → computeFullHash({...state, ...})               // SPREAD — final copy

AFTER (Spec 128):
  applyMoveInternal(immutableState)
    → createMutableState(immutableState)              // ONE draft for entire applyMove
    → executeMoveAction(mutableState, tracker)
      → applyEffectsWithBudgetState(mutableState, tracker)  // reuses existing draft
        → setVar (mutates in-place)
        → forEach
          → applyEffectsWithBudgetState(mutableState, tracker)  // reuses existing draft
            → moveToken (mutates in-place)
    → advanceToDecisionPoint(mutableState, tracker)   // mutates in-place
    → applyTurnFlowEligibility(mutableState, tracker) // mutates in-place
    → computeFullHash(mutableState)                   // reads mutable state, writes stateHash
    → freezeState(mutableState)                       // ONE freeze at exit
```

### 2. Convert Lifecycle State Updates to Draft Mutations

Each of the 61 `...state` spread sites must be converted to direct property assignment on the mutable state. Examples:

**Before** (turn-flow-eligibility.ts):
```typescript
return {
  ...state,
  currentPhase: nextPhase,
  turnOrderState: { ...state.turnOrderState, pending: newPending },
};
```

**After**:
```typescript
state.currentPhase = nextPhase;
ensureTurnOrderCloned(state, tracker);
state.turnOrderState.pending = newPending;
// no return — state is mutated in-place
```

The conversion pattern for each spread site:
1. Replace `{ ...state, field: value }` with `state.field = value`
2. For nested objects (`state.turnOrderState`, `state.markers`, etc.), use COW helpers: `ensureXCloned(state, tracker)` before mutation
3. Change the function's return type from `GameState` to `void` (or thread the mutable state through parameters)

### 3. Extend DraftTracker for New COW Domains

Add tracking for domains not covered by Spec 78:

```typescript
export interface DraftTracker {
  // Existing (Spec 78)
  readonly playerVars: Set<number>;
  readonly zoneVars: Set<string>;
  readonly zones: Set<string>;
  readonly markers: Set<string>;
  // New (Spec 128)
  readonly globalMarkers: boolean;
  readonly turnOrderState: boolean;
  readonly reveals: boolean;
  readonly activeLastingEffects: boolean;
  readonly interruptPhaseStack: boolean;
  readonly actionUsage: boolean;
  readonly freeOperationGrants: boolean;
}
```

Each new boolean tracks whether the corresponding nested object/array has been shallow-cloned. The boolean pattern (vs Set) is appropriate for singleton nested objects (only one `turnOrderState`, not one per zone).

### 4. Eliminate Conditional Spreads in createMutableState

**Before**:
```typescript
export function createMutableState(state: GameState): MutableGameState {
  return {
    ...state,
    globalVars: { ...state.globalVars },
    // ...
    ...(state.reveals !== undefined ? { reveals: { ...state.reveals } } : {}),
    ...(state.globalMarkers !== undefined ? { globalMarkers: { ...state.globalMarkers } } : {}),
    ...(state.activeLastingEffects !== undefined ? { activeLastingEffects: [...state.activeLastingEffects] } : {}),
  };
}
```

**After**: Clone eagerly (always present, use `undefined` as sentinel):
```typescript
export function createMutableState(state: GameState): MutableGameState {
  return {
    ...state,
    globalVars: { ...state.globalVars },
    perPlayerVars: { ...state.perPlayerVars },
    zoneVars: { ...state.zoneVars },
    zones: { ...state.zones },
    actionUsage: { ...state.actionUsage },
    markers: { ...state.markers },
    turnOrderState: { ...state.turnOrderState },
    reveals: state.reveals !== undefined ? { ...state.reveals } : undefined,
    globalMarkers: state.globalMarkers !== undefined ? { ...state.globalMarkers } : undefined,
    activeLastingEffects: state.activeLastingEffects !== undefined ? [...state.activeLastingEffects] : undefined,
    interruptPhaseStack: state.interruptPhaseStack !== undefined ? [...state.interruptPhaseStack] : undefined,
  };
}
```

This eliminates conditional spread (`...(cond ? {} : {obj})`) which creates objects with different V8 hidden classes. The ternary `cond ? clone : undefined` produces a consistent property set.

### 5. Thread Mutable State Through Lifecycle Functions

Functions that currently accept `GameState` and return a new `GameState` must be refactored to accept `MutableGameState` + `DraftTracker` and mutate in-place:

| Function | File | Current signature | New signature |
|----------|------|-------------------|---------------|
| `advanceToDecisionPoint` | `apply-move.ts` | `(def, state, ...) -> state` | `(def, mutableState, tracker, ...) -> void` |
| `applyTurnFlowEligibility` | `turn-flow-eligibility.ts` | `(def, state, ...) -> state` | `(def, mutableState, tracker, ...) -> void` |
| `applyBoundaryExpiry` | `apply-move.ts` | `(def, state, ...) -> state` | `(def, mutableState, tracker, ...) -> void` |
| `applyDeferredEventEffects` | `event-execution.ts` | `(def, state, ...) -> state` | `(def, mutableState, tracker, ...) -> void` |
| `applyMarkerState` | `effects-markers.ts` | `(cursor, ...) -> cursor` | `(cursor, ...) -> void` (cursor.state already mutable) |

**Important**: Functions called from OUTSIDE `applyMove` (e.g., `legalMoves`, `terminalResult`, agent preview) continue to receive immutable `GameState`. The mutable path is ONLY within `applyMoveInternal`.

### 6. Hash Computation at Draft Boundary

`computeFullHash` currently receives immutable state and returns `{ ...state, stateHash }`. In the draft system:
1. Compute the hash from the mutable state (read-only operation — safe)
2. Assign `mutableState.stateHash = computedHash` directly
3. Then `freezeState(mutableState)` produces the final immutable state with the correct hash

### 7. Probe Path Isolation

`probeMoveViability` calls `applyMoveInternal` to test move validity. The probe MUST create its own draft scope (not share with the caller's draft). This is already the case since `probeMoveViability` calls `applyMove` which will create its own `createMutableState` at the top.

The key invariant: probe drafts are independent of the game-loop draft. The game-loop creates a draft at `applyTrustedMove` → `applyMoveInternal`; probes create separate drafts within `probeMoveViability` → `applyMoveInternal`.

## Constraints

1. **Foundation 8 (Determinism)**: Same seed + same actions = identical stateHash. The draft system MUST produce bit-identical state to the spread-based system. Verified by running all existing determinism tests and the perf campaign harness (which checks stateHash across runs).

2. **Foundation 11 (Immutability — external contract)**: The `applyMove` / `applyTrustedMove` public API continues to return an immutable `GameState`. Input state is never modified. Only internal working state is mutable.

3. **Foundation 16 (Testing as Proof)**: Add property-based tests that verify: (a) for a random sequence of effects, the draft-based and spread-based paths produce identical states; (b) the input state is never modified (deep-freeze the input, assert no throw during execution).

4. **No V8 Hidden Class Regression**: The DraftTracker extension (Deliverable 3) adds new fields to `DraftTracker`, not to `EffectCursor` or `GameDefRuntime`. DraftTracker is created once per applyMove scope and accessed only via explicit helper functions — it does not participate in V8 inline-cache-sensitive call sites. This is validated by the perf campaign harness (accept only if combined_duration_ms improves >1%).

## Risk Assessment

**High risk, high reward.** This change touches 61+ sites across 10+ kernel files. Incremental delivery is essential — convert one file at a time, verify determinism after each file.

**Suggested implementation order**:
1. Thread mutable state through `applyMoveInternal` (top-level plumbing)
2. Convert `effects-markers.ts` (6 spread sites, self-contained)
3. Convert `turn-flow-eligibility.ts` (4 spread sites)
4. Convert `apply-move.ts` lifecycle helpers (4 spread sites)
5. Convert remaining files
6. Benchmark after each phase

## Expected Impact

- **Target**: 8-12% reduction in `combined_duration_ms` (eliminating ~12% CPU from object allocation/copying, minus overhead from COW tracking)
- **Measurement**: `fitl-perf-optimization` campaign harness (3 seeds × 3 runs, median)
- **Validation**: all existing tests pass + stateHash determinism preserved

# Spec 87 -- Unified Viability Pipeline

## Status

Proposed

## Problem

The legal move pipeline runs partial effect execution **2-3 times per move
per game step**, creating the dominant performance bottleneck in FITL
simulations:

1. **Enumeration**: `isMoveDecisionSequenceAdmittedForLegalMove` calls
   `legalChoicesDiscover` to check decision-sequence satisfiability for
   pipeline and event moves.
2. **Classification**: `probeMoveViability` calls `resolveMoveDecisionSequence`
   which calls `legalChoicesDiscover` again on the same (def, state, move).
3. **Agent completion**: `evaluatePlayableMoveCandidate` runs the full effect
   chain a third time to resolve decisions randomly.

Profiling from the `fitl-perf-optimization` campaign (12 experiments) showed:

- 96% of `legalMoves` cost is enumeration (step 1), only 4% is classification
  (step 2).
- Steps 1 and 2 both call `legalChoicesDiscover` on the same move with the
  same state -- the classification probe RE-DOES work the enumeration already
  completed.
- Probes are 5-10x cheaper than agent completions, so bypassing probes to
  shift work to agents makes things worse (exp-012: +6.5% regression).
- Micro-optimizations (caching, object shape changes, spread elimination)
  consistently fail due to V8 hidden class sensitivity.

The only successful optimizations were **structural work elimination**: removing
hidden call paths (exp-006: -41%) and reducing redundant agent work (exp-008:
-9.4%).

## Objective

Eliminate redundant `legalChoicesDiscover` calls between enumeration and
classification by capturing decision-sequence results during enumeration and
reusing them during classification.

## Design

### Core Principle

When the enumeration phase already runs `isMoveDecisionSequenceAdmittedForLegalMove`
(which internally calls `classifyDecisionSequenceSatisfiability` ->
`legalChoicesDiscover`), capture the satisfiability result. During
classification, reuse the captured result instead of re-running
`probeMoveViability`.

### Data Flow

```
enumerateRawLegalMoves
  for each pipeline action:
    evaluateDiscoveryPipelinePredicateStatus  (cheap)
    isMoveDecisionSequenceAdmittedForLegalMove  (expensive -- runs legalChoicesDiscover)
      -> CAPTURE the DecisionSequenceSatisfiabilityResult
    tryPushOptionMatrixFilteredMove  (cheap)

  for each event action:
    isMoveDecisionSequenceAdmittedForLegalMove  (expensive)
      -> CAPTURE the result

classifyEnumeratedMoves
  for each move:
    if alwaysComplete -> push complete (no change)
    if capturedResult exists for this move -> use captured viability (NEW)
    else -> probeMoveViability (unchanged fallback for plain actions)
```

### Implementation Strategy

**Critical V8 constraint**: Adding fields to Move, MoveEnumerationState,
ClassifiedMove, or any hot-path object causes 2-7% regression due to V8
hidden class deoptimization. The captured results MUST be stored in a
**parallel data structure** external to the hot-path objects.

#### Step 1: Capture during enumeration

Replace `isMoveDecisionSequenceAdmittedForLegalMove` calls in
`enumerateRawLegalMoves` with a new helper that returns both the boolean
admission decision AND the full `DecisionSequenceSatisfiabilityResult`:

```typescript
// New function in move-decision-sequence.ts
export const admitAndCaptureMoveDecisionSequence = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  context: MissingBindingPolicyContext,
  options?: Omit<ResolveMoveDecisionSequenceOptions, 'choose'>,
  runtime?: GameDefRuntime,
): { admitted: boolean; result: MoveDecisionSequenceSatisfiabilityResult } => {
  // Single call to classifyDecisionSequenceSatisfiability
  // Returns both the admission boolean and the full result
};
```

#### Step 2: Thread captured results to classification

The captured results are stored in a **function-scoped Map** inside
`enumerateLegalMoves`, keyed by move index (the position in the raw moves
array). This Map is NOT on any hot-path object -- it's a local variable in the
`enumerateLegalMoves` wrapper function.

```typescript
export const enumerateLegalMoves = (def, state, options?, runtime?) => {
  const { moves, warnings, capturedViability } = enumerateRawLegalMovesWithCapture(def, state, options, runtime);
  return {
    moves: classifyWithCapturedViability(def, state, moves, warnings, runtime, capturedViability),
    warnings,
  };
};
```

The `capturedViability` is a `Map<number, MoveDecisionSequenceSatisfiabilityResult>`
where the key is the move's index in the raw moves array.

#### Step 3: Classification reuse

In `classifyEnumeratedMoves` (renamed to `classifyWithCapturedViability`), for
each move check the captured map BEFORE falling through to `probeMoveViability`:

```typescript
// If enumeration already captured a satisfiability result for this move,
// convert it to a ClassifiedMove without re-running probeMoveViability.
const captured = capturedViability?.get(moveIndex);
if (captured !== undefined) {
  classified.push(convertCapturedToClassified(move, captured, state));
  continue;
}
// Fallback: full probe for plain actions (no pipeline, no event)
const viability = probeMoveViability(def, state, move, runtime);
```

### What This Does NOT Change

- The `probeMoveViability` function itself (public API, used by tests and
  other callers).
- The `isMoveDecisionSequenceAdmittedForLegalMove` function (still available
  for other callers).
- Any hot-path object shape (Move, MoveEnumerationState, EffectCursor,
  ReadContext, GameDefRuntime).
- The parity test contract (`classified-move-parity.test.ts`): the classified
  moves will have the same actionIds, viability, and count as before.
- The external `enumerateLegalMoves` return type.

### V8 Safety Analysis

- No fields added to hot-path objects (Map is a local variable).
- No changes to closure scope in tight loops.
- No WeakMap (proven slower in this codebase).
- The captured Map is created once per `enumerateLegalMoves` call and
  discarded after classification.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Generic pipeline -- no game-specific logic |
| F5 (Determinism) | Same result as current -- avoids recomputation, doesn't change outputs |
| F6 (Bounded Computation) | Reduces total bounded work per step |
| F7 (Immutability) | Captured map is scoped to a single synchronous call |
| F9 (No Backwards Compat) | Replaces internal flow, no shims |
| F10 (Completeness) | Addresses root cause (redundant effect execution), not symptom |
| F11 (Testing as Proof) | Parity test proves equivalence with current behavior |

## Acceptance Criteria

1. `classifyEnumeratedMoves` skips `probeMoveViability` for moves whose
   decision-sequence was already captured during enumeration.
2. The `classified-move-parity` integration test continues to pass (same
   classified moves, same viability, same count).
3. All existing tests pass without weakening assertions.
4. FITL benchmark shows measurable improvement in `simLegalMoves` timer
   (target: >5% reduction).
5. No new fields on Move, MoveEnumerationState, ClassifiedMove,
   EffectCursor, ReadContext, or GameDefRuntime.

## Estimated Impact

20-40% reduction in `legalMoves` time for FITL. For the current best
(135,857ms with legalMoves at 106,773ms / 78.6%), a 30% reduction in
legalMoves would save ~32,000ms (23.6% overall).

## Files to Modify

- `packages/engine/src/kernel/move-decision-sequence.ts` -- new capture helper
- `packages/engine/src/kernel/legal-moves.ts` -- thread captured results
- `packages/engine/src/kernel/legal-moves.ts` -- classification reuse logic
- `packages/engine/test/` -- update tests if internal signatures change

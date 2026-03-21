# Spec 75 — Enriched Legal Move Enumeration

## Problem

The simulator → agent → kernel boundary performs redundant move validation.
Profiling from the `texas-perf-optimization` campaign shows:

```
simLegalMoves:          913ms (12647 calls) — validates + enumerates moves
agent:probeMoveViability: 3018ms (120526 calls) — re-validates each move
validateMove (applyMove):  239ms (12647 calls) — re-validates the chosen move
─────────────────────────────────────────────────
Total redundant validation: ~3257ms (13% of 25082ms total)
```

The flow is:
1. Simulator calls `legalMoves(def, state)` → validates preconditions,
   enumerates parameter combinations, returns `Move[]`.
2. Agent receives `Move[]`, calls `probeMoveViability(def, state, move)` for
   EACH move → re-validates legality, resolves decision sequence, classifies
   as complete/pending/stochastic.
3. Simulator calls `applyMove(def, state, chosenMove)` → `validateMove`
   re-validates legality a THIRD time.

Step 2 alone costs 3018ms. For Texas Hold'em with ~9.5 legal moves per turn,
each `probeMoveViability` call costs 0.025ms — small individually but
120526 × 0.025ms = 3018ms in aggregate.

## Objective

Eliminate redundant validation by having `legalMoves` return move
classification alongside each move. The agent consumes the pre-computed
classification, skipping `probeMoveViability` entirely for complete moves.
The simulator passes a `skipMoveValidation` flag to `applyMove` for moves
that came from its own `legalMoves` call.

**Target:** Eliminate 3018ms of agent probing + 239ms of applyMove
re-validation = **~3257ms savings (13% improvement)**.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism):** The enriched API is game-agnostic —
  any game's legal moves get classified.
- **Foundation 5 (Determinism):** Classification is a pure function of
  `(def, state, move)`. Computing it once vs three times produces identical
  results.
- **Foundation 7 (Immutability):** No state mutation — the classification is
  read-only metadata attached to the move.
- **Foundation 9 (No Backwards Compatibility):** The existing `legalMoves`
  API is preserved as-is. The enriched API is opt-in via a new function or
  option flag.

## Architecture

### New Types

```typescript
/** A legal move with its viability classification pre-computed. */
interface ClassifiedLegalMove {
  readonly move: Move;
  readonly classification: 'complete' | 'pending' | 'stochastic';
  /** For pending moves: the next decision request. */
  readonly nextDecision?: ChoicePendingRequest;
  /** For stochastic moves: the stochastic decision request. */
  readonly stochasticDecision?: ChoiceStochasticPendingRequest;
}

interface EnrichedLegalMoveResult {
  readonly moves: readonly ClassifiedLegalMove[];
  readonly warnings: readonly RuntimeWarning[];
}
```

### API Changes

1. **`enumerateLegalMoves`** gains an `enriched?: boolean` option. When true,
   each move in the result includes its classification.

2. **`legalMovesEnriched`** — new convenience function:
   ```typescript
   export const legalMovesEnriched = (
     def: GameDef, state: GameState, runtime?: GameDefRuntime,
   ): readonly ClassifiedLegalMove[] =>
     enumerateLegalMoves(def, state, { enriched: true }, runtime).moves;
   ```

3. **`Agent.chooseMove` input** — gains an optional `classifiedMoves` field:
   ```typescript
   interface AgentChooseMoveInput {
     // ... existing fields ...
     readonly classifiedMoves?: readonly ClassifiedLegalMove[];
   }
   ```

4. **`preparePlayableMoves`** — when `classifiedMoves` is provided, skips
   `probeMoveViability` for complete moves (directly adds them to
   `completedMoves`), and only probes pending/stochastic moves for template
   completion.

5. **`ExecutionOptions.skipMoveValidation`** — already exists (added in
   exp-020). The simulator sets this flag when calling `applyMove` for a
   move that came from its own `legalMoves` call.

6. **`runGame` (simulator)** — uses `legalMovesEnriched` and passes
   `classifiedMoves` + `skipMoveValidation` through the flow.

### Classification During Enumeration

The classification is computed inside `enumerateLegalMoves` by calling
`probeMoveViability` once per enumerated move. This moves the cost from
the agent (where it's per-move-per-turn) to the enumerator (where it's
per-move-per-turn but only ONCE). The net effect is that `legalMoves`
becomes ~3ms slower per call (913ms → ~3931ms) but the agent's 3018ms
of probing is eliminated entirely. Net savings: ~3018ms - ~3018ms = ~0ms?

**Wait — this is zero-sum if we just move the probing to legalMoves.**

The actual savings come from:
1. **Skipping `probeMoveViability` for always-complete moves** — fold, check,
   call, allIn have 0 params and 0 choice effects. Their classification is
   always 'complete'. The enumerator can classify them statically from the
   action definition (using `alwaysCompleteActionIds` from GameDefRuntime)
   without running `probeMoveViability` at all. This eliminates ~80% of the
   120526 probes (fold/check/call/allIn are ~80% of legal moves).
2. **Skipping `validateMove` in `applyMove`** — the chosen move was already
   validated by `legalMoves`. Saves 239ms.
3. **Sharing the preflight context** — `legalMoves` already computes the
   action preflight (seat resolution, adjacency graph, runtime table index).
   For moves that DO need `probeMoveViability`, the enumerator can pass the
   pre-computed context, avoiding redundant construction.

Net estimated savings: ~2400ms (probing for always-complete) + ~239ms
(applyMove validation) + ~600ms (shared preflight) = **~3240ms**.

## Dependencies

- `alwaysCompleteActionIds` on GameDefRuntime (already implemented as part of
  exp-030 near-miss, needs to be committed as infrastructure).
- `PerfProfiler` infrastructure (already committed).

## Profiling Evidence

```
agent:probeMoveViability: 3018ms (120526 calls @ 0.025ms)
  - 120526 calls for 12647 turns = 9.5 moves/turn average
  - Texas Hold'em actions: fold(0 params), check(0), call(0), raise(1), allIn(0)
  - 4/5 actions are always-complete → ~80% of probes are eliminable
  - validateMove inside applyMove: 239ms (100% eliminable)
```

## Estimated Effort

Medium — ~300-500 lines changed across 5-6 files. The main work is threading
the classification through the enumeration → agent → simulator boundary.

## Risks

- **Golden test sensitivity:** FITL golden tests are sensitive to exact move
  objects. The classification must not alter the `Move` objects themselves.
  (Lesson from exp-030: FITL moves may have turn-flow metadata in params
  that makes them not "truly" parameterless.)
- **API surface expansion:** The enriched API adds types to the public
  interface. Must be backward-compatible.

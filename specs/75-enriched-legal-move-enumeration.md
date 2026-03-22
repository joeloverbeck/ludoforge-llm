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

Eliminate redundant validation by having `legalMoves` always return move
viability data alongside each move. The agent consumes the pre-computed
viability, skipping `probeMoveViability` entirely. The simulator passes a
`skipMoveValidation` flag to `applyMove` for moves that came from its own
`legalMoves` call.

**Target:** Eliminate 3018ms of agent probing + 239ms of applyMove
re-validation = **~3257ms savings (13% improvement)**.

## Foundations Alignment

- **Foundation 1 (Engine Agnosticism):** Classification is game-agnostic —
  any game's legal moves get classified by the same mechanism.
- **Foundation 5 (Determinism):** Classification is a pure function of
  `(def, state, move)`. Computing it once vs three times produces identical
  results.
- **Foundation 7 (Immutability):** No state mutation — the viability data is
  read-only metadata attached to the move.
- **Foundation 9 (No Backwards Compatibility):** The existing `legalMoves`
  return type changes from `readonly Move[]` to `readonly ClassifiedMove[]`.
  All consumers are updated in the same change. No opt-in flag, no parallel
  API, no shims.
- **Foundation 10 (Architectural Completeness):** Complete solution — no
  `enriched?: boolean` flag creating a function with two personalities. The
  `alwaysCompleteActionIds` infrastructure is designed and built as part of
  this spec, not assumed to exist.
- **Foundation 12 (Branded Types):** `alwaysCompleteActionIds` uses
  `ReadonlySet<ActionId>`, not raw strings.

## Architecture

### New Types

```typescript
/** A legal move with its viability pre-computed during enumeration. */
export interface ClassifiedMove {
  readonly move: Move;
  /** Full probe result from probeMoveViability. Always viable (non-viable
   *  moves are filtered out during enumeration with a warning). */
  readonly viability: MoveViabilityProbeResult;
}
```

`MoveViabilityProbeResult` is the existing discriminated union in
`apply-move.ts` — it carries:
- `{ viable: true; complete: true; move; warnings }` for fully resolved moves
- `{ viable: true; complete: false; move; warnings; nextDecision?;
  nextDecisionSet?; stochasticDecision? }` for pending/stochastic moves
- `{ viable: false; ... }` for non-viable moves (filtered out by enumeration)

No new `EnrichedLegalMoveResult` type — the existing
`LegalMoveEnumerationResult` changes in place:

```typescript
interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];  // was: readonly Move[]
  readonly warnings: readonly RuntimeWarning[];
}
```

### Always-Complete Action Detection

**New infrastructure: `always-complete-actions.ts`**

An action is "always complete" if `probeMoveViability` would return
`{ viable: true, complete: true }` for any legal move of that action,
regardless of game state. This is a static property determined from the
GameDef at runtime construction time.

```typescript
export function computeAlwaysCompleteActionIds(def: GameDef): ReadonlySet<ActionId>
```

An action is always-complete if ALL of:
1. `action.params.length === 0` — no user-facing parameter choices
2. No matching entry in `def.actionPipelines` — pipeline actions always
   involve multi-stage decision sequences
3. `effectTreeContainsDecision(action.effects) === false` — no `chooseOne`,
   `chooseN`, or `chooseFromZone` nodes in the effect AST
4. `effectTreeContainsDecision(action.cost) === false` — same for cost effects

The helper `effectTreeContainsDecision` recursively walks `EffectAST[]`
looking for decision-creating nodes.

**Conservative by design:** false negatives (marking a truly-complete action
as maybe-incomplete) cost only one extra `probeMoveViability` call per move.
False positives would be correctness bugs.

Added to `GameDefRuntime`:

```typescript
export interface GameDefRuntime {
  // ... existing fields ...
  readonly alwaysCompleteActionIds: ReadonlySet<ActionId>;
}
```

Computed once in `createGameDefRuntime(def)`.

### API Changes

1. **`enumerateLegalMoves`** — return type changes from `readonly Move[]` to
   `readonly ClassifiedMove[]`. After collecting raw moves (existing logic),
   each move is classified:
   - If `runtime.alwaysCompleteActionIds.has(move.actionId)` → synthetic
     complete result (zero-cost, no probe call)
   - Otherwise → `probeMoveViability(def, state, move, runtime)`
   - If probe returns `viable: false` → emit warning and filter out (safety
     net for enumeration/probe disagreement)
   - Profiling: `perfStart/perfEnd(profiler, 'classifyMoves', ...)` around
     the classification loop

2. **`legalMoves`** facade — return type follows: `readonly ClassifiedMove[]`.

3. **`Agent.chooseMove` input** — `legalMoves` field changes type:
   ```typescript
   readonly legalMoves: readonly ClassifiedMove[];  // was: readonly Move[]
   ```
   (The inline type at `types-core.ts:1486-1494` is updated directly — there
   is no named `AgentChooseMoveInput` interface.)

4. **`preparePlayableMoves`** — input `legalMoves` changes to
   `readonly ClassifiedMove[]`. All `probeMoveViability` calls are removed.
   Classification is read directly from `classified.viability`:
   - `viable: true, complete: true` → add to `completedMoves`
   - `viable: true, complete: false` + `stochasticDecision` → add to
     `stochasticMoves`
   - `viable: true, complete: false` without stochastic → pending template
     completion path (existing logic)

5. **`ExecutionOptions.skipMoveValidation`** — new field (does not currently
   exist). Threads to the internal `ApplyMoveCoreOptions.skipValidation` at
   `apply-move.ts:744`. In `applyMove` (line 1537), when
   `options?.skipMoveValidation === true`, pass `{ skipValidation: true }` as
   `coreOptions` to `applyMoveCore`.

6. **`runGame` (simulator)** — `legalMoves()` now returns
   `readonly ClassifiedMove[]`, type flows naturally to agent. Passes
   `{ ...options, skipMoveValidation: true }` to `applyMove`.

### Classification During Enumeration

The classification is computed inside `enumerateLegalMoves`. This moves the
cost from the agent (per-move-per-turn, redundant) to the enumerator
(per-move-per-turn, but computed ONCE and reused).

**Why this is not zero-sum:**

The actual savings come from:
1. **Skipping `probeMoveViability` for always-complete moves** — fold, check,
   call, allIn have 0 params and 0 choice effects. Their classification is
   always 'complete'. The enumerator classifies them statically via
   `alwaysCompleteActionIds` without running `probeMoveViability` at all.
   This eliminates ~80% of the 120526 probes (fold/check/call/allIn are ~80%
   of legal moves in Texas Hold'em).
2. **Skipping `validateMove` in `applyMove`** — the chosen move was already
   validated by `legalMoves`. Saves 239ms.
3. **Sharing the preflight context** — `legalMoves` already computes the
   action preflight (seat resolution, adjacency graph, runtime table index).
   For moves that DO need `probeMoveViability`, the enumerator can pass the
   pre-computed context, avoiding redundant construction.

Net estimated savings: ~2400ms (probing for always-complete) + ~239ms
(applyMove validation) + ~600ms (shared preflight) = **~3240ms**.

## Dependencies

- `alwaysCompleteActionIds` on GameDefRuntime — **must be built** as part of
  this spec (new file `always-complete-actions.ts`, new field on
  `GameDefRuntime`, computed in `createGameDefRuntime`).
- `ExecutionOptions.skipMoveValidation` — **must be built** as part of this
  spec (new field, threaded to existing internal `skipValidation`).
- `PerfProfiler` infrastructure (already committed).

## Profiling Evidence

```
agent:probeMoveViability: 3018ms (120526 calls @ 0.025ms)
  - 120526 calls for 12647 turns = 9.5 moves/turn average
  - Texas Hold'em actions: fold(0 params), check(0), call(0), raise(1), allIn(0)
  - 4/5 actions are always-complete → ~80% of probes are eliminable
  - validateMove inside applyMove: 239ms (100% eliminable)
```

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `ClassifiedMove`, `skipMoveValidation` on `ExecutionOptions`, update `Agent.chooseMove` input |
| `packages/engine/src/kernel/always-complete-actions.ts` | **New file** — `computeAlwaysCompleteActionIds`, `effectTreeContainsDecision` |
| `packages/engine/src/kernel/gamedef-runtime.ts` | Add `alwaysCompleteActionIds` field, compute in `createGameDefRuntime` |
| `packages/engine/src/kernel/legal-moves.ts` | `LegalMoveEnumerationResult.moves` → `ClassifiedMove[]`, classify during enumeration |
| `packages/engine/src/kernel/apply-move.ts` | Thread `skipMoveValidation` from `ExecutionOptions` to `ApplyMoveCoreOptions` |
| `packages/engine/src/kernel/index.ts` | Export `ClassifiedMove`, `computeAlwaysCompleteActionIds` |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Remove `probeMoveViability`, read from `ClassifiedMove.viability` |
| `packages/engine/src/agents/random-agent.ts` | Accept `ClassifiedMove[]`, extract `.move` |
| `packages/engine/src/agents/greedy-agent.ts` | Accept `ClassifiedMove[]`, extract `.move` |
| `packages/engine/src/agents/policy-agent.ts` | Accept `ClassifiedMove[]`, extract `.move` |
| `packages/engine/src/sim/simulator.ts` | Type flows naturally, add `skipMoveValidation: true` to `applyMove` |
| `packages/runner/src/worker/game-worker-api.ts` | Return type → `ClassifiedMove[]` |
| `packages/runner/src/store/ai-move-policy.ts` | `legalMoves` type → `ClassifiedMove[]` |
| `packages/runner/src/store/agent-turn-orchestrator.ts` | `legalMoves` type → `ClassifiedMove[]` |

## Estimated Effort

Medium — ~400-600 lines changed across ~14 files, plus 1 new file. The main
work is:
1. Building `alwaysCompleteActionIds` infrastructure (new)
2. Integrating classification into `enumerateLegalMoves`
3. Threading the type change through agents, simulator, and runner

## Testing Strategy

### Unit Tests
- **`always-complete-actions.test.ts`**: Actions with params (not complete),
  with pipelines (not complete), with decision effects (not complete), and
  parameterless simple actions (complete). Conservative behavior verification.
- **`legal-moves.test.ts`**: `ClassifiedMove[]` return type, fast-path for
  always-complete, full-probe for others, non-viable filtering + warning.
- **`prepare-playable-moves.test.ts`**: No `probeMoveViability` calls; reads
  from `ClassifiedMove.viability`.

### Integration / Golden Tests
- Determinism: same seed + same moves = identical state hash
- FITL golden tests: no behavioral change — `Move` objects untouched
- Texas Hold'em golden tests: same
- Simulator parity: `skipMoveValidation: true` produces identical results

### Property Tests
- Every `ClassifiedMove` from `enumerateLegalMoves` has `viability.viable === true`
- For every complete `ClassifiedMove`, `applyMove` succeeds
- `skipMoveValidation` produces same `ApplyMoveResult` as full validation

## Risks

- **Golden test sensitivity:** FITL golden tests are sensitive to exact move
  objects. The classification must not alter the `Move` objects themselves.
  `ClassifiedMove` wraps the `Move` — it does not modify it.
  (Lesson from exp-030: FITL moves may have turn-flow metadata in params
  that makes them not "truly" parameterless — the `alwaysCompleteActionIds`
  check accounts for this via `actionPipelines` exclusion.)
- **Worker serialization:** `ClassifiedMove` crosses the Comlink worker
  boundary. It is a plain object with no functions — structured clone works.
  Non-viable results (which may contain `KernelRuntimeError` instances) are
  filtered out before reaching the runner.
- **FITL always-complete ratio:** The 80% elimination estimate is based on
  Texas Hold'em's simple action structure. FITL actions are more complex —
  many have pipelines or decision effects. The savings ratio will be
  game-dependent, but the `skipMoveValidation` savings (239ms) and shared
  preflight savings (~600ms) apply regardless.

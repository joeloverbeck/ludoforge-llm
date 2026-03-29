# Spec 11: Evaluator & Degeneracy Detection

**Status**: COMPLETED
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 10 (simulator + trace recording)
**Source sections**: Brainstorming sections 2.4B, 2.4C, 6.5

## Additional Context: Agent Campaign Dependency

The FITL VC agent evolution campaign (2026-03-29) revealed that Spec 11 is not just an evolution pipeline prerequisite — it is needed for **agent evaluation quality**. Seed 1009 in the 15-seed tournament terminates after 3 moves with `noLegalMoves` (a `NO_LEGAL_MOVES` degeneracy), producing VC margin=-8 that drags down the composite score. Without Spec 11, the campaign harness cannot distinguish "VC lost strategically" from "game terminated due to game-definition degeneracy." This conflation distorts the fitness signal and wastes campaign experiments trying to improve a fundamentally unfixable seed.

When implemented, agent campaign harnesses should use `evaluateTrace` to:
- Exclude degenerate games from strategy-evaluation metrics
- Track degeneracy frequency as a game-definition quality metric
- Categorize losses by cause (strategic vs structural)

## Overview

Implement the evaluation layer that analyzes game traces to produce quality metrics and detect degenerate game definitions. The primary consumer is **agent campaign harnesses** — evaluator output enables campaigns to distinguish strategic losses from structural degeneracy, exclude degenerate seeds from strategy-evaluation metrics, and track game-definition quality over time. Secondary consumer: CLI (Spec 12) for ad-hoc game analysis.

The API is split into two levels:
1. **Per-trace**: `evaluateTrace(trace, config?)` computes 7 quality metrics and checks 6 degeneracy flags for a single `GameTrace`.
2. **Aggregate**: `aggregateEvals(gameDefId, evals[])` combines per-trace results into an `EvalReport` with mean metrics, union of flags, and per-seed breakdown.

All computation uses trace data only — no re-simulation needed.

## Scope

### In Scope
- `evaluateTrace(trace, config?)` — per-trace metrics + degeneracy flags
- `aggregateEvals(gameDefId, evals[])` — aggregate into EvalReport
- `generateEvalReport(gameDefId, traces, config?)` — convenience wrapper
- Delta reconstruction for per-turn perPlayerVars state (resourceTension, dramaMeasure)
- Configurable thresholds via `EvalConfig`
- Explicit `scoringVar` configuration for dramaMeasure

### Out of Scope
- Composite scores / fitness functions (consumers compute their own)
- MAP-Elites / evolution pipeline integration (Spec 14, deferred)
- BehaviorCharacterization computation (Spec 14, deferred)
- Human evaluation gates
- Trace generation (Spec 10)

## Key Types & Interfaces

### Per-Trace Evaluation

```typescript
/** Metrics computed from a single trace. */
interface TraceMetrics {
  readonly gameLength: number;          // = turnsCount
  readonly avgBranchingFactor: number;  // mean legalMoveCount across moves
  readonly actionDiversity: number;     // normalized Shannon entropy [0, 1]
  readonly resourceTension: number;     // mean per-turn cross-player var variance
  readonly interactionProxy: number;    // cross-player delta ratio [0, 1]
  readonly dominantActionFreq: number;  // frequency of most-used action [0, 1]
  readonly dramaMeasure: number;        // lead changes / gameLength (0 if no scoringVar)
}

/** Result of evaluating a single trace. */
interface TraceEval {
  readonly seed: number;
  readonly turnCount: number;
  readonly stopReason: SimulationStopReason;
  readonly metrics: TraceMetrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
}
```

### Configuration

```typescript
interface EvalConfig {
  readonly trivialWinThreshold?: number;     // default: 5
  readonly stallTurnThreshold?: number;      // default: 10
  readonly dominantActionThreshold?: number; // default: 0.8
  readonly scoringVar?: string;              // per-player var name for dramaMeasure
}

const DEFAULT_EVAL_CONFIG: Required<Omit<EvalConfig, 'scoringVar'>> = {
  trivialWinThreshold: 5,
  stallTurnThreshold: 10,
  dominantActionThreshold: 0.8,
};
```

### Aggregated Report

```typescript
/** Aggregated metrics (means of per-trace TraceMetrics). */
interface Metrics {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly actionDiversity: number;
  readonly resourceTension: number;
  readonly interactionProxy: number;
  readonly dominantActionFreq: number;
  readonly dramaMeasure: number;
}

/**
 * Full evaluation report. No full traces — perSeed provides
 * per-seed breakdown for diagnostics.
 */
interface EvalReport {
  readonly gameDefId: string;
  readonly runCount: number;
  readonly metrics: Metrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
  readonly perSeed: readonly TraceEval[];
}
```

### Required Trace Fields (from Spec 10)

The evaluator relies on `GameTrace` and `MoveLog` as defined in `types-core.ts`:

```typescript
interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
}

interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;                           // move.actionId used for action metrics
  readonly legalMoveCount: number;               // used for avgBranchingFactor
  readonly deltas: readonly StateDelta[];         // used for resourceTension, interactionProxy, dramaMeasure
  readonly triggerFirings: readonly TriggerLogEntry[];  // used for TRIGGER_DEPTH_EXCEEDED
  // ... other optional trace fields omitted
}

interface StateDelta {
  readonly path: string;    // e.g. "perPlayerVars.0.resources", "zones.saigon"
  readonly before: unknown;
  readonly after: unknown;
}

type SimulationStopReason = 'terminal' | 'maxTurns' | 'noLegalMoves';
```

## Public API

```typescript
/** Evaluate a single trace: compute per-trace metrics and degeneracy flags. */
function evaluateTrace(
  trace: GameTrace,
  config?: EvalConfig
): TraceEval;

/** Aggregate multiple TraceEvals into a report with mean metrics. */
function aggregateEvals(
  gameDefId: string,
  evals: readonly TraceEval[]
): EvalReport;

/** Convenience: evaluate all traces and aggregate. */
function generateEvalReport(
  gameDefId: string,
  traces: readonly GameTrace[],
  config?: EvalConfig
): EvalReport;
```

## Implementation Requirements

### Per-Trace Metrics

All formulas operate on a single `GameTrace`. The `Metrics` in `EvalReport` are means across `TraceEval.metrics`.

#### 1. gameLength

```
gameLength = trace.turnsCount
```

Simple pass-through of the trace's turn count.

#### 2. avgBranchingFactor

```
avgBranchingFactor = mean(trace.moves.map(m => m.legalMoveCount))
```

Mean legal moves per turn, computed directly from `MoveLog.legalMoveCount`.

#### 3. actionDiversity (normalized Shannon entropy)

```
Count frequency of each actionId across trace.moves
H = -sum(p_i * log2(p_i)) for each action with p_i > 0
H_max = log2(numDistinctActions)
actionDiversity = H / H_max (or 0 if only 1 distinct action)
```

Range: [0, 1] where 0 = one action used exclusively, 1 = perfectly uniform distribution.

#### 4. resourceTension (delta reconstruction)

Proxy for resource scarcity/competition between players. Requires reconstructing per-player variable state at each turn from trace deltas.

```
Delta reconstruction:
  1. Start from trace.finalState.perPlayerVars
  2. Reverse all deltas (last move to first) to obtain initial perPlayerVars
     - For each delta with path matching perPlayerVars.<playerId>.<varName>:
       restore the 'before' value
  3. Replay forward, applying deltas to track perPlayerVars at each turn

At each turn, for each per-player variable:
  Compute variance across players
Average the variances across variables and turns.
```

Implementation notes:
- Only deltas with path matching `perPlayerVars.<playerId>.<varName>` are relevant. Other deltas (zones, globalVars, etc.) are skipped.
- Higher tension = more variance in resource levels between players = more competitive dynamics.
- `GameState.perPlayerVars` type: `Record<number, Record<string, VariableValue>>` where keys are player indices (0-based).

#### 5. interactionProxy

Measures how much players' actions affect each other:

```
For each MoveLog entry:
  actor = entry.player (PlayerId, which is a number)
  For each delta in entry.deltas:
    If delta.path matches perPlayerVars.<id>.* where <id> != actor → interaction delta
  ratio = interactionDeltas / totalPerPlayerVarDeltas (0 if no perPlayerVar deltas)

interactionProxy = mean(ratio across all moves with perPlayerVar deltas)
```

Range: [0, 1] where 0 = purely solitaire, 1 = all per-player effects target others.

Note: zone ownership analysis is deferred — `StateDelta.path` for zones (e.g., `zones.saigon`) doesn't encode which player owns the zone. Only `perPlayerVars` deltas are used for interaction classification.

#### 6. dominantActionFreq

```
Count frequency of each actionId across trace.moves
dominantActionFreq = max(frequencies) / totalMoves
```

Range: [0, 1] where values near 1.0 indicate one action dominates play.

#### 7. dramaMeasure

```
If config.scoringVar is not provided → dramaMeasure = 0

Otherwise:
  Reconstruct scoring var trajectory per player from deltas:
    - Use the same delta reconstruction as resourceTension, but filtered to
      deltas matching perPlayerVars.<playerId>.<scoringVar>
  At each turn, determine leader (player with highest scoringVar value)
  Count lead changes (leader at turn T differs from leader at turn T-1)
  dramaMeasure = leadChanges / turnsCount
```

The `scoringVar` must be specified explicitly in `EvalConfig` because `GameDef` has no generic `scoring` field — games use diverse victory conditions (e.g., FITL uses `totalOpposition + vcBases - 35`). The caller knows which variable represents "score" for their game.

### Degeneracy Detection

Each flag is checked independently per-trace. Detecting one does not skip checking others. `EvalReport.degeneracyFlags` is the **union** of all per-trace flags (deduplicated).

#### LOOP_DETECTED

```
Collect all stateHash values from trace.moves
If any hash appears more than once → LOOP_DETECTED

Implementation: Use a Set<bigint> for O(n) scan per trace.
```

#### NO_LEGAL_MOVES

```
If trace.stopReason === 'noLegalMoves' → NO_LEGAL_MOVES
```

#### DOMINANT_ACTION

```
If dominantActionFreq > config.dominantActionThreshold (default 0.8) → DOMINANT_ACTION
```

Reuses the dominantActionFreq metric already computed.

#### TRIVIAL_WIN

```
If trace.result is non-null AND trace.turnsCount < config.trivialWinThreshold (default 5)
→ TRIVIAL_WIN
```

#### STALL

```
Scan consecutive MoveLog entries
If config.stallTurnThreshold consecutive entries have identical stateHash → STALL
```

Note: identical stateHash with different moves means the move had no effect — a degenerate pattern.

#### TRIGGER_DEPTH_EXCEEDED

```
Scan all MoveLog.triggerFirings across trace.moves
If any trigger log entry has kind === 'truncated' → TRIGGER_DEPTH_EXCEEDED
```

### Aggregation

```typescript
function aggregateEvals(gameDefId: string, evals: readonly TraceEval[]): EvalReport {
  if (evals.length === 0) {
    return {
      gameDefId,
      runCount: 0,
      metrics: { avgGameLength: 0, avgBranchingFactor: 0, actionDiversity: 0,
                 resourceTension: 0, interactionProxy: 0, dominantActionFreq: 0,
                 dramaMeasure: 0 },
      degeneracyFlags: [],
      perSeed: [],
    };
  }

  const metrics: Metrics = {
    avgGameLength: mean(evals.map(e => e.metrics.gameLength)),
    avgBranchingFactor: mean(evals.map(e => e.metrics.avgBranchingFactor)),
    actionDiversity: mean(evals.map(e => e.metrics.actionDiversity)),
    resourceTension: mean(evals.map(e => e.metrics.resourceTension)),
    interactionProxy: mean(evals.map(e => e.metrics.interactionProxy)),
    dominantActionFreq: mean(evals.map(e => e.metrics.dominantActionFreq)),
    dramaMeasure: mean(evals.map(e => e.metrics.dramaMeasure)),
  };

  const allFlags = [...new Set(evals.flatMap(e => [...e.degeneracyFlags]))];

  return { gameDefId, runCount: evals.length, metrics, degeneracyFlags: allFlags, perSeed: evals };
}
```

### Campaign Integration Example

Agent campaign harnesses use per-trace evaluation to filter degenerate seeds:

```typescript
// In campaign harness (e.g., run-tournament.mjs):
import { evaluateTrace, aggregateEvals } from '@ludoforge/engine';

const evals = traces.map(t => evaluateTrace(t, { scoringVar: 'totalOpposition' }));

// Filter degenerate seeds from strategy metrics
const healthyEvals = evals.filter(e => e.degeneracyFlags.length === 0);
const degenerateEvals = evals.filter(e => e.degeneracyFlags.length > 0);

// Compute strategy metrics only from healthy seeds
const avgMargin = mean(healthyEvals.map(e => computeSeatMargin(e)));

// Track degeneracy as a game-definition quality metric
const degeneracyRate = degenerateEvals.length / evals.length;

// Per-seed diagnostics
for (const e of degenerateEvals) {
  console.log(`Seed ${e.seed}: ${e.degeneracyFlags.join(', ')} (${e.turnCount} turns, ${e.stopReason})`);
}
```

## Invariants

1. All per-trace metrics are finite numbers (not NaN, not Infinity)
2. `actionDiversity`, `interactionProxy`, `dominantActionFreq` in [0, 1]
3. `dramaMeasure >= 0`
4. `avgBranchingFactor >= 0`
5. Degeneracy flags computed independently per trace
6. `LOOP_DETECTED` uses O(n) hash scan (Set-based)
7. Empty moves array in a trace → metrics default to 0, no flags except possibly NO_LEGAL_MOVES or TRIVIAL_WIN
8. Empty evals array to `aggregateEvals` → all metrics 0, no flags, empty perSeed
9. Delta reconstruction is deterministic: same finalState + same deltas → same reconstructed trajectory

## Required Tests

### Unit: evaluateTrace

**Per-trace metrics**:
- Known trace (10 turns) → gameLength = 10
- Known trace with varying legalMoveCount → expected avgBranchingFactor
- Trace where 1 action used exclusively → actionDiversity = 0
- Trace where 3 actions used equally → actionDiversity ≈ 1.0
- Trace with no cross-player deltas → interactionProxy = 0
- Trace where 90% moves are same action → dominantActionFreq ≈ 0.9
- Trace with scoringVar provided and 5 lead changes in 20 turns → dramaMeasure = 0.25
- Trace without scoringVar → dramaMeasure = 0
- Trace with empty moves → metrics all 0

**Per-trace degeneracy**:
- Repeated stateHash → LOOP_DETECTED
- No repeated hashes → LOOP_DETECTED not flagged
- stopReason 'noLegalMoves' → NO_LEGAL_MOVES
- stopReason 'maxTurns' → NO_LEGAL_MOVES not flagged
- 85% same action → DOMINANT_ACTION (default threshold 0.8)
- 70% same action → DOMINANT_ACTION not flagged
- 3-turn game with terminal result → TRIVIAL_WIN (threshold 5)
- 10-turn game → TRIVIAL_WIN not flagged
- 10 consecutive identical stateHashes → STALL
- No consecutive identical hashes → STALL not flagged
- triggerFirings with kind: 'truncated' → TRIGGER_DEPTH_EXCEEDED
- Healthy trace → zero flags

**Custom config**:
- TRIVIAL_WIN with threshold=3: 4-turn game → not flagged
- DOMINANT_ACTION with threshold=0.9: 85% same action → not flagged

### Unit: aggregateEvals

- Two TraceEvals with known metrics → means computed correctly
- Union of degeneracy flags across traces
- Empty evals array → all metrics 0, no flags
- Single TraceEval → metrics match per-trace metrics

### Unit: delta reconstruction

- Known finalState + known deltas → correct initial state reconstruction
- Forward replay matches original delta sequence
- Deltas targeting non-perPlayerVars paths are skipped
- Empty deltas → initial state equals finalState

### Integration

- Run 5 simulations (Spec 10), feed traces to evaluateTrace + aggregateEvals → valid EvalReport with reasonable metrics
- Deliberately degenerate game (loop setup) → LOOP_DETECTED in perSeed entry

### Property

- For any valid trace, all metrics are finite (not NaN, not Infinity)
- actionDiversity always in [0, 1]
- interactionProxy always in [0, 1]
- dominantActionFreq always in [0, 1]
- evaluateTrace is deterministic: same trace + config → same TraceEval

### Golden

- Known trace with precomputed metrics → exact metric values match
- Known trace with specific degeneracy pattern → expected flags

## Acceptance Criteria

- [ ] `evaluateTrace` computes all 7 per-trace metrics correctly
- [ ] `evaluateTrace` detects all 6 degeneracy flags per-trace
- [ ] `aggregateEvals` produces correct mean metrics and flag union
- [ ] `generateEvalReport` convenience wrapper works end-to-end
- [ ] No NaN or Infinity in any metric value
- [ ] Bounded metrics in [0, 1] range where specified
- [ ] Delta reconstruction correctly recovers per-turn perPlayerVars
- [ ] `scoringVar` config controls dramaMeasure (returns 0 if absent)
- [ ] Configurable thresholds via EvalConfig
- [ ] Empty traces/moves handled gracefully
- [ ] EvalReport contains perSeed breakdown (no full traces)

## Files to Create/Modify

```
packages/engine/src/sim/trace-eval.ts           # NEW — evaluateTrace, per-trace metrics + flags
packages/engine/src/sim/delta-reconstruct.ts     # NEW — delta reconstruction utilities
packages/engine/src/sim/aggregate-evals.ts       # NEW — aggregateEvals
packages/engine/src/sim/eval-report.ts           # NEW — generateEvalReport convenience wrapper
packages/engine/src/sim/eval-config.ts           # NEW — EvalConfig, DEFAULT_EVAL_CONFIG
packages/engine/src/sim/index.ts                 # MODIFY — re-export evaluator APIs
packages/engine/src/kernel/types-core.ts         # MODIFY — update EvalReport, add TraceEval/TraceMetrics
packages/engine/schemas/EvalReport.schema.json   # MODIFY — match new EvalReport shape (drop traces, add perSeed)
packages/engine/test/unit/sim/trace-eval.test.ts         # NEW
packages/engine/test/unit/sim/delta-reconstruct.test.ts  # NEW
packages/engine/test/unit/sim/aggregate-evals.test.ts    # NEW
packages/engine/test/unit/sim/eval-report.test.ts        # NEW
packages/engine/test/integration/sim/eval-full.test.ts   # NEW
```

## Schema Update Notes

When this spec is implemented, `packages/engine/schemas/EvalReport.schema.json` must be updated:
- Remove `traces` array property
- Add `perSeed` array of TraceEval objects
- Add `TraceMetrics` schema definition
- Add `TraceEval` schema definition

`packages/engine/src/kernel/types-core.ts` must be updated:
- Update `EvalReport` interface: drop `traces`, add `perSeed: readonly TraceEval[]`
- Add `TraceEval` and `TraceMetrics` interfaces
- Keep existing `Metrics` interface (now represents aggregated means)
- Keep existing `DegeneracyFlag` enum in `diagnostics.ts` (unchanged)

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Implemented the evaluator stack across `evaluateTrace`, delta reconstruction, `aggregateEvals`, and `generateEvalReport`, with the report contract centered on `perSeed` diagnostics rather than embedded raw traces.
  - Added the specified unit and integration coverage, including golden and simulator-produced evaluator tests.
  - Finalized the convenience wrapper as `generateEvalReport(gameDefId, traces, config?)`, which is cleaner than the earlier spec draft that passed a full `GameDef`.
- Deviations from original plan:
  - The wrapper contract was tightened during follow-up cleanup because the implementation proved it only needed an explicit `gameDefId`; keeping full `GameDef` input would have preserved unnecessary coupling.
  - The architecture remained on the explicit `@ludoforge/engine/sim` surface rather than adding any root export alias.
- Verification results:
  - Evaluator-focused tests passed, including `packages/engine/test/unit/sim/eval-report.test.ts` and `packages/engine/test/integration/sim/eval-full.test.ts`.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.

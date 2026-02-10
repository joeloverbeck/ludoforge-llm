# Spec 11: Evaluator & Degeneracy Detection

**Status**: Draft
**Priority**: P1 (required for MVP)
**Complexity**: M
**Dependencies**: Spec 10
**Estimated effort**: 2-3 days
**Source sections**: Brainstorming sections 2.4B, 2.4C, 6.5

## Overview

Implement the evaluation layer that analyzes game traces to produce quality metrics and detect degenerate game designs. Given one or more GameTraces from the simulator (Spec 10), compute 7 quality metrics (game length, branching factor, action diversity, resource tension, interaction, dominant action frequency, drama) and check for 6 degeneracy flags (loops, stalls, dominant actions, trivial wins, no legal moves, trigger depth exceeded). Output a structured `EvalReport` for use by the CLI (Spec 12) and evolution pipeline (Spec 14).

## Scope

### In Scope
- `computeMetrics(traces)` — compute 7 quality metrics from trace data
- `detectDegeneracy(traces)` — check for 6 degeneracy flags
- `generateEvalReport(def, traces)` — combine metrics + flags into structured report
- All computation from trace data only (no re-simulation needed)
- Configurable thresholds for degeneracy detection

### Out of Scope
- Fitness function tiers (Spec 14 — uses metrics from this spec)
- MAP-Elites archive management (Spec 14)
- BehaviorCharacterization computation (Spec 14 — but uses metrics from here)
- Human evaluation gates (post-MVP)
- Highlight/interesting-moment detection (nice-to-have, not MVP)
- Trace generation (Spec 10)

## Key Types & Interfaces

### Public API

```typescript
// Compute quality metrics from one or more game traces
function computeMetrics(traces: readonly GameTrace[]): Metrics;

// Detect degeneracy flags from one or more game traces
function detectDegeneracy(
  traces: readonly GameTrace[],
  config?: DegeneracyConfig
): readonly DegeneracyFlag[];

// Generate complete evaluation report
function generateEvalReport(
  def: GameDef,
  traces: readonly GameTrace[],
  config?: DegeneracyConfig
): EvalReport;
```

### Metrics (from Spec 02 types)

```typescript
interface Metrics {
  readonly avgGameLength: number;        // mean turns across traces
  readonly avgBranchingFactor: number;   // mean legal moves per turn
  readonly actionDiversity: number;      // normalized entropy [0, 1]
  readonly resourceTension: number;      // variance in resource levels
  readonly interactionProxy: number;     // effects targeting other players / total
  readonly dominantActionFreq: number;   // frequency of most-used action
  readonly dramaMeasure: number;         // lead changes / game length
}
```

### DegeneracyConfig

```typescript
interface DegeneracyConfig {
  readonly trivialWinThreshold: number;  // games shorter than this are trivial (default: 5)
  readonly stallTurnThreshold: number;   // consecutive same-hash turns to flag stall (default: 10)
  readonly dominantActionThreshold: number; // frequency above this flags dominant (default: 0.8)
}

const DEFAULT_DEGENERACY_CONFIG: DegeneracyConfig = {
  trivialWinThreshold: 5,
  stallTurnThreshold: 10,
  dominantActionThreshold: 0.8,
};
```

### EvalReport (from Spec 02 types)

```typescript
interface EvalReport {
  readonly gameDefId: string;
  readonly runCount: number;
  readonly metrics: Metrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
  readonly traces: readonly GameTrace[];
}
```

## Implementation Requirements

### computeMetrics

All metrics are computed from trace data only — no re-simulation.

#### 1. avgGameLength

```
avgGameLength = mean(traces.map(t => t.turnsCount))
```

Simple arithmetic mean of turn counts across all traces.

#### 2. avgBranchingFactor

The branching factor at each turn is the number of legal moves available. Spec 02/10 requires this as `MoveLog.legalMoveCount`, so no re-simulation is needed:

```
avgBranchingFactor = mean(
  traces.flatMap(t => t.moves.map(m => m.legalMoveCount))
)
```

#### 3. actionDiversity (normalized Shannon entropy)

```
For each trace:
  Count frequency of each actionId across all moves
  H = -sum(p_i * log2(p_i)) for each action with p_i > 0
  H_max = log2(numDistinctActions)
  normalizedEntropy = H / H_max (or 0 if only 1 action)

actionDiversity = mean(normalizedEntropy across traces)
```

Range: [0, 1] where 0 = one action used exclusively, 1 = perfectly uniform action distribution.

#### 4. resourceTension

Proxy for resource scarcity/competition between players:

```
For each trace, at each turn:
  For each per-player variable:
    Compute variance across players
  Average the variances across variables and turns

resourceTension = mean across traces
```

Higher tension = more variance in resource levels between players = more competitive dynamics.

#### 5. interactionProxy

Measures how much players' actions affect each other:

```
For each trace:
  Count effects that target other players (setVar/addVar with player != actor,
    moveToken from other player's zone, etc.)
  Count total effects applied
  ratio = otherPlayerEffects / totalEffects

interactionProxy = mean(ratio across traces)
```

Range: [0, 1] where 0 = purely solitaire, 1 = all effects target others.

**Approximation from deltas**: Since MoveLog contains deltas, count deltas that modify other players' state:
- Delta path starts with `perPlayerVars.<otherPlayerId>` → interaction
- Delta path is a zone owned by another player → interaction

#### 6. dominantActionFreq

```
For each trace:
  Count frequency of each actionId
  maxFreq = max(frequencies) / totalMoves

dominantActionFreq = mean(maxFreq across traces)
```

Range: [0, 1] where values near 1.0 indicate one action dominates play.

#### 7. dramaMeasure

Measures how often the leading player changes:

```
For each trace:
  At each turn, determine the leading player (highest score/VP)
  Count lead changes (leader at turn T differs from leader at turn T-1)
  drama = leadChanges / turnsCount

dramaMeasure = mean(drama across traces)
```

Requires identifying which variable represents "score" — use `def.scoring` if available, otherwise use the first per-player variable or VP if named.

### detectDegeneracy

Each flag is computed independently. Detecting one does not skip checking others.

#### LOOP_DETECTED

```
For each trace:
  Collect all stateHash values from MoveLog entries
  If any hash appears more than once → LOOP_DETECTED

Implementation: Use a Set<bigint> for O(n) scan per trace.
```

#### NO_LEGAL_MOVES

```
For each trace:
  If any MoveLog entry has legalMoveCount === 0 (before terminal)
  OR if trace ended without terminal result and moves array is shorter than maxTurns
  → NO_LEGAL_MOVES

Note: `legalMoveCount` is required by Spec 02/10; treat absence as invalid trace data.
(trace ended early without terminal result).
```

#### DOMINANT_ACTION

```
For each trace:
  Compute dominantActionFreq (same as metric)
  If dominantActionFreq > config.dominantActionThreshold (default 0.8)
  → DOMINANT_ACTION
```

#### TRIVIAL_WIN

```
For each trace:
  If trace.result is non-null AND trace.turnsCount < config.trivialWinThreshold (default 5)
  → TRIVIAL_WIN
```

#### STALL

```
For each trace:
  Scan consecutive MoveLog entries
  If config.stallTurnThreshold consecutive entries have identical stateHash
  → STALL
```

Note: Identical stateHash with different moves means the move had no effect — a degenerate pattern.

#### TRIGGER_DEPTH_EXCEEDED

```
For each trace:
  Scan all MoveLog.triggerFirings
  If any triggerFiring has depth >= maxTriggerDepth (from GameDef metadata)
  → TRIGGER_DEPTH_EXCEEDED

Alternative: Check for truncation markers in trigger chains.
```

### generateEvalReport

```typescript
function generateEvalReport(def, traces, config?): EvalReport {
  const mergedConfig = { ...DEFAULT_DEGENERACY_CONFIG, ...config };
  return {
    gameDefId: def.metadata.id,
    runCount: traces.length,
    metrics: computeMetrics(traces),
    degeneracyFlags: detectDegeneracy(traces, mergedConfig),
    traces,
  };
}
```

### MoveLog Contract

Spec 02 defines `MoveLog.legalMoveCount` and Spec 10 records it during simulation:

```typescript
interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerFiring[];
  readonly legalMoveCount: number; // number of legal moves available this turn
}
```

## Invariants

1. Metrics are computed from trace data only (no re-simulation needed)
2. All metrics are numeric — no NaN, no Infinity
3. `avgBranchingFactor >= 0`
4. `actionDiversity` in [0, 1] range (normalized entropy)
5. `interactionProxy` in [0, 1] range
6. `dominantActionFreq` in [0, 1] range
7. `dramaMeasure >= 0`
8. Degeneracy flags are computed independently (detecting one doesn't skip others)
9. `LOOP_DETECTED` uses Zobrist hashes from MoveLog (O(n) scan per trace, not O(n^2))
10. EvalReport includes results for all 6 degeneracy flag checks (even if none triggered)
11. Empty traces array → metrics default to 0, no degeneracy flags

## Required Tests

### Unit Tests

**computeMetrics**:
- Known traces (2 games, 10 turns each) → expected avgGameLength = 10
- Known traces with varying legal move counts → expected avgBranchingFactor
- Trace where 1 action used exclusively → actionDiversity = 0
- Trace where 3 actions used equally → actionDiversity ≈ 1.0
- Trace with no interaction effects → interactionProxy = 0
- Trace where 90% of moves are same action → dominantActionFreq ≈ 0.9
- Trace with 5 lead changes in 20 turns → dramaMeasure = 0.25
- Single trace → metrics computed correctly (edge case: N=1)
- Empty traces array → all metrics = 0

**detectDegeneracy**:
- Trace with repeated state hash → LOOP_DETECTED
- Trace with no repeated hashes → LOOP_DETECTED not flagged
- Trace with 0-move turn → NO_LEGAL_MOVES
- All turns have moves → NO_LEGAL_MOVES not flagged
- Trace where same action used 85% of time → DOMINANT_ACTION (with default threshold 0.8)
- Trace where most-used action is 70% → DOMINANT_ACTION not flagged
- 3-turn game with terminal result → TRIVIAL_WIN (with threshold 5)
- 10-turn game → TRIVIAL_WIN not flagged
- 10 consecutive identical state hashes → STALL
- No consecutive identical hashes → STALL not flagged
- Trigger firing at max depth → TRIGGER_DEPTH_EXCEEDED
- All triggers within depth → TRIGGER_DEPTH_EXCEEDED not flagged
- Healthy game trace → zero degeneracy flags

**Custom config**:
- TRIVIAL_WIN with threshold=3: 4-turn game → not flagged
- DOMINANT_ACTION with threshold=0.9: 85% same action → not flagged

**generateEvalReport**:
- Combines metrics and flags correctly
- Report has correct gameDefId and runCount

### Integration Tests

- Run 5 game simulations (from Spec 10), feed traces to evaluator → valid EvalReport with reasonable metrics
- Deliberately degenerate game (infinite loop setup) → LOOP_DETECTED flag set

### Property Tests

- For any set of valid traces, all metrics are finite numbers (not NaN, not Infinity)
- `actionDiversity` is always in [0, 1]
- `interactionProxy` is always in [0, 1]
- `dominantActionFreq` is always in [0, 1]
- `computeMetrics` is deterministic: same traces → same metrics

### Golden Tests

- Known traces with precomputed metrics → exact metric values match
- Known traces with specific degeneracy patterns → expected flags

## Acceptance Criteria

- [ ] All 7 metrics computed correctly from trace data
- [ ] All 6 degeneracy flags detected correctly
- [ ] No NaN or Infinity in any metric value
- [ ] Action diversity normalized to [0, 1] range
- [ ] Degeneracy flags computed independently
- [ ] LOOP_DETECTED uses O(n) hash scan
- [ ] Configurable thresholds for degeneracy detection
- [ ] Empty traces handled gracefully (zero metrics, no flags)
- [ ] EvalReport structure complete with all fields
- [ ] MoveLog includes legalMoveCount and branching-factor metric uses it directly

## Files to Create/Modify

```
src/sim/metrics.ts               # NEW — computeMetrics implementation
src/sim/degeneracy.ts            # NEW — detectDegeneracy implementation
src/sim/eval-report.ts           # NEW — generateEvalReport
src/sim/index.ts                 # MODIFY — re-export evaluator APIs
src/sim/simulator.ts             # MODIFY — record legalMoveCount in MoveLog
test/unit/metrics.test.ts        # NEW — metric computation tests
test/unit/degeneracy.test.ts     # NEW — degeneracy flag tests
test/unit/eval-report.test.ts    # NEW — report generation tests
test/integration/eval-full.test.ts  # NEW — evaluator with real simulation traces
```

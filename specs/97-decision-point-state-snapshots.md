# Spec 97: Decision-Point State Snapshots for Simulation Traces

**Status**: Draft
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 94 (completed -- agent evaluation diagnostics)
**Independent of**: Spec 95, Spec 96 (can be implemented in parallel)
**Estimated effort**: 2-3 days
**Origin**: FITL VC agent evolution campaign -- the OBSERVE phase was severely limited because traces capture WHAT the agent chose but not the game state context at each decision point. Without state-at-decision, identifying pivotal moments and diagnosing losses requires replaying entire games.

## Problem Statement

The simulation trace (`GameTrace`) captures the sequence of moves, the terminal result, and (since Spec 94) the agent's decision diagnostics. But it does NOT capture the **game state at each decision point**.

This creates three analysis gaps:

### 1. Loss Diagnosis is Opaque

When the VC agent loses seed 1009 (margin = -8, 3 moves, `noLegalMoves`), the trace shows the 3 moves but not WHY there were no more legal moves. Was it a resource problem? Were guerrillas swept? Did the opponent block key zones? Answering these requires replaying the game from scratch.

### 2. Pivotal Decision Identification is Impossible

To improve the agent, we need to identify decisions where a DIFFERENT choice would have changed the outcome. Without state context at each decision, we can't evaluate counterfactuals. The campaign's OBSERVE phase was limited to "Rally happened, Tax happened" without understanding "Rally was chosen when resources were 2 and bases were 3."

### 3. Evolution Loop OBSERVE Phase is Blind

The improve-loop skill's OBSERVE step reads `last-trace.json` to inform hypotheses. Currently it sees action sequences and scores but can't answer: "Where is the margin coming from? Which zones contribute opposition? When do opponents undo VC progress?" This forces hypotheses to be generic rather than targeted.

### What Spec 94 Added vs What's Missing

Spec 94 added **agent evaluation diagnostics**: preview outcome breakdown, completion statistics, per-candidate scoring details. These explain HOW the agent scored candidates at each decision.

What's still missing: the **game state context** that makes those scores meaningful. Knowing "Rally scored 3 and Tax scored 2" is useful. Knowing "Rally scored 3 when VC had 2 bases, 12 guerrillas, margin -3, and resources 4" is actionable.

## Goals

- Capture lightweight state snapshots at each agent decision point in the simulation trace
- Include per-faction victory metrics, resource levels, and key aggregate counts
- Make snapshot depth configurable (minimal / standard / verbose) to control trace size
- Enable trace consumers (campaign harnesses, CLI, runner) to analyze state context
- Maintain compatibility with existing trace consumers (snapshots are additive)
- Keep snapshot overhead proportional to snapshot depth setting

## Non-Goals

- Full game state serialization at each decision (too expensive, too large)
- Real-time streaming of state during simulation
- Interactive replay with state inspection (that's a runner feature)
- State diff computation between decisions (consumers can diff snapshots)
- Zone-level detail in minimal mode (standard/verbose only)

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | Snapshots capture generic game state properties (margins, resources, zone counts). No game-specific extraction logic. |
| #3 Visual Separation | Snapshots are observability data in `sim/`, not presentation data. |
| #5 Determinism | Snapshots are read-only observations of deterministic state. |
| #7 Immutability | Snapshot extraction reads state, never modifies it. |
| #11 Testing as Proof | Snapshot correctness is verified by comparing against manual state inspection in golden tests. |

## Proposed Design

### 1. Snapshot Depth Levels

```typescript
type SnapshotDepth = 'none' | 'minimal' | 'standard' | 'verbose';
```

| Depth | Content | Approximate Size (FITL) |
|-------|---------|------------------------|
| `none` | No snapshots (current behavior) | 0 bytes |
| `minimal` | Per-seat margin + resources | ~200 bytes |
| `standard` | Minimal + piece counts per seat + key aggregates | ~500 bytes |
| `verbose` | Standard + per-zone opposition/support + token distribution | ~2-5 KB |

### 2. Snapshot Schema

```typescript
interface DecisionPointSnapshot {
  readonly turnCount: number;
  readonly phaseId: string;
  readonly activePlayer: number;
  readonly seatMetrics: readonly SeatMetricSnapshot[];
}

interface SeatMetricSnapshot {
  readonly seatId: string;
  readonly margin: number;                    // victory margin
  readonly resources: number;                 // current resources
  readonly pieceCount?: number;               // total pieces on map (standard+)
  readonly basesOnMap?: number;               // bases on map (standard+)
  readonly piecesInAvailable?: number;        // pieces in available pool (standard+)
}

// verbose only
interface VerboseSnapshot extends DecisionPointSnapshot {
  readonly zoneSummaries?: readonly ZoneSummary[];
}

interface ZoneSummary {
  readonly zoneId: string;
  readonly controlLevel?: number;             // support/opposition numeric level
  readonly tokenCounts: Record<string, number>; // seatId -> piece count
}
```

### 3. Integration with Simulation Runner

The `runGame` function in `packages/engine/src/sim/` already iterates through the game loop calling `agent.chooseMove()` at each decision point. The snapshot is captured BEFORE the agent chooses:

```typescript
// In the game loop, before calling agent.chooseMove:
if (snapshotDepth !== 'none') {
  const snapshot = extractDecisionPointSnapshot(def, state, runtime, snapshotDepth);
  currentMoveEntry.snapshot = snapshot;
}
```

### 4. Snapshot Extraction

The extraction function is a pure read-only operation on `GameState`:

```typescript
function extractDecisionPointSnapshot(
  def: GameDef,
  state: GameState,
  runtime: GameDefRuntime,
  depth: SnapshotDepth,
): DecisionPointSnapshot {
  const seatMetrics = def.seats.map((seat, playerIndex) => {
    const margin = computeSeatMargin(def, runtime, state, seat.id);
    const resources = state.playerVars[playerIndex]?.resources ?? 0;

    if (depth === 'minimal') {
      return { seatId: seat.id, margin, resources };
    }

    // standard: add piece counts
    const pieceCount = countPlayerTokensOnMap(state, playerIndex);
    const basesOnMap = countPlayerTokensByType(state, playerIndex, 'base');
    const piecesInAvailable = countPlayerTokensInAvailable(state, playerIndex);

    return { seatId: seat.id, margin, resources, pieceCount, basesOnMap, piecesInAvailable };
  });

  const snapshot: DecisionPointSnapshot = {
    turnCount: state.turnCount,
    phaseId: String(state.currentPhase),
    activePlayer: state.activePlayer,
    seatMetrics,
  };

  if (depth === 'verbose') {
    (snapshot as VerboseSnapshot).zoneSummaries = extractZoneSummaries(state, def);
  }

  return snapshot;
}
```

### 5. Configuration

Snapshot depth is configured on `runGame` options (simulator level), not on the agent:

```typescript
interface RunGameOptions {
  readonly snapshotDepth?: SnapshotDepth;  // default: 'none'
}
```

Campaign harnesses set this based on their needs:

```javascript
// In run-tournament.mjs, for the trace seed:
const trace = runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, {
  snapshotDepth: seed === TRACE_SEED ? 'standard' : 'none',
}, runtime);
```

### 6. Trace Output Extension

The `MoveEntry` in the trace gains an optional `snapshot` field:

```typescript
interface MoveEntry {
  readonly move: Move;
  readonly player: number;
  readonly legalMoveCount: number;
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: DecisionPointSnapshot;  // NEW
}
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/sim/run-game.ts` | Accept `snapshotDepth` option, capture snapshots before agent decisions |
| `packages/engine/src/sim/snapshot.ts` | NEW: `extractDecisionPointSnapshot` function |
| `packages/engine/src/sim/types.ts` | Add `DecisionPointSnapshot`, `SeatMetricSnapshot` types |
| `packages/engine/src/kernel/types.ts` | Add `snapshot` to `MoveEntry` type |

### Trace Size Impact

For FITL with `standard` depth, trace seed only:

- 8 VC decisions per game * 500 bytes per snapshot = ~4 KB additional
- Total trace grows from ~18 KB to ~22 KB (22% increase, for 1 seed)

For `verbose` depth with 90 zones:

- 8 decisions * 5 KB per snapshot = ~40 KB additional
- Acceptable for single-seed diagnostic traces

Non-trace seeds (14 out of 15) have `snapshotDepth: 'none'` and zero overhead.

### Testing Strategy

- **Unit**: `extractDecisionPointSnapshot` at each depth level with known state
- **Unit**: Margin and resource extraction matches direct state inspection
- **Unit**: Piece count aggregation is correct for multi-owner zones
- **Integration**: `runGame` with `snapshotDepth: 'standard'` produces valid snapshots
- **Golden**: Trace with snapshots for known FITL seed matches expected output
- **Property**: Snapshot extraction never modifies game state
- **Property**: `snapshotDepth: 'none'` adds zero overhead (no snapshot objects created)

# Spec 97: Decision-Point State Snapshots for Simulation Traces

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 94 (completed — agent evaluation diagnostics)
**Independent of**: Spec 95, Spec 96 (can be implemented in parallel)
**Estimated effort**: 2-3 days
**Origin**: FITL VC agent evolution campaign — the OBSERVE phase was severely limited because traces capture WHAT the agent chose but not the game state context at each decision point. Without state-at-decision, identifying pivotal moments and diagnosing losses requires replaying entire games.

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
- Include per-seat victory margins, per-player variables, and token counts — all extracted generically from game state without game-specific logic
- Make snapshot depth configurable (none / minimal / standard / verbose) to control trace size
- Enable trace consumers (campaign harnesses, CLI, runner) to analyze state context
- Maintain compatibility with existing trace consumers (snapshots are additive)
- Keep snapshot overhead proportional to snapshot depth setting
- Degrade gracefully for games without `victoryStandings` or `seatGroupConfig`

## Non-Goals

- Full game state serialization at each decision (too expensive, too large)
- Real-time streaming of state during simulation
- Interactive replay with state inspection (that's a runner feature)
- State diff computation between decisions (consumers can diff snapshots)
- Zone-level detail in minimal mode (standard/verbose only)

## Foundation Alignment

| Foundation | Alignment |
|------------|-----------|
| #1 Engine Agnosticism | Snapshots extract generic game state: margins from `terminal.margins` ValueExprs, per-player variables from `state.perPlayerVars`, token counts via `countSeatTokens()` with the game's `seatGroupConfig.seatProp`. No hardcoded game-specific field names or extraction logic. Games without `victoryStandings`/`seatGroupConfig` gracefully skip token counts. |
| #3 Visual Separation | Snapshots are observability data in `sim/`, not presentation data. |
| #5 Determinism | Snapshots are read-only observations of deterministic state. |
| #7 Immutability | Snapshot extraction reads state, never modifies it. All snapshot objects are constructed immutably via spread — no cast-and-mutate patterns. |
| #11 Testing as Proof | Snapshot correctness is verified by comparing against manual state inspection in golden tests. |

## Proposed Design

### 1. Snapshot Depth Levels

```typescript
type SnapshotDepth = 'none' | 'minimal' | 'standard' | 'verbose';
```

| Depth | Content | Approximate Size (FITL) |
|-------|---------|------------------------|
| `none` | No snapshots (current behavior) | 0 bytes |
| `minimal` | Turn count, phase, active player, per-seat margin | ~200 bytes |
| `standard` | Minimal + per-player variables + global variables + total token count per seat on board | ~500 bytes |
| `verbose` | Standard + per-zone token counts by seat + zone variables | ~2-5 KB |

### 2. Snapshot Schema

```typescript
// All depth levels
interface DecisionPointSnapshot {
  readonly turnCount: number;
  readonly phaseId: string;
  readonly activePlayer: number;
  readonly seatStandings: readonly SeatStandingSnapshot[];
}

interface SeatStandingSnapshot {
  readonly seat: string;
  readonly margin: number;                                          // from terminal.margins ValueExpr
  readonly perPlayerVars?: Readonly<Record<string, VariableValue>>; // standard+: all per-player vars
  readonly tokenCountOnBoard?: number;                              // standard+: total tokens on board zones (requires seatGroupConfig)
}

// standard+ adds global vars to the snapshot
interface StandardDecisionPointSnapshot extends DecisionPointSnapshot {
  readonly globalVars: Readonly<Record<string, VariableValue>>;
}

// verbose adds per-zone detail
interface VerboseDecisionPointSnapshot extends StandardDecisionPointSnapshot {
  readonly zoneSummaries: readonly ZoneSummary[];
}

interface ZoneSummary {
  readonly zoneId: string;
  readonly zoneVars?: Readonly<Record<string, number>>;
  readonly tokenCountBySeat?: Readonly<Record<string, number>>; // requires seatGroupConfig
}
```

### 3. Integration with Simulation Runner

The `runGame` function in `packages/engine/src/sim/simulator.ts` already iterates through the game loop calling `agent.chooseMove()` at each decision point. The snapshot is captured BEFORE the agent chooses:

```typescript
// In the game loop (simulator.ts), before calling agent.chooseMove:
if (snapshotDepth !== 'none') {
  const snapshot = extractDecisionPointSnapshot(def, state, runtime, snapshotDepth);
  // snapshot is attached to the MoveLog entry after the move is made
}
```

### 4. Snapshot Extraction

The extraction function is a pure read-only operation on `GameState`. It reuses existing kernel infrastructure:

- **Margins**: Evaluates `def.terminal.margins` ValueExpr formulas via `evalValue()` + `buildEvalContext()` — the same pattern used by `finalVictoryRanking()` in `terminal.ts`
- **Per-player variables**: Reads `state.perPlayerVars[seatIndex]` directly — all variables the game defines for each player
- **Global variables**: Reads `state.globalVars` directly
- **Token counts**: Uses `countSeatTokens()` from `derived-values.ts` with the game's `seatGroupConfig.seatProp` — only when `def.victoryStandings?.seatGroupConfig` is available

```typescript
function extractDecisionPointSnapshot(
  def: ValidatedGameDef,
  state: GameState,
  runtime: GameDefRuntime,
  depth: SnapshotDepth,
): DecisionPointSnapshot | StandardDecisionPointSnapshot | VerboseDecisionPointSnapshot {
  const margins = def.terminal.margins ?? [];
  const resources = createEvalRuntimeResources();
  const seatGroupConfig = def.victoryStandings?.seatGroupConfig;
  const boardZones = def.zones.filter((z) => z.zoneKind === 'board');

  const seatStandings = margins.map((marginDef): SeatStandingSnapshot => {
    const ctx = buildEvalContext(def, runtime.adjacencyGraph, runtime.runtimeTableIndex, state, resources);
    const rawMargin = evalValue(marginDef.value, ctx);
    const margin = typeof rawMargin === 'number' ? rawMargin : 0;

    if (depth === 'minimal') {
      return { seat: marginDef.seat, margin };
    }

    // standard+: add per-player vars and token count
    const seatIndex = def.seats.findIndex((s) => s.id === marginDef.seat);
    const perPlayerVars = seatIndex >= 0
      ? (state.perPlayerVars[seatIndex] ?? {})
      : {};

    const tokenCountOnBoard = seatGroupConfig !== undefined
      ? boardZones.reduce(
          (sum, zone) => sum + countSeatTokens(state, zone.id, [marginDef.seat], seatGroupConfig.seatProp),
          0,
        )
      : undefined;

    return { seat: marginDef.seat, margin, perPlayerVars, tokenCountOnBoard };
  });

  const base: DecisionPointSnapshot = {
    turnCount: state.turnCount,
    phaseId: String(state.currentPhase),
    activePlayer: state.activePlayer,
    seatStandings,
  };

  if (depth === 'minimal') return base;

  const standard: StandardDecisionPointSnapshot = {
    ...base,
    globalVars: state.globalVars,
  };

  if (depth === 'standard') return standard;

  // verbose: add per-zone summaries
  const zoneSummaries = boardZones.map((zoneDef): ZoneSummary => {
    const zoneVars = state.zoneVars[zoneDef.id];
    const tokenCountBySeat = seatGroupConfig !== undefined
      ? Object.fromEntries(
          def.seats.map((seat) => [
            seat.id,
            countSeatTokens(state, zoneDef.id, [seat.id], seatGroupConfig.seatProp),
          ]),
        )
      : undefined;

    return {
      zoneId: zoneDef.id,
      ...(zoneVars !== undefined ? { zoneVars } : {}),
      ...(tokenCountBySeat !== undefined ? { tokenCountBySeat } : {}),
    };
  });

  return { ...standard, zoneSummaries };
}
```

### 5. Configuration

Snapshot depth is configured via `ExecutionOptions` (the existing options type for `runGame`):

```typescript
// In packages/engine/src/kernel/types-core.ts, extend ExecutionOptions:
interface ExecutionOptions {
  // ... existing fields ...
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

The `MoveLog` type in `packages/engine/src/kernel/types-core.ts` gains an optional `snapshot` field:

```typescript
interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
  readonly moveContext?: MoveContext;
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: DecisionPointSnapshot;  // NEW
}
```

### 7. Trace Enrichment and Serialization

The snapshot must propagate through the enrichment and serialization pipeline:

**`packages/engine/src/sim/enriched-trace-types.ts`** — `EnrichedMoveLog` already extends `MoveLog`, so the `snapshot` field propagates automatically.

**`packages/engine/src/sim/trace-enrichment.ts`** — No changes needed. `enrichTrace` spreads `MoveLog` fields into `EnrichedMoveLog`, so `snapshot` propagates.

**`packages/engine/src/sim/trace-writer.ts`** — `writeEnrichedTrace` already serializes all `MoveLog` fields via spread. Snapshot types are plain objects with no BigInt or non-JSON-serializable fields, so they serialize cleanly with `JSON.stringify`. No explicit changes needed.

### Graceful Degradation

| Game Configuration | Behavior |
|--------------------|----------|
| Has `terminal.margins` + `victoryStandings.seatGroupConfig` | Full snapshots at all depth levels |
| Has `terminal.margins`, no `victoryStandings` | Margins computed; `tokenCountOnBoard` and `tokenCountBySeat` are `undefined` |
| No `terminal.margins` | `seatStandings` is empty array; global/zone vars still captured at standard+ |
| No seats defined | `seatStandings` is empty; zone summaries (verbose) still work |

### Files to Modify

| File | Change |
|------|--------|
| `packages/engine/src/sim/simulator.ts` | Read `snapshotDepth` from `ExecutionOptions`, capture snapshots before agent decisions, attach to `MoveLog` entries |
| `packages/engine/src/sim/snapshot.ts` | NEW: `extractDecisionPointSnapshot` pure function |
| `packages/engine/src/sim/snapshot-types.ts` | NEW: `DecisionPointSnapshot`, `SeatStandingSnapshot`, `StandardDecisionPointSnapshot`, `VerboseDecisionPointSnapshot`, `ZoneSummary`, `SnapshotDepth` types |
| `packages/engine/src/kernel/types-core.ts` | Add `snapshot?: DecisionPointSnapshot` to `MoveLog`, add `snapshotDepth?: SnapshotDepth` to `ExecutionOptions` |
| `packages/engine/src/sim/index.ts` | Re-export snapshot types |

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
- **Unit**: Margin extraction evaluates `terminal.margins` ValueExprs correctly
- **Unit**: Per-player variable extraction matches `state.perPlayerVars` for each seat
- **Unit**: Token count aggregation uses `countSeatTokens` correctly for multi-owner zones
- **Unit**: Games without `victoryStandings` produce snapshots with `undefined` token counts
- **Unit**: Games without `terminal.margins` produce snapshots with empty `seatStandings`
- **Integration**: `runGame` with `snapshotDepth: 'standard'` produces valid snapshots in `MoveLog`
- **Integration**: Snapshots serialize and deserialize cleanly through `writeEnrichedTrace`
- **Golden**: Trace with snapshots for known FITL seed matches expected output
- **Property**: Snapshot extraction never modifies game state (compare state hash before/after)
- **Property**: `snapshotDepth: 'none'` adds zero overhead (no snapshot objects created)

## Outcome

- **Completion date**: 2026-03-30
- **What changed**: All five tickets (97DECPOISTA-001 through 005) implemented:
  - 001: Snapshot types (`SnapshotDepth`, `DecisionPointSnapshot`, `StandardDecisionPointSnapshot`, `VerboseDecisionPointSnapshot`) and extraction logic in `packages/engine/src/sim/snapshot.ts` and `snapshot-types.ts`
  - 002: Simulator integration — `runGame` captures snapshots into `MoveLog` at the configured depth
  - 003: `MoveLog.snapshot` wired into kernel types, enriched trace, and serialization
  - 004: Snapshot serialization round-trip tests and integration coverage
  - 005: Options-layer cleanup — `SimulationOptions` type introduced, `skipDeltas`/`snapshotDepth` moved out of kernel `ExecutionOptions` into sim-owned contract
- **Deviations from plan**: The spec proposed adding `snapshotDepth` to `ExecutionOptions`; ticket 005 subsequently cleaned this up by introducing a dedicated `SimulationOptions` with nested `kernel` options, giving cleaner ownership boundaries.
- **Verification**: `pnpm turbo typecheck` pass, `pnpm turbo test` 5149/5149 pass, `pnpm turbo lint` pass

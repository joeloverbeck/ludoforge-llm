# 97DECPOISTA-003: Simulator integration and sim index exports

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — simulator.ts, sim/index.ts
**Deps**: tickets/97DECPOISTA-002.md

## Problem

The `extractDecisionPointSnapshot` function exists (from 002) but is not wired into the simulation loop. The `runGame` function in `simulator.ts` must read `snapshotDepth` from `ExecutionOptions`, call the extraction function before each agent decision, and attach the resulting snapshot to the `MoveLog` entry. The snapshot types also need to be re-exported from `sim/index.ts` for consumer access.

## Assumption Reassessment (2026-03-30)

1. `runGame` signature (simulator.ts:70-78) accepts `options?: ExecutionOptions` as 6th parameter — confirmed.
2. `MoveLog` entries are constructed at simulator.ts:166-180 after `applyMove` — the snapshot must be captured BEFORE `agent.chooseMove()` and attached to the MoveLog entry after the move is made.
3. The game loop in `runGame` iterates via a while loop calling `legalMoves` and `agent.chooseMove()` — snapshot capture point is after `legalMoves` is computed but before `chooseMove`.
4. `sim/index.ts` currently exports from 7 modules — adding snapshot exports is straightforward.
5. `GameDefRuntime` is available in `runGame` (either passed in or constructed internally) — confirmed from simulator.ts parameter list.

## Architecture Check

1. **Minimal simulator change**: The simulator gains ~5 lines: read `snapshotDepth`, conditionally call `extractDecisionPointSnapshot`, spread result into MoveLog. No structural refactoring.
2. **Engine agnosticism (Foundation #1)**: The simulator calls the generic extraction function — it doesn't know what's in the snapshot.
3. **Performance**: When `snapshotDepth` is `'none'` (or undefined), no extraction function is called and no snapshot object is created — zero overhead for non-snapshot runs.
4. **Intentional deferral of options-layer cleanup**: `runGame()` currently accepts the shared `ExecutionOptions` bag because existing callers already pass kernel execution flags through that surface. Extracting sim-only flags into a dedicated sim options type is the cleaner long-term architecture, but that should be handled as a separate follow-up ticket rather than expanding this integration ticket's scope.

## What to Change

### 1. Modify `packages/engine/src/sim/simulator.ts`

In the `runGame` function:

1. Read `snapshotDepth` from `options?.snapshotDepth ?? 'none'` at function start.
2. Before each `agent.chooseMove()` call, if `snapshotDepth !== 'none'`, call `extractDecisionPointSnapshot(def, state, runtime, snapshotDepth)` and store the result.
3. When constructing the `MoveLog` entry (lines 166-180), spread the snapshot: `...(snapshot !== undefined ? { snapshot } : {})`.

Import `extractDecisionPointSnapshot` from `./snapshot.js`.

### 2. Modify `packages/engine/src/sim/index.ts`

Add re-exports:

```typescript
export type {
  SnapshotDepth,
  DecisionPointSnapshot,
  SeatStandingSnapshot,
  StandardDecisionPointSnapshot,
  VerboseDecisionPointSnapshot,
  ZoneSummary,
} from './snapshot-types.js';
export { extractDecisionPointSnapshot } from './snapshot.js';
```

### 3. New test: `packages/engine/test/integration/sim/snapshot-integration.test.ts`

Integration test that:
- Calls `runGame` with `snapshotDepth: 'standard'` on a minimal GameDef fixture
- Verifies every `MoveLog` entry in the resulting `GameTrace` has a `snapshot` field
- Verifies snapshot fields contain expected values (turnCount, phaseId, activePlayer, seatStandings with margins)
- Calls `runGame` with `snapshotDepth: 'none'` (or no option) and verifies no `snapshot` fields exist on `MoveLog` entries
- Calls `runGame` with `snapshotDepth: 'verbose'` and verifies `zoneSummaries` are present

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify)
- `packages/engine/test/integration/sim/snapshot-integration.test.ts` (new)

## Out of Scope

- Type definitions (delivered by 97DECPOISTA-001)
- Extraction function implementation (delivered by 97DECPOISTA-002)
- Refactoring `runGame()` / `runGames()` to use a dedicated sim-local options type instead of shared `ExecutionOptions` — tracked separately in `tickets/97DECPOISTA-005.md`
- Enrichment pipeline changes — `EnrichedMoveLog` already inherits `snapshot` from `MoveLog`
- Trace writer changes — `writeEnrichedTrace` already serializes all MoveLog fields via spread
- Golden test with known FITL seed (that is 97DECPOISTA-004)
- Any runner-side changes
- Campaign harness changes (consumers decide their own `snapshotDepth`)

## Acceptance Criteria

### Tests That Must Pass

1. `node --test packages/engine/test/integration/sim/snapshot-integration.test.ts` — all integration tests pass
2. `pnpm turbo typecheck` — simulator changes type-check
3. `pnpm turbo test` — no regressions, including existing simulator tests

### Invariants

1. `snapshotDepth: 'none'` (or omitted) produces **zero** snapshot objects — no performance overhead for existing behavior
2. Every `MoveLog` entry with a snapshot has `snapshot.turnCount`, `snapshot.phaseId`, `snapshot.activePlayer`, and `snapshot.seatStandings` populated
3. Snapshot is captured BEFORE `agent.chooseMove()` — it reflects the state the agent saw, not the state after the move
4. Existing `runGame` call sites (without `snapshotDepth`) continue to work unchanged
5. All `MoveLog` fields from existing tests remain identical — snapshots are purely additive

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/sim/snapshot-integration.test.ts` — integration tests for `runGame` with snapshot depths `'none'`, `'standard'`, `'verbose'`

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/integration/sim/snapshot-integration.test.ts`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

# 11EVADEGDET-002: Delta reconstruction for per-player variable trajectories

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new sim module
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/specs/10-simulator-trace-logger.md

## Problem

Two Spec 11 metrics — `resourceTension` and `dramaMeasure` — require knowing per-player variable values at every turn, not just the final state. The trace records deltas (before/after), so we must reconstruct the per-turn `perPlayerVars` trajectory by reversing deltas from `finalState` back to initial state, then replaying forward.

## Assumption Reassessment (2026-03-29)

1. `StateDelta.path` format: string like `"perPlayerVars.0.resources"` — confirmed in types-core.ts.
2. `GameState.perPlayerVars` type: `Record<number, Record<string, VariableValue>>` where keys are 0-based player indices — confirmed at line ~859.
3. `MoveLog.deltas` is `readonly StateDelta[]` — confirmed at line ~1407.
4. `GameTrace.finalState` provides the anchor for reverse reconstruction — confirmed.
5. `VariableValue` is `number | boolean` — need to verify.

## Architecture Check

1. Delta reconstruction is a pure function: `(finalState.perPlayerVars, moves[].deltas) → perPlayerVars[]` per turn. No side effects, no game-specific logic (Foundation §1).
2. Reconstruction operates only on `perPlayerVars` deltas (path prefix `perPlayerVars.`). Other delta paths (zones, globalVars) are skipped — this keeps the module focused.
3. The module is placed in `sim/` because it operates on trace data (sim domain), not kernel state transitions.

## What to Change

### 1. Create `packages/engine/src/sim/delta-reconstruct.ts`

Implement:

```typescript
/**
 * Reconstruct per-player variable state at each turn from trace deltas.
 *
 * Algorithm:
 *   1. Start from finalState.perPlayerVars
 *   2. Reverse-walk all deltas (last move to first) restoring 'before' values
 *      for paths matching perPlayerVars.<playerId>.<varName>
 *   3. That gives the initial perPlayerVars (turn 0)
 *   4. Replay forward, applying deltas to produce perPlayerVars at each turn
 *
 * Returns an array of length moves.length + 1 (turn 0 through final turn).
 */
export function reconstructPerPlayerVarTrajectory(
  finalPerPlayerVars: Readonly<Record<number, Readonly<Record<string, VariableValue>>>>,
  moves: readonly MoveLog[]
): readonly Readonly<Record<number, Readonly<Record<string, VariableValue>>>>[];
```

Internal helpers:
- `parsePerPlayerVarPath(path: string): { playerId: number; varName: string } | null` — returns null if path doesn't match `perPlayerVars.<int>.<name>`.
- Deep-clone helper for perPlayerVars snapshots (small records, spread is fine).

### 2. Re-export from `sim/index.ts`

Add `reconstructPerPlayerVarTrajectory` to sim barrel export.

## Files to Touch

- `packages/engine/src/sim/delta-reconstruct.ts` (new)
- `packages/engine/src/sim/index.ts` (modify — add export)
- `packages/engine/test/unit/sim/delta-reconstruct.test.ts` (new)

## Out of Scope

- Metric computation that uses the trajectory (11EVADEGDET-003)
- Reconstruction of non-perPlayerVars state (zones, globalVars) — explicitly deferred per spec
- `dramaMeasure` scoring var filtering (11EVADEGDET-003)
- Any changes to `StateDelta`, `MoveLog`, or `GameTrace` types

## Acceptance Criteria

### Tests That Must Pass

1. Known finalState + known deltas → correct initial state reconstruction
2. Forward replay matches original delta sequence (round-trip)
3. Deltas targeting non-`perPlayerVars` paths are skipped
4. Empty deltas → initial state equals finalState (trajectory is single snapshot)
5. Empty moves → trajectory is single snapshot of finalState perPlayerVars
6. Multi-player (3+ players) reconstruction is correct
7. Multiple variables per player are reconstructed independently
8. `pnpm turbo typecheck`
9. `pnpm turbo test`

### Invariants

1. Reconstruction is deterministic: same inputs → same output (Foundation §5)
2. No mutation of input `finalPerPlayerVars` or `moves` (Foundation §7)
3. Output array length === `moves.length + 1`
4. Each snapshot in the trajectory is a fresh object (no shared references)
5. Engine agnosticism: no game-specific variable names referenced

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/delta-reconstruct.test.ts`:
   - `reconstructPerPlayerVarTrajectory` with 2-player, 2-variable, 5-turn trace
   - Round-trip: reconstruct → verify each turn matches expected snapshot
   - Non-perPlayerVars deltas ignored
   - Empty moves/deltas edge case
   - Single-player edge case
   - `parsePerPlayerVarPath` internal validation (if exported for testing)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern delta-reconstruct`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

# 11EVADEGDET-002: Delta reconstruction for per-player variable trajectories

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — extend existing sim delta utilities
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/specs/10-simulator-trace-logger.md

## Problem

Two Spec 11 metrics — `resourceTension` and `dramaMeasure` — require knowing per-player variable values at every turn, not just the final state. The trace records deltas (before/after), so we must reconstruct the per-turn `perPlayerVars` trajectory by reversing deltas from `finalState` back to initial state, then replaying forward.

## Assumption Reassessment (2026-03-29)

1. `StateDelta.path` format for tracked per-player vars is emitted by `packages/engine/src/sim/delta.ts` as `perPlayerVars.<playerIndex>.<varName>`, so reconstruction should share that ownership instead of introducing a parallel path contract.
2. `GameState.perPlayerVars` type is `Readonly<Record<number, Readonly<Record<string, VariableValue>>>>` in `types-core.ts`; runtime object keys are still string property names, so reconstruction must treat parsed indices numerically and write back through normal object properties.
3. `MoveLog.deltas` is `readonly StateDelta[]` — confirmed in `types-core.ts`.
4. `GameTrace.finalState` provides the anchor for reverse reconstruction — confirmed in `types-core.ts`.
5. `VariableValue` is `number | boolean` — confirmed in `types-core.ts`.
6. Existing unit coverage already lives under `packages/engine/test/unit/sim/delta.test.ts`, so this work should either extend that seam or add a sibling test in the same domain without creating a second competing delta utility story.

## Architecture Check

1. Delta reconstruction remains a pure function: `(finalState.perPlayerVars, moves[].deltas) → perPlayerVars[]` per turn. No side effects, no game-specific logic (Foundation §1).
2. Reconstruction should live beside `computeDeltas` in `packages/engine/src/sim/delta.ts`, because both features own the same path encoding/decoding contract for tracked trace deltas. Creating a separate `delta-reconstruct.ts` module would split one concern across two files without a clean boundary.
3. Reconstruction operates only on `perPlayerVars` deltas (path prefix `perPlayerVars.`). Other delta paths (zones, globalVars, turn metadata) are skipped — this keeps the utility narrowly aligned with Spec 11’s stated need.
4. The API should return immutable snapshots with no shared nested references between turns, because later metric computation will treat each turn as an independent read-only snapshot.

## What to Change

### 1. Extend `packages/engine/src/sim/delta.ts`

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
 - Apply helpers should support both reverse (`before`) and forward (`after`) replay so the same parsing logic is reused in both directions.

### 2. Re-export from `sim/index.ts`

Add `reconstructPerPlayerVarTrajectory` to the sim barrel export alongside `computeDeltas`.

## Files to Touch

- `packages/engine/src/sim/delta.ts` (modify)
- `packages/engine/src/sim/index.ts` (modify — add export)
- `packages/engine/test/unit/sim/delta-reconstruct.test.ts` (new) or `packages/engine/test/unit/sim/delta.test.ts` (extend)

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
4. Empty deltas across all moves → initial state equals finalState and every turn snapshot matches that unchanged state
5. Empty moves → trajectory is single snapshot of finalState perPlayerVars
6. Multi-player (3+ players) reconstruction is correct
7. Multiple variables per player are reconstructed independently
8. `pnpm turbo typecheck`
9. `pnpm turbo test`

### Invariants

1. Reconstruction is deterministic: same inputs → same output (Foundation §5)
2. No mutation of input `finalPerPlayerVars` or `moves` (Foundation §7)
3. Output array length === `moves.length + 1`
4. Each snapshot in the trajectory is a fresh object, including nested per-player var records (no shared references across turns)
5. Engine agnosticism: no game-specific variable names referenced

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/delta-reconstruct.test.ts` (or equivalent coverage added to `delta.test.ts`):
   - `reconstructPerPlayerVarTrajectory` with 2-player, 2-variable, 5-turn trace
   - Round-trip: reconstruct → verify each turn matches expected snapshot
   - Non-perPlayerVars deltas ignored
   - Empty moves/deltas edge case
   - Single-player edge case
   - Added/removed variable keys replay correctly (`before` or `after` may be `undefined`)
   - Returned snapshots do not alias each other or the input `finalPerPlayerVars`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/delta-reconstruct.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Extended `packages/engine/src/sim/delta.ts` with `reconstructPerPlayerVarTrajectory` instead of creating a separate reconstruction module, so delta emission and delta replay now share one ownership boundary.
  - Added undefined-aware reverse and forward replay for `perPlayerVars` deltas, covering added and removed variable keys as part of reconstruction.
  - Re-exported the new reconstruction utility from `packages/engine/src/sim/index.ts`.
  - Added `packages/engine/test/unit/sim/delta-reconstruct.test.ts` to cover multi-turn replay, ignored non-player deltas, empty-move behavior, and snapshot non-aliasing.
- Deviations from original plan:
  - The original ticket proposed a new `sim/delta-reconstruct.ts` file. After reassessing the current architecture, the implementation was folded into the existing `sim/delta.ts` utility because that file already owns the `StateDelta.path` contract for tracked trace deltas.
  - The original focused test command used a Jest-style pattern workflow that does not fit this repo. Verification used the build-then-compiled-test path required by the engine’s Node test runner.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/delta-reconstruct.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`

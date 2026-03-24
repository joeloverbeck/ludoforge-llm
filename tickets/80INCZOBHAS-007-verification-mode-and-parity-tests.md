# 80INCZOBHAS-007: Verification Mode and Comprehensive Parity Tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — types-core.ts (ExecutionOptions), apply-move.ts (verification logic), new test files
**Deps**: 80INCZOBHAS-006

## Problem

After the switchover (ticket 006), `computeFullHash` is no longer called on
every move. If a future code change introduces an effect handler that fails to
update `_runningHash`, the incremental hash will silently drift from the true
hash. A verification mode is needed to catch this in CI and during development.
Additionally, comprehensive parity tests must prove that the incremental hash
is bit-identical to the full-recompute hash across all games, seeds, and edge
cases.

## Assumption Reassessment (2026-03-24)

1. `ExecutionOptions` is in `types-core.ts` (~line 1359) — confirmed.
2. `applyMoveCore` receives `options?: ExecutionOptions` — confirmed.
3. `computeFullHash` remains available in `zobrist.ts` — confirmed (not deleted in ticket 006).
4. Existing determinism tests already assert identical `stateHash` across runs — confirmed.
5. Golden trace tests exist for both Texas Hold'em and FITL — confirmed.
6. The spec calls for verification on: all determinism tests, first N moves of every test run, periodic check every K moves — confirmed.

## Architecture Check

1. Verification mode is opt-in via `ExecutionOptions.verifyIncrementalHash` — no performance impact when disabled.
2. The verification check is a single `computeFullHash` call + comparison — straightforward to add.
3. Engine-agnosticism preserved — verification is a generic kernel diagnostic.
4. No shims or backwards-compatibility concerns.

## What to Change

### 1. Add `verifyIncrementalHash` to `ExecutionOptions`

In `types-core.ts`, add to `ExecutionOptions`:

```typescript
readonly verifyIncrementalHash?: boolean | {
  /** Verify every N moves (default: every move when true). */
  readonly interval?: number;
};
```

When `true`, verify every move. When `{ interval: N }`, verify every Nth move.

### 2. Add Verification Logic in `applyMoveCore`

After the switchover assignment (`stateHash: progressedState._runningHash`), if verification is enabled:

```typescript
if (shouldVerify(options, moveCount)) {
  const table = cachedRuntime?.zobristTable ?? createZobristTable(def);
  const fullHash = computeFullHash(table, stateWithHash);
  if (fullHash !== stateWithHash.stateHash) {
    throw new DeterminismError({
      message: 'Incremental Zobrist hash drift detected',
      expected: fullHash,
      actual: stateWithHash.stateHash,
      moveIndex: moveCount,
      // Include diagnostic context
    });
  }
}
```

### 3. Parity Test — Every Move, Multiple Games and Seeds

Create a test that runs full simulations with `verifyIncrementalHash: true`:
- Texas Hold'em: 5 seeds, 50+ moves each.
- FITL: 3 seeds, 100+ moves each (if feasible in test time).
- Verify at every move that `_runningHash === computeFullHash(table, state)`.

### 4. Property Test — Random Play

Run 100+ random-play games with verification enabled. Use `RandomAgent` to generate diverse move sequences. Assert no verification failures.

### 5. Edge Case Tests

Specific scenarios that stress individual feature types:
- Token creation followed by immediate destruction.
- Phase cycling (advance through all phases back to start).
- Marker flip twice (should return to original hash).
- Empty zone operations (moveAll from empty zone = no-op = no hash change).
- Player elimination (if applicable).
- Shuffle of a 1-token zone (slot stays 0).
- transferVar where source and dest are the same player.

### 6. Golden Hash Test

Verify that existing golden trace files still produce identical `stateHash` values. These tests already exist — ensure they pass with the incremental path.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `verifyIncrementalHash` to `ExecutionOptions`)
- `packages/engine/src/kernel/apply-move.ts` (modify — add verification logic after switchover)
- `packages/engine/test/unit/kernel/zobrist-incremental-parity.test.ts` (new — per-move parity tests)
- `packages/engine/test/unit/kernel/zobrist-incremental-edge-cases.test.ts` (new — edge case tests)
- `packages/engine/test/integration/kernel/zobrist-incremental-property.test.ts` (new — random-play property tests)

## Out of Scope

- Modifying any effect handlers (tickets 002–005).
- The switchover itself (ticket 006).
- Performance benchmarking or profiling.
- Runner package changes.
- Modifying existing golden trace files.
- Adding `verifyIncrementalHash` to CI configuration (can be a follow-up).

## Acceptance Criteria

### Tests That Must Pass

1. **Parity test**: For every move in Texas Hold'em (5 seeds × 50+ moves), `_runningHash === computeFullHash(table, state)`.
2. **Parity test**: For every move in FITL (3 seeds × 100+ moves), `_runningHash === computeFullHash(table, state)`.
3. **Property test**: 100+ random-play games complete without verification failure.
4. **Edge case tests**: All specific edge case scenarios produce correct hashes.
5. **Golden hash test**: Existing golden traces produce identical `stateHash` values.
6. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.
7. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. When `verifyIncrementalHash` is enabled, any hash drift is caught immediately with a descriptive error.
2. When `verifyIncrementalHash` is disabled (default), zero performance overhead — no `computeFullHash` call.
3. The verification error includes enough diagnostic context to identify which effect/phase caused the drift.
4. All existing `stateHash` values in golden traces remain unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-parity.test.ts` — per-move parity across games and seeds.
2. `packages/engine/test/unit/kernel/zobrist-incremental-edge-cases.test.ts` — edge case coverage.
3. `packages/engine/test/integration/kernel/zobrist-incremental-property.test.ts` — random-play property tests.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

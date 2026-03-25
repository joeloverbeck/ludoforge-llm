# 80INCZOBHAS-006: Switchover — Replace computeFullHash in applyMoveCore with _runningHash

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — apply-move.ts
**Deps**: 80INCZOBHAS-001, 80INCZOBHAS-002, 80INCZOBHAS-003, 80INCZOBHAS-004, 80INCZOBHAS-005

## Problem

After all effect handlers and phase transition code have been instrumented with
incremental hash updates (tickets 001–005), `applyMoveCore` still calls
`computeFullHash` on every move to produce the final `stateHash`. This ticket
replaces that call with a simple assignment from `_runningHash`, which is the
core optimization that eliminates ~95% of per-move hash computation cost.

## Assumption Reassessment (2026-03-24)

1. `applyMoveCore` is in `apply-move.ts` (~line 1229). The final hash computation is at ~line 1342:
   ```typescript
   stateHash: computeFullHash(cachedRuntime?.zobristTable ?? createZobristTable(def), progressedState)
   ```
   Confirmed.
2. After tickets 001–005, `progressedState._runningHash` will contain the incrementally updated hash reflecting all state mutations during effect execution and phase transitions.
3. The `stateHash` field is used externally for determinism checks, trace logging, and transposition detection.
4. `computeFullHash` will still be needed for: initial state (ticket 001), compiled-effect verification (phase-lifecycle.ts), and the new verification mode (ticket 007). It is NOT deleted — just removed from the hot path.

## Architecture Check

1. This is a single-line change in the hot path — minimal blast radius.
2. Correctness depends entirely on tickets 002–005 being complete and correct. If any effect handler misses a hash update, `_runningHash` will drift from the true hash. Ticket 007's verification mode catches this.
3. No backwards-compatibility concerns — `stateHash` remains the same type (`bigint`) and the same contract (Zobrist hash of the state).

## What to Change

### 1. Replace `computeFullHash` in `applyMoveCore`

Change the final state construction from:

```typescript
const stateWithHash = {
  ...progressedState,
  stateHash: computeFullHash(
    cachedRuntime?.zobristTable ?? createZobristTable(def),
    progressedState
  ),
};
```

To:

```typescript
const stateWithHash = {
  ...progressedState,
  stateHash: progressedState._runningHash,
};
```

### 2. Remove the `createZobristTable` Fallback in applyMoveCore

The fallback `cachedRuntime?.zobristTable ?? createZobristTable(def)` was needed because `computeFullHash` required a table. With the switchover, the table is no longer needed at this point. If `cachedRuntime` is undefined (no table available), `_runningHash` will still be `0n` (from initial state without a table) — but this case should not occur in normal operation. Add a debug assertion if `_runningHash === 0n` and `stateHash` was previously non-zero.

### 3. Clean Up Unused Import (if applicable)

If `computeFullHash` is no longer imported in `apply-move.ts` after this change, remove the import. Check if any other code in `apply-move.ts` still uses it (e.g., for debugging or other paths).

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify — replace computeFullHash call with _runningHash assignment)

## Out of Scope

- Modifying any effect handlers (tickets 002–005).
- Adding verification mode (ticket 007).
- Removing `computeFullHash` function itself — it's still used elsewhere.
- Removing `computeFullHash` from `phase-lifecycle.ts` (compiled-effect verification).
- Performance benchmarking (separate follow-up).
- Runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. **All existing determinism tests pass** — `stateHash` values in golden traces are unchanged (proves incremental == full for known game histories).
2. **All existing Texas Hold'em tests pass** — no regression in hash values.
3. **All existing FITL tests pass** — no regression in hash values.
4. Existing suite: `pnpm -F @ludoforge/engine test` — zero failures.
5. Existing suite: `pnpm -F @ludoforge/engine test:e2e` — zero failures.
6. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. `stateHash` produced by `applyMove` is bit-identical to what `computeFullHash` would produce — this is the core correctness invariant.
2. `computeFullHash` is still available and callable (not deleted).
3. The `applyMove` external contract is unchanged: `applyMove(state) → newState` with `newState.stateHash` as a valid Zobrist hash.
4. Performance: `applyMoveCore` no longer calls `computeFullHash` on the hot path.

## Test Plan

### New/Modified Tests

None — this ticket relies entirely on existing tests passing. The switchover is validated by the fact that all existing `stateHash` assertions still hold. If any handler ticket (002–005) missed a hash update, existing tests will fail here.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

**Completion date**: 2026-03-25

### What changed

1. **`zobrist-phase-hash.ts`**: Replaced `patchPhaseTransitionHash` (partial patch covering only phase/player/turn/usage) with `reconcileRunningHash` — a comprehensive function that diffs ALL hashed feature categories (tokens, globalVars, perPlayerVars, zoneVars, activePlayer, currentPhase, turnCount, actionUsage, markers, globalMarkers, reveals, lastingEffects, interruptPhaseStack) between a baseline state and a target state. Returns the correct incremental hash as a `bigint`.

2. **`apply-move.ts`**: Replaced the `computeFullHash` call in `applyMoveCore` with a single `reconcileRunningHash(table, inputState, outputState)` call at the end. Removed all intermediate hash-patching calls (action-usage patch, turn-flow patch). Both `stateHash` and `_runningHash` are set to the reconciled value. Falls back to `computeFullHash` when no `cachedRuntime.zobristTable` is available.

3. **`phase-advance.ts`**: Updated 4 call sites from `patchPhaseTransitionHash` to `reconcileRunningHash` (intermediate patches within `advancePhase` and `advanceToDecisionPoint`).

### Deviations from original plan

The ticket assumed a simple one-line change (`stateHash: progressedState._runningHash`). Implementation revealed two design gaps:

- **Bug in ticket 005**: `patchPhaseTransitionHash` XOR'd out phantom `count=0` features for brand-new `actionUsage` entries that were never part of the hash. Fixed by the new comprehensive function's symmetric XOR-out/XOR-in pattern.

- **Incomplete coverage**: `patchPhaseTransitionHash` only covered 4 of 13 hashed feature categories. State mutations from turn-flow eligibility (globalVars via pass rewards, tokens via card boundary lifecycle) and other immutable code paths went untracked. Resolved by generalizing to `reconcileRunningHash` which covers all categories with reference-identity fast paths.

- **Architecture change**: Instead of incremental hash updates within effect handlers being the sole source of truth, `reconcileRunningHash` serves as the single authoritative hash computation — it diffs the original input state against the final output state, making the result correct by construction regardless of which intermediate code paths modified state.

### Verification results

- `pnpm turbo typecheck`: 3/3 packages pass
- `pnpm -F @ludoforge/engine test`: 4729/4729 pass, 0 failures
- `pnpm -F @ludoforge/engine test:e2e`: 36/36 pass, 0 failures
- `pnpm turbo lint`: 0 warnings, 0 errors
- Manual hash verification: `stateHash === computeFullHash(table, state)` for all 12 moves in a Texas Hold'em simulation with `cachedRuntime`

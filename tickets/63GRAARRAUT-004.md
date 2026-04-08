# 63GRAARRAUT-004: Migrate turn-flow-eligibility.ts to use array-level API and absorb withPendingFreeOperationGrants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/turn-flow-eligibility.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

`turn-flow-eligibility.ts` is the heaviest grants-array writer: it advances sequenceWaiting grants, orchestrates post-move grant state, and owns the `withPendingFreeOperationGrants()` helper. Its direct array manipulation must be delegated to the authority module.

## Assumption Reassessment (2026-04-08)

1. `advanceSequenceReadyPendingFreeOperationGrants()` exists at line 161 — confirmed. Directly manipulates the grants array to advance sequenceWaiting grants.
2. `applyTurnFlowEligibilityAfterMove()` exists at line 926 — confirmed. Orchestrates post-move grant state with direct array writes.
3. `withPendingFreeOperationGrants()` exists at lines 484-496 — confirmed. Internal-only helper (no external importers). Will be moved to grant-lifecycle.ts by ticket 001.
4. `advanceSequenceGrants` will be available from `grant-lifecycle.ts` after ticket 001 — prerequisite.

## Architecture Check

1. Delegating array writes to the authority module removes the largest source of direct manipulation — the module with the most grant-array write sites.
2. Absorbing `withPendingFreeOperationGrants` into grant-lifecycle.ts (done in ticket 001) means this module imports the helper rather than owning it — cleaner separation.
3. No game-specific logic introduced (Foundation 1). No backwards-compatibility shims (Foundation 14).

## What to Change

### 1. Migrate `advanceSequenceReadyPendingFreeOperationGrants()`

Replace the internal loop that calls `advanceToReady()` on individual grants and splices results back into the array with a single call to `advanceSequenceGrants()` from grant-lifecycle.ts. Use the returned `GrantArrayResult.grants` to update runtime state and merge trace entries.

### 2. Migrate grant-array writes in `applyTurnFlowEligibilityAfterMove()`

Identify all sites within this function that directly filter, map, or reconstruct the grants array. Replace each with the appropriate array-level API call (`consumeGrantUse`, `expireGrantsForSeat`, `advanceSequenceGrants`, or `insertGrant` as applicable). Thread trace entries through.

### 3. Replace local `withPendingFreeOperationGrants` usage

Update all call sites within `turn-flow-eligibility.ts` to import `withPendingFreeOperationGrants` from `grant-lifecycle.ts` (where ticket 001 moved it). Delete the local definition.

### 4. Delete dead local array manipulation code

Remove any array spread/filter/map logic that the new API calls replace.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)

## Out of Scope

- Changing grant lifecycle phase transitions
- Changing the eligibility determination logic (which grants are eligible)
- Migrating other caller modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. `turn-flow-eligibility.ts` no longer directly manipulates the grants array
3. `withPendingFreeOperationGrants` is no longer defined in `turn-flow-eligibility.ts`

### Invariants

1. Grant advancement and post-move orchestration produce identical state transitions as before
2. All trace entries from array operations are preserved
3. No direct `pendingFreeOperationGrants` array manipulation remains in `turn-flow-eligibility.ts`

## Test Plan

### New/Modified Tests

None — existing tests cover eligibility and advancement behavior. Correctness is verified by the full suite passing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

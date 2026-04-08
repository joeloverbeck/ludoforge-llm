# 63GRAARRAUT-005: Migrate apply-move.ts to use consumeGrantUse

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/apply-move.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

`apply-move.ts` directly calls `consumeUse()` on individual grants and then splices the result back into the array, handling exhaustion removal inline. This duplicates the consume-and-remove logic that the authority module now provides via `consumeGrantUse`.

## Assumption Reassessment (2026-04-08)

1. `consumeAuthorizedFreeOperationGrant()` exists at `packages/engine/src/kernel/apply-move.ts` line 146 — confirmed.
2. The function imports `consumeUse` from `grant-lifecycle.ts` (line 30) and manually splices the result back — confirmed.
3. `consumeGrantUse` will be available from `grant-lifecycle.ts` after ticket 001 — prerequisite.

## Architecture Check

1. Delegating to `consumeGrantUse` eliminates the manual splice-after-consume pattern — the authority module handles exhaustion removal.
2. The consume operation remains pure and deterministic (Foundation 8, Foundation 11).
3. No backwards-compatibility shims (Foundation 14).

## What to Change

### 1. Replace manual consume-and-splice with `consumeGrantUse`

In `consumeAuthorizedFreeOperationGrant()`, replace the call to `consumeUse()` followed by manual array reconstruction with a single call to `consumeGrantUse(grants, grantId)`. Use the returned `GrantArrayConsumeResult` to get the updated grants array, the consumed grant, and the `wasExhausted` flag.

### 2. Thread trace entries

Merge `GrantArrayConsumeResult.trace` into the function's trace output.

### 3. Remove direct `consumeUse` import if no longer needed

If `consumeUse` is no longer called directly in `apply-move.ts`, remove the import.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)

## Out of Scope

- Changing move authorization logic
- Changing how consumed grants affect subsequent game state
- Modifying other caller modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. `apply-move.ts` no longer directly splices grants from the array

### Invariants

1. Grant consumption produces identical state transitions (same `remainingUses` decrement, same exhaustion behavior)
2. All trace entries from array operations are preserved
3. No direct `pendingFreeOperationGrants` array splice/filter remains in `apply-move.ts`

## Test Plan

### New/Modified Tests

None — existing tests cover grant consumption behavior. Correctness is verified by the full suite passing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

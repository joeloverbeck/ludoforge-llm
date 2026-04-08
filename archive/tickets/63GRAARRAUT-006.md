# 63GRAARRAUT-006: Migrate phase-advance.ts to use expireGrantsForSeat

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/phase-advance.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

`phase-advance.ts` directly calls `expireGrant()` on individual grants and then filters the array to remove expired grants. This duplicates the expire-and-remove logic that the authority module now provides via `expireGrantsForSeat`.

## Assumption Reassessment (2026-04-08)

1. `expireBlockingPendingFreeOperationGrants()` exists at `packages/engine/src/kernel/phase-advance.ts` line 99 — confirmed.
2. The function imports `expireGrant` from `grant-lifecycle.ts` (line 4) and manually filters the result — confirmed.
3. `expireGrantsForSeat` will be available from `grant-lifecycle.ts` after ticket 001 — prerequisite.

## Architecture Check

1. Delegating to `expireGrantsForSeat` eliminates the manual expire-then-filter pattern — the authority module handles removal after expiry.
2. The expiry operation remains pure and deterministic (Foundation 8, Foundation 11).
3. No backwards-compatibility shims (Foundation 14).

## What to Change

### 1. Replace manual expire-and-filter with `expireGrantsForSeat`

In `expireBlockingPendingFreeOperationGrants()`, replace the loop that calls `expireGrant()` on each eligible grant followed by array filter/rebuild with a single call to `expireGrantsForSeat(grants, seat)`. Use the returned `GrantArrayResult` to get the updated grants array.

### 2. Thread trace entries

Merge `GrantArrayResult.trace` into the function's trace output.

### 3. Remove direct `expireGrant` import if no longer needed

If `expireGrant` is no longer called directly in `phase-advance.ts`, remove the import.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)

## Out of Scope

- Changing phase advancement logic
- Changing which grants are eligible for expiry
- Modifying other caller modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. `phase-advance.ts` no longer directly filters/rebuilds the grants array

### Invariants

1. Grant expiry produces identical state transitions (same grants expired, same trace entries)
2. All trace entries from array operations are preserved
3. No direct `pendingFreeOperationGrants` array filter/rebuild remains in `phase-advance.ts`

## Test Plan

### New/Modified Tests

None — existing tests cover phase-advance expiry behavior. Correctness is verified by the full suite passing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

Implemented with a narrow authority-level helper instead of the ticket's literal `expireGrantsForSeat` swap.

- Added `expireReadyBlockingGrantsForSeat()` in `packages/engine/src/kernel/grant-lifecycle.ts` so `phase-advance.ts` can delegate the write while preserving the live contract: only `ready` grants for the active seat with blocking completion policies expire at this boundary.
- Updated `packages/engine/src/kernel/phase-advance.ts` to use that helper and merge its lifecycle trace entries, removing the local expire-and-filter rebuild logic.
- Added a focused proof test in `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` covering the corrected boundary: `offered` grants and non-blocking `ready` grants are preserved.

This intentionally deviated from the ticket's original mechanism because `expireGrantsForSeat()` also expires `offered` grants, which would have changed behavior and conflicted with the live contract and `docs/FOUNDATIONS.md`.

Verification run:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

Result: passed (`474` tests passed).

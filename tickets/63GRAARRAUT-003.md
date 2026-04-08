# 63GRAARRAUT-003: Migrate effects-turn-flow.ts to use insertGrant/insertGrantBatch

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effects-turn-flow.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

`effects-turn-flow.ts` directly constructs grant objects and appends them to the `pendingFreeOperationGrants` array via `applyGrantFreeOperation()`. This bypasses the array-level authority module, meaning uniqueness and ordering invariants are not enforced at the point of insertion.

## Assumption Reassessment (2026-04-08)

1. `applyGrantFreeOperation()` exists at `packages/engine/src/kernel/effects-turn-flow.ts` line 118 — confirmed.
2. The function constructs `TurnFlowPendingFreeOperationGrant` objects and appends them to the runtime's grants array — confirmed.
3. `insertGrant` and `insertGrantBatch` will be available from `grant-lifecycle.ts` after ticket 001 — prerequisite.

## Architecture Check

1. Delegation to `insertGrant`/`insertGrantBatch` centralizes uniqueness enforcement at creation time — the earliest possible point.
2. No game-specific logic introduced; grant creation remains driven by effect declarations (Foundation 1).
3. No backwards-compatibility shims — direct array manipulation code is deleted and replaced (Foundation 14).

## What to Change

### 1. Replace direct array append with `insertGrant`/`insertGrantBatch`

In `applyGrantFreeOperation()`, replace the code that constructs a new grants array by spreading/appending with calls to `insertGrant` (single grant) or `insertGrantBatch` (sequence grants). Import the new functions from `grant-lifecycle.ts`.

### 2. Thread trace entries

Merge `GrantArrayResult.trace` entries into the function's trace output alongside any existing trace entries.

### 3. Delete local array manipulation code

Remove any local array spread/concat logic that the new API calls replace.

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)

## Out of Scope

- Changing how grant objects are constructed (field values, policies)
- Changing the `TurnFlowPendingFreeOperationGrant` type shape
- Modifying other caller modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. `effects-turn-flow.ts` no longer directly appends to the grants array (manual or grep verification)

### Invariants

1. Grant creation still produces identical grant objects (same fields, same values)
2. All trace entries from array operations are preserved in output
3. No direct `pendingFreeOperationGrants` array manipulation remains in `effects-turn-flow.ts`

## Test Plan

### New/Modified Tests

None — existing tests cover grant creation behavior. Correctness is verified by the full suite passing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

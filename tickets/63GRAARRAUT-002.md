# 63GRAARRAUT-002: Unit tests for array-level grant API

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — test/unit/kernel/grant-lifecycle.test.ts
**Deps**: `archive/tickets/63GRAARRAUT-001.md`

## Problem

The new array-level grant API from ticket 001 needs comprehensive unit tests proving that invariants (uniqueness, ordering, probe isolation, immutability) are enforced. Without tests, the subsequent migration tickets cannot verify correctness.

## Assumption Reassessment (2026-04-08)

1. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` exists — confirmed.
2. The test file uses Node.js built-in test runner (`node --test`) — confirmed per project conventions.
3. Array-level functions from ticket 001 will be exported from `grant-lifecycle.ts` — prerequisite.

## Architecture Check

1. Tests validate pure functions — no side effects, no external dependencies.
2. Tests prove Foundation 11 (immutability) by asserting input arrays are not modified.
3. Tests prove invariants (uniqueness, ordering) that protect determinism (Foundation 8).

## What to Change

### 1. `insertGrant` tests

- Returns updated array with new grant appended
- Rejects duplicate `grantId` with error
- Does not mutate input array

### 2. `insertGrantBatch` tests

- Preserves `sequenceIndex` ordering within batch
- Rejects duplicates across batch and existing grants
- Handles empty batch (returns original array)
- Does not mutate input array

### 3. `consumeGrantUse` tests

- Decrements `remainingUses` on the consumed grant
- Removes grant from array when exhausted (`remainingUses === 0`)
- Returns `wasExhausted: true` when grant is removed
- Returns `wasExhausted: false` when grant has remaining uses
- Rejects unknown `grantId` with error
- Produces correct trace entry
- Does not mutate input array

### 4. `expireGrantsForSeat` tests

- Expires only grants for the specified seat with `phase` of `ready` or `offered`
- Leaves grants for other seats untouched
- Leaves grants with `phase` of `sequenceWaiting` untouched
- Collects one trace entry per expired grant
- Does not mutate input array

### 5. `advanceSequenceGrants` tests

- Transitions only grants whose `sequenceBatchId` is in the ready set
- Leaves grants without matching `sequenceBatchId` untouched
- Leaves grants already in `ready` phase untouched
- Collects one trace entry per advanced grant
- Does not mutate input array

### 6. `createProbeOverlay` tests

- Returns combined array of existing grants plus probe grants
- Does not modify original grants array
- Does not modify probe grants array

## Files to Touch

- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` (modify)

## Out of Scope

- Integration tests (ticket 008)
- Regression tests for FREOPSKIP-001 (ticket 008)
- Testing caller migration (tickets 003-007)

## Acceptance Criteria

### Tests That Must Pass

1. All new unit tests pass: `pnpm -F @ludoforge/engine test`
2. Each array-level function has at least one test for its happy path, one for its error/edge case, and one proving immutability

### Invariants

1. Input arrays are never mutated by any array-level function
2. `grantId` uniqueness is enforced by `insertGrant` and `insertGrantBatch`
3. `sequenceIndex` ordering is preserved by `insertGrantBatch`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — add test suite for array-level operations

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine build`

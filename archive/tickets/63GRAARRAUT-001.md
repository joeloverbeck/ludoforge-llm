# 63GRAARRAUT-001: Add array-level grant API to grant-lifecycle.ts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/grant-lifecycle.ts
**Deps**: `specs/63-grant-array-authority.md`

## Problem

The `pendingFreeOperationGrants` array is written by 6 independent modules, each responsible for splicing transitioned grant objects back into the array and maintaining array-level invariants (uniqueness, ordering, probe isolation). This split authority caused the FREOPSKIP-001 determinism regression (commit `8669140e`). This ticket adds array-level operations to `grant-lifecycle.ts` so that invariants are enforced in one place — callers will be migrated in subsequent tickets.

## Assumption Reassessment (2026-04-08)

1. `grant-lifecycle.ts` exists at `packages/engine/src/kernel/grant-lifecycle.ts` (161 lines) and exports 6 individual transition functions (`advanceToReady`, `markOffered`, `consumeUse`, `skipGrant`, `expireGrant`, `transitionReadyGrantForCandidateMove`) — confirmed.
2. `GrantLifecycleTransitionResult` is defined at lines 19-22 with shape `{ grant, traceEntry }` — confirmed.
3. `TurnFlowPendingFreeOperationGrant` is defined in `types-turn-flow.ts` lines 186-207 — confirmed.
4. `TurnFlowGrantLifecycleTraceEntry` is the trace type used by grant lifecycle operations, defined in `grant-lifecycle-trace.ts` — confirmed.
5. No array-level grant functions exist yet (`insertGrant`, `consumeGrantUse`, etc. return zero matches) — confirmed.

## Architecture Check

1. Array-level operations compose the existing individual transition functions (`consumeUse`, `expireGrant`, `advanceToReady`) — no duplication of state machine logic.
2. All operations are pure functions taking a grants array and returning a new grants array plus trace entries — preserves kernel immutability (Foundation 11).
3. Grant mechanism is game-agnostic; no game-specific logic introduced (Foundation 1).
4. No backwards-compatibility shims — callers will be migrated to the new API in subsequent tickets (Foundation 14).

## What to Change

### 1. Add result types

Add to `grant-lifecycle.ts`:

```typescript
interface GrantArrayResult {
  readonly grants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly trace: readonly TurnFlowGrantLifecycleTraceEntry[];
}

interface GrantArrayConsumeResult extends GrantArrayResult {
  readonly consumed: TurnFlowPendingFreeOperationGrant;
  readonly wasExhausted: boolean;
}
```

Export both types.

### 2. Implement `insertGrant`

Takes the current grants array and a single grant. Asserts `grantId` uniqueness — throws if duplicate. Returns new array with the grant appended, empty trace.

### 3. Implement `insertGrantBatch`

Takes the current grants array and a batch of grants. Asserts `grantId` uniqueness across both existing and batch grants. Preserves `sequenceIndex` ordering within the batch. Returns new array with batch appended, empty trace.

### 4. Implement `consumeGrantUse`

Takes the current grants array and a `grantId`. Finds the grant, calls existing `consumeUse()` on it. If exhausted (`remainingUses === 0`), removes from array. Returns the updated array, the consumed grant, `wasExhausted` flag, and the trace entry from `consumeUse`.

### 5. Implement `expireGrantsForSeat`

Takes the current grants array and a `seat` string. Iterates grants, calls existing `expireGrant()` on each eligible grant for the seat (those with `phase` of `ready` or `offered`). Returns new array with expired grants removed, collects all trace entries.

### 6. Implement `advanceSequenceGrants`

Takes the current grants array and a `ReadonlySet<string>` of ready sequence batch IDs. For each grant with `phase === 'sequenceWaiting'` whose `sequenceBatchId` is in the ready set, calls existing `advanceToReady()`. Returns new array with transitioned grants replacing originals, collects trace entries.

### 7. Implement `createProbeOverlay`

Takes the current grants array and an array of probe grants. Returns a new array that is the concatenation of both — no trace entries (probes are transient). Does not mutate either input.

### 8. Move `withPendingFreeOperationGrants` into grant-lifecycle.ts

Move the helper from `turn-flow-eligibility.ts` (lines 484-496) into `grant-lifecycle.ts` as an exported convenience function. It takes a `TurnFlowRuntimeState` and a grants array, returns an updated runtime. This centralizes the runtime-update pattern alongside the array operations.

## Files to Touch

- `packages/engine/src/kernel/grant-lifecycle.ts` (modify)

## Out of Scope

- Migrating any caller module to use the new API (tickets 003-007)
- Changing the `TurnFlowPendingFreeOperationGrant` interface shape
- Changing the individual grant lifecycle transition functions
- Writing tests (ticket 002)

## Acceptance Criteria

### Tests That Must Pass

1. Existing suite: `pnpm -F @ludoforge/engine test`
2. TypeScript compiles cleanly: `pnpm -F @ludoforge/engine build`

### Invariants

1. All existing individual transition functions remain unchanged in signature and behavior
2. Array-level functions are pure — input arrays never mutated (Foundation 11)
3. `insertGrant` / `insertGrantBatch` throw on duplicate `grantId`
4. `insertGrantBatch` preserves `sequenceIndex` ordering

## Test Plan

### New/Modified Tests

None in this ticket — unit tests are ticket 002.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

**Completed**: 2026-04-08

Implemented the array-level grant API in `packages/engine/src/kernel/grant-lifecycle.ts`, including `GrantArrayResult`, `GrantArrayConsumeResult`, `insertGrant`, `insertGrantBatch`, `consumeGrantUse`, `expireGrantsForSeat`, `advanceSequenceGrants`, `createProbeOverlay`, and the moved `withPendingFreeOperationGrants` helper.

Updated adjacent import fallout required by the helper move in `packages/engine/src/kernel/turn-flow-eligibility.ts` and `packages/engine/src/kernel/apply-move.ts`. Broader caller migration remained deferred to tickets `63GRAARRAUT-003` through `63GRAARRAUT-007`, consistent with the original boundary.

**Deviations from original plan**

- The ticket's `Files to Touch` list named only `grant-lifecycle.ts`, but completing the helper move required minimal import and deletion updates in `turn-flow-eligibility.ts` and `apply-move.ts` to keep the repository compiling.

**Verification**

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test`

# FREEOPEORDPROCON-004: Sequence Readiness Engine — Consult skippedStepIndices

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel readiness logic
**Deps**: archive/tickets/FREEOPEORDPROCON-002-batch-context-runtime-state.md

## Problem

`isPendingFreeOperationGrantSequenceReady` (`free-operation-grant-authorization.ts:61-76`) currently blocks a grant if any earlier-indexed grant exists in `pendingFreeOperationGrants` for the same batch. Under `implementWhatCanInOrder`, earlier steps may have been skipped (recorded in `skippedStepIndices`), and those skipped steps must not block later steps.

This is the spec's "single most important runtime change."

## Assumption Reassessment (2026-03-12)

1. `isPendingFreeOperationGrantSequenceReady` at lines 61-76 checks `pending.some(candidate => candidate.sequenceBatchId === batchId && candidate.sequenceIndex < sequenceIndex)` — returns false if any earlier-index grant is pending.
2. The function receives only `pending` (array of grants) and `grant` (target grant). It has no access to batch context or `freeOperationSequenceContexts`.
3. `free-operation-discovery-analysis.ts:71` calls this function: `sequenceReadyGrants = activeGrants.filter((grant) => isPendingFreeOperationGrantSequenceReady(pending, grant))`.
4. `free-operation-grant-authorization.ts` also exports `authorizeFreeOperationGrant` which calls `isPendingFreeOperationGrantSequenceReady` — this must also be updated.

## Architecture Check

1. The function signature must be extended to accept batch contexts (the `freeOperationSequenceContexts` record) so it can look up `skippedStepIndices`.
2. For `strictInOrder` batches (or batches with no context), behavior is unchanged — only pending grants block.
3. For `implementWhatCanInOrder`, a step is ready if all earlier steps are either consumed (not in pending) or skipped (in `skippedStepIndices`).
4. This preserves determinism: the skip decision was made at emission time (ticket 005), and readiness simply reads it.

## What to Change

### 1. Extend function signature (`free-operation-grant-authorization.ts:61`)

Add a parameter for batch contexts:

```ts
export const isPendingFreeOperationGrantSequenceReady = (
  pending: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant,
  batchContexts?: Readonly<Record<string, TurnFlowFreeOperationSequenceBatchContext>>,
): boolean => {
```

### 2. Updated logic

For `implementWhatCanInOrder` batches:
- Look up `batchContexts[batchId]`.
- If the context has `progressionPolicy === 'implementWhatCanInOrder'` and `skippedStepIndices`:
  - A grant is ready if no earlier-indexed grant exists in `pending` that is NOT in `skippedStepIndices`.
  - In other words: for each candidate with lower `sequenceIndex`, it must either be absent from `pending` (consumed) or its `sequenceIndex` must be in `skippedStepIndices`.

For `strictInOrder` or undefined policy: preserve current logic unchanged.

### 3. Update all call sites

- `free-operation-discovery-analysis.ts:71` — pass `runtime.freeOperationSequenceContexts` through.
- `authorizeFreeOperationGrant` in `free-operation-grant-authorization.ts` — pass batch contexts through.
- Any other caller (grep for `isPendingFreeOperationGrantSequenceReady`).

## Files to Touch

- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify) — extend `isPendingFreeOperationGrantSequenceReady` signature and logic
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify) — pass batch contexts to readiness check
- Any other file that calls `isPendingFreeOperationGrantSequenceReady` (modify) — pass batch contexts

## Out of Scope

- Populating `skippedStepIndices` at emission time — that is FREEOPEORDPROCON-005.
- Validation rules — those are in tickets 001 and 003.
- Batch context type changes — that is FREEOPEORDPROCON-002.
- MACV data changes — that is FREEOPEORDPROCON-006.
- Discovery/apply parity verification — that is FREEOPEORDPROCON-007.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `strictInOrder` batch — earlier pending grant blocks later grant (existing behavior preserved).
2. Unit test: `implementWhatCanInOrder` batch — earlier pending grant (NOT skipped) blocks later grant.
3. Unit test: `implementWhatCanInOrder` batch — earlier step in `skippedStepIndices` does NOT block later grant.
4. Unit test: `implementWhatCanInOrder` batch — step 0 skipped, step 1 pending, step 2 blocked by step 1 (not by step 0).
5. Unit test: no `batchContexts` parameter (undefined) — falls back to current behavior.
6. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. `strictInOrder` behavior is identical to pre-change behavior.
2. A grant without a sequence is always ready (unchanged).
3. Readiness is a pure function of `pending`, `grant`, and `batchContexts` — no side effects.
4. Discovery and apply-time use the same readiness function (same result for same inputs).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-grant-authorization.test.ts` (or similar) — new unit tests for the extended readiness logic with `skippedStepIndices`
2. Existing `free-operation-grant-authorization` tests — verify they pass without `batchContexts` param (backward compat)

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`

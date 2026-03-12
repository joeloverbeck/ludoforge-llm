# FREEOPEORDPROCON-005: Emission-Time Skip Evaluation (populate skippedStepIndices)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel grant emission logic, batch context population
**Deps**: FREEOPEORDPROCON-001 (contract surface), FREEOPEORDPROCON-002 (batch context type)

## Problem

When an `implementWhatCanInOrder` batch emits grants, the system must probe each step's viability in order and record unimplementable steps in `skippedStepIndices`. Currently, `applyGrantFreeOperation` (`effects-turn-flow.ts:221-294`) processes grants individually — it does not evaluate batch-level ordering or populate batch progression state. This ticket adds the batch-level emission logic.

## Assumption Reassessment (2026-03-12)

1. `applyGrantFreeOperation` at `effects-turn-flow.ts:221-294` processes one grant at a time. It computes `sequenceBatchId` from the grant's `sequence.batch` field, probes viability if `requireUsableAtIssue`, and either emits or silently drops the grant.
2. For `strictInOrder`, the silent drop is correct — if step 0 is unusable, it's not emitted, and step 1 never becomes ready (because `isPendingFreeOperationGrantSequenceReady` blocks it).
3. For `implementWhatCanInOrder`, the silent drop is insufficient — step 0's non-emission must be explicitly recorded as `skippedStepIndices: [0]` so step 1 can proceed.
4. Batch context (`freeOperationSequenceContexts`) is currently populated only for `capturedMoveZonesByKey` during move execution, not at emission time.
5. Both event-issued (`freeOperationGrants` in event cards) and effect-issued (`grantFreeOperation` effects) must share the same behavior.

## Architecture Check

1. The skip evaluation must happen at emission time (one-time evaluation), not at legal-move enumeration time. This is critical for determinism: game state can change between emission and enumeration.
2. The batch context is the right place to store `progressionPolicy` and `skippedStepIndices` — it already exists per-batch.
3. Both event-issued and effect-issued paths call `applyGrantFreeOperation`, so the change is naturally shared.
4. For event-issued grants: all grants in a batch are emitted in a single event resolution pass. The emission loop must be batch-aware.
5. For effect-issued grants: grants may be emitted across separate effect executions. The batch context must be consulted/updated incrementally.

## What to Change

### 1. Batch context initialization at emission time (`effects-turn-flow.ts`)

When the first grant in an `implementWhatCanInOrder` batch is about to be emitted:
- Create/update the batch context with `progressionPolicy: 'implementWhatCanInOrder'`.

When a grant in such a batch fails the viability probe:
- Instead of silently returning (current behavior at line 269-272), record the step index in `skippedStepIndices` on the batch context.
- Still do not emit the grant.

### 2. Event-issued emission path

Event cards emit all `freeOperationGrants` in sequence. The emission loop (which calls `applyGrantFreeOperation` per grant) must:
- After processing all grants in a batch, ensure the batch context has the correct `skippedStepIndices`.
- The existing per-grant processing in `applyGrantFreeOperation` can be updated to handle this, or a batch-aware wrapper can orchestrate it.

### 3. Effect-issued emission path

Effect-issued `grantFreeOperation` emits grants one at a time. When a grant belongs to a batch with `implementWhatCanInOrder`:
- Look up the existing batch context (may already have `skippedStepIndices` from earlier effect-issued grants in the same batch).
- If the grant is unimplementable, append its step index to `skippedStepIndices`.
- If the grant is implementable, emit it normally.

### 4. Batch context persistence

Ensure the updated `freeOperationSequenceContexts` (with `progressionPolicy` and `skippedStepIndices`) is persisted in the returned state from `applyGrantFreeOperation`.

## Files to Touch

- `packages/engine/src/kernel/effects-turn-flow.ts` (modify) — batch-aware emission logic, batch context population with `progressionPolicy` and `skippedStepIndices`
- `packages/engine/src/kernel/free-operation-viability.ts` (possibly modify) — if viability probe needs to be callable from the emission context in a new way

## Out of Scope

- Readiness engine changes — that is FREEOPEORDPROCON-004.
- Contract/schema surface — those are tickets 001 and 002.
- Validation rules — that is FREEOPEORDPROCON-003.
- Discovery/apply parity verification — that is FREEOPEORDPROCON-007.
- MACV data changes — that is FREEOPEORDPROCON-006.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `implementWhatCanInOrder` batch — step 0 usable → emitted, `skippedStepIndices` is empty or absent.
2. Unit test: `implementWhatCanInOrder` batch — step 0 unusable → NOT emitted, `skippedStepIndices: [0]` recorded in batch context.
3. Unit test: `implementWhatCanInOrder` batch — step 0 unusable, step 1 usable → step 0 skipped, step 1 emitted, batch context has `skippedStepIndices: [0]`.
4. Unit test: `strictInOrder` batch — step 0 unusable → NOT emitted, no `skippedStepIndices` recorded (existing silent-drop behavior preserved).
5. Unit test: effect-issued grants — two `grantFreeOperation` effects in sequence for the same `implementWhatCanInOrder` batch. First grant unusable → skipped. Second grant usable → emitted. Batch context accumulated correctly.
6. Unit test: event-issued and effect-issued paths produce identical batch context state for the same scenario.
7. Unit test: batch context `progressionPolicy` field is populated at emission time.
8. Existing suite: `pnpm turbo test` — no regressions.

### Invariants

1. Skip evaluation happens at emission time only — it is a one-time evaluation, not re-probed later.
2. `strictInOrder` batches have no `skippedStepIndices` (behavior unchanged).
3. `skippedStepIndices` is always sorted in ascending order.
4. A grant that is implementable is always emitted, even if earlier grants in the same batch were skipped.
5. Batch contexts are immutable — new contexts replace old ones via spread.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effects-turn-flow-progression.test.ts` (new) — unit tests for emission-time skip evaluation
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — integration test confirming event-issued batch emission with skip evaluation

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`

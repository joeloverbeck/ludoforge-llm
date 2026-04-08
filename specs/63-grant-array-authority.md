# Spec 63: Grant Array Authority Consolidation

**Status**: Draft
**Priority**: P1
**Complexity**: L
**Dependencies**: None
**Estimated effort**: 3-5 days

## Overview

The `pendingFreeOperationGrants` array within `TurnFlowRuntimeState` is the kernel's most mutation-heavy shared data structure. Five modules currently write it independently, each responsible for splicing transitioned grant objects back into the array and maintaining array-level invariants (uniqueness, ordering, probe isolation). `grant-lifecycle.ts` owns the individual object state machine transitions but does NOT own array management — callers handle that themselves.

This split authority is **actively harmful**: commit `8669140e` ("Fix FREOPSKIP-001 determinism regression") required coordinated changes across `apply-move.ts`, `phase-advance.ts`, and `turn-flow-eligibility.ts` to fix a grant-handling bug. The current architecture makes such bugs likely and their fixes fragile.

This spec consolidates all array-level grant operations into a single authority module so that the grant array's invariants are enforced in one place.

## Scope

### In Scope

- Expand `grant-lifecycle.ts` (or create `grant-array.ts`) to own array-level operations: insert, consume-and-remove, expire-and-remove, advance-batch, probe-overlay
- Delegate all `pendingFreeOperationGrants` array writes from the 4 caller modules to the authority module
- Formalize the grant state machine and array-level invariants
- Absorb the `withPendingFreeOperationGrants()` helper from `turn-flow-eligibility.ts`

### Out of Scope

- Changing the `TurnFlowPendingFreeOperationGrant` interface shape
- Changing the grant lifecycle phase transitions (those already work correctly in `grant-lifecycle.ts`)
- Refactoring the free-operation module decomposition (confirmed acceptable architecture)
- Changing how grants are declared in GameSpecDoc YAML

## Current State

### Writers

| Module | Operation | Mechanism |
|--------|-----------|-----------|
| `effects-turn-flow.ts` | **Create** grants from effect declarations | `applyGrantFreeOperation()` constructs grant objects, appends to array, updates runtime |
| `turn-flow-eligibility.ts` | **Extract** grants from event card effects; **advance** sequenceWaiting grants to ready; **orchestrate** post-move grant state | `extractPendingFreeOperationGrants()`, `advanceSequenceReadyPendingFreeOperationGrants()`, `applyTurnFlowEligibilityAfterMove()` |
| `apply-move.ts` | **Consume** grants (ready/offered to exhausted) and remove from array | `consumeFreeOperationGrant()` calls `consumeUse()` then splices |
| `phase-advance.ts` | **Expire** grants at phase boundaries | `expireRequiredPendingFreeOperationGrants()` calls `expireGrant()` then filters |
| `legal-moves.ts` | **Probe** grants during enumeration (temporary overlays) | `pendingFreeOperationGrants:` in probe state overlays |

### The Authority Module Today

`grant-lifecycle.ts` exports pure functions for individual grant transitions:
- `advanceToReady(grant)` — sequenceWaiting to ready
- `markOffered(grant)` — ready to offered
- `consumeUse(grant)` — decrements remainingUses; exhausted when 0
- `skipGrant(grant)` — ready/offered to skipped
- `expireGrant(grant)` — ready/offered to expired
- `transitionReadyGrantForCandidateMove(grant)` — conditional skip or offer

All return `GrantLifecycleTransitionResult` (the transitioned grant + trace entries). But callers must splice the result back into the array themselves.

### Helper

`withPendingFreeOperationGrants(runtime, grants)` in `turn-flow-eligibility.ts:492-504` is the only centralized setter — but not all writers use it.

## Proposed Design

### Authority Module

Expand `grant-lifecycle.ts` to export array-level operations alongside the existing individual transitions. Each array-level function takes the current grants array (and any required context) and returns a new grants array plus trace entries.

### Array-Level API

```typescript
// --- Array-level operations (NEW) ---

/** Insert a newly created grant. Enforces grantId uniqueness. */
insertGrant(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  grant: TurnFlowPendingFreeOperationGrant
): GrantArrayResult;

/** Insert multiple grants from a batch (e.g., sequence). Enforces ordering. */
insertGrantBatch(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  batch: readonly TurnFlowPendingFreeOperationGrant[]
): GrantArrayResult;

/** Consume one use of a grant by grantId. Removes if exhausted. */
consumeGrantUse(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  grantId: string
): GrantArrayConsumeResult;

/** Expire all eligible grants for a seat at phase boundary. */
expireGrantsForSeat(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  seat: string
): GrantArrayResult;

/** Advance all sequenceWaiting grants whose sequence is now ready. */
advanceSequenceGrants(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  readySequenceBatchIds: ReadonlySet<string>
): GrantArrayResult;

/** Create a probe overlay for legal-move enumeration. Caller must NOT persist. */
createProbeOverlay(
  grants: readonly TurnFlowPendingFreeOperationGrant[],
  probeGrants: readonly TurnFlowPendingFreeOperationGrant[]
): readonly TurnFlowPendingFreeOperationGrant[];
```

### Result Types

```typescript
interface GrantArrayResult {
  readonly grants: readonly TurnFlowPendingFreeOperationGrant[];
  readonly trace: readonly TraceEntry[];
}

interface GrantArrayConsumeResult extends GrantArrayResult {
  readonly consumed: TurnFlowPendingFreeOperationGrant;  // the grant after transition
  readonly wasExhausted: boolean;
}
```

### Invariants

1. **Uniqueness**: No two grants in the array may share a `grantId`. Enforced by `insertGrant` / `insertGrantBatch`.
2. **Sequence ordering**: Grants within a sequence batch maintain their `sequenceIndex` order. Enforced by `insertGrantBatch`.
3. **Phase legality**: Only the state machine transitions in `grant-lifecycle.ts` may change a grant's `phase`. The array-level API calls the existing transition functions internally.
4. **Probe isolation**: `createProbeOverlay` returns a transient array; callers must not persist it into committed state. This is enforced by code review and test assertions (probe grants carry a marker or the probe caller discards the overlay after enumeration).
5. **Immutability**: All operations return new arrays; the input array is never mutated (FOUNDATIONS 11).

### Migration Pattern

For each caller module:
1. Replace direct array manipulation with an array-level API call
2. Use the returned `GrantArrayResult.grants` to update runtime state
3. Merge `GrantArrayResult.trace` into the caller's trace output
4. Delete the local array manipulation code

The `withPendingFreeOperationGrants()` helper moves into `grant-lifecycle.ts` as an internal convenience or is replaced by callers using the returned array directly.

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 Engine Agnosticism | Neutral — grants are a generic kernel mechanism, not game-specific |
| 5 One Rules Protocol | Aligned — single authority reduces risk of sim/agent seeing different grant state |
| 8 Determinism | Aligned — centralizing writes reduces surface for non-deterministic divergence |
| 11 Immutability | Aligned — array-level API returns new arrays, same contract as today |
| 14 No Backwards Compat | Aligned — callers migrate; no shims or alias paths |
| 15 Arch Completeness | Aligned — addresses root cause (split authority) not symptoms |
| 16 Testing as Proof | Aligned — invariants proven by new array-level tests |

## Files to Create/Modify

```
packages/engine/src/kernel/
  grant-lifecycle.ts              # MODIFY — add array-level API
  turn-flow-eligibility.ts        # MODIFY — delegate array writes
  apply-move.ts                   # MODIFY — delegate grant consumption
  phase-advance.ts                # MODIFY — delegate grant expiry
  effects-turn-flow.ts            # MODIFY — delegate grant creation

packages/engine/test/kernel/
  grant-lifecycle.test.ts         # MODIFY — add array-level operation tests
```

## Required Tests

### Unit Tests

1. **insertGrant**: rejects duplicate grantId, returns updated array with new grant appended
2. **insertGrantBatch**: preserves sequenceIndex ordering, rejects duplicates across batch
3. **consumeGrantUse**: decrements remainingUses, removes when exhausted, rejects unknown grantId
4. **expireGrantsForSeat**: expires only eligible grants for the specified seat, leaves others untouched
5. **advanceSequenceGrants**: transitions only grants whose sequenceBatchId is in the ready set
6. **createProbeOverlay**: returns combined array without modifying original

### Integration Tests

7. **Full lifecycle round-trip**: insert grant, advance to ready, consume uses, verify removal on exhaustion
8. **Phase-advance expiry**: insert grants, trigger phase advance, verify expired grants removed
9. **Probe isolation**: create probe overlay, verify original array unchanged

### Regression Tests

10. **FREOPSKIP-001 scenario**: reproduce the determinism regression from commit `8669140e` — verify that the consolidated authority handles the skipIfNoLegalCompletion case correctly

### Existing Suite

11. All existing tests must pass: `pnpm -F @ludoforge/engine test`
12. Determinism canary: `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts`

## Acceptance Criteria

- [ ] `grant-lifecycle.ts` exports array-level API functions
- [ ] `turn-flow-eligibility.ts` no longer directly manipulates the grants array
- [ ] `apply-move.ts` no longer directly splices grants from the array
- [ ] `phase-advance.ts` no longer directly filters/rebuilds the grants array
- [ ] `effects-turn-flow.ts` no longer directly appends to the grants array
- [ ] `withPendingFreeOperationGrants()` helper absorbed into or replaced by the authority module
- [ ] Array-level invariants (uniqueness, ordering) enforced with assertions in the authority module
- [ ] All grant mutations produce trace entries through the authority module
- [ ] Existing test suite passes with zero regressions
- [ ] Determinism canary passes on seeds 1001-1004

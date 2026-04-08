# Spec 63: Grant Array Authority Consolidation

**Status**: COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: None
**Estimated effort**: 3-5 days

## Overview

The `pendingFreeOperationGrants` array within `TurnFlowRuntimeState` is the kernel's most mutation-heavy shared data structure. Six modules currently write it independently, each responsible for splicing transitioned grant objects back into the array and maintaining array-level invariants (uniqueness, ordering, probe isolation). `grant-lifecycle.ts` owns the individual object state machine transitions but does NOT own array management — callers handle that themselves.

This split authority is **actively harmful**: commit `8669140e` ("Fix FREOPSKIP-001 determinism regression") required coordinated changes across `apply-move.ts`, `phase-advance.ts`, and `turn-flow-eligibility.ts` to fix a grant-handling bug. The current architecture makes such bugs likely and their fixes fragile.

> **Note on test blast radius**: 47 test files reference `pendingFreeOperationGrants`, but the vast majority are fixture setup (constructing initial state). Since this spec does not change the `TurnFlowPendingFreeOperationGrant` type shape, only test files that directly call the array-manipulation functions being migrated need updates — not every file that constructs grant fixtures.

This spec consolidates all array-level grant operations into a single authority module so that the grant array's invariants are enforced in one place.

## Scope

### In Scope

- Expand `grant-lifecycle.ts` (or create `grant-array.ts`) to own array-level operations: insert, consume-and-remove, expire-and-remove, advance-batch, probe-overlay
- Delegate all `pendingFreeOperationGrants` array writes from the 6 caller modules to the authority module
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
| `turn-flow-eligibility.ts` | **Advance** sequenceWaiting grants to ready; **orchestrate** post-move grant state; **helper** for runtime update | `advanceSequenceReadyPendingFreeOperationGrants()`, `applyTurnFlowEligibilityAfterMove()`, `withPendingFreeOperationGrants()` |
| `apply-move.ts` | **Consume** grants (ready/offered to exhausted) and remove from array | `consumeAuthorizedFreeOperationGrant()` calls `consumeUse()` then splices |
| `phase-advance.ts` | **Expire** grants at phase boundaries | `expireBlockingPendingFreeOperationGrants()` calls `expireGrant()` then filters |
| `legal-moves.ts` | **Probe** grants during enumeration (temporary overlays) | `pendingFreeOperationGrants:` in probe state overlays (lines 653, 1058) |
| `free-operation-viability.ts` | **Probe** overlay construction and grant mapping | Constructs new state with modified `pendingFreeOperationGrants` (lines 829, 848) |

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

`withPendingFreeOperationGrants(runtime, grants)` in `turn-flow-eligibility.ts:484-496` is a centralized setter used internally within `turn-flow-eligibility.ts` itself (no other module imports it).

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
  readonly trace: readonly TurnFlowGrantLifecycleTraceEntry[];
}

interface GrantArrayConsumeResult extends GrantArrayResult {
  readonly consumed: TurnFlowPendingFreeOperationGrant;  // the grant after transition
  readonly wasExhausted: boolean;
}

// Note: GrantArrayResult.trace is a plural array of TurnFlowGrantLifecycleTraceEntry,
// unlike the singular GrantLifecycleTransitionResult.traceEntry used by individual
// transition functions. This is deliberate — array-level operations may produce
// multiple trace entries (e.g., expireGrantsForSeat expires N grants).
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
  legal-moves.ts                  # MODIFY — delegate probe overlay filtering
  free-operation-viability.ts     # MODIFY — delegate probe overlay construction

packages/engine/test/unit/kernel/
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
- [ ] `legal-moves.ts` no longer directly filters the grants array
- [ ] `free-operation-viability.ts` no longer directly constructs probe overlay grants
- [ ] `withPendingFreeOperationGrants()` helper absorbed into or replaced by the authority module
- [ ] Array-level invariants (uniqueness, ordering) enforced with assertions in the authority module
- [ ] All grant mutations produce trace entries through the authority module
- [ ] Existing test suite passes with zero regressions
- [ ] Determinism canary passes on seeds 1001-1004

## Outcome

Completed on 2026-04-08.

What changed:
- `grant-lifecycle.ts` now owns the array-level grant operations introduced by this spec: insertion, batch insertion, consumption/removal, expiry/removal, sequence advancement, probe overlays, and the centralized runtime setter helper.
- All six writer modules named in the spec were migrated across tickets `63GRAARRAUT-001` through `63GRAARRAUT-007`: `effects-turn-flow.ts`, `turn-flow-eligibility.ts`, `apply-move.ts`, `phase-advance.ts`, `legal-moves.ts`, and `free-operation-viability.ts`.
- The proof ticket `63GRAARRAUT-008` landed the integration-style array-authority composition tests, restored the live FREOPSKIP runtime regression proof on `phase-advance.test.ts`, and re-verified the FITL policy-agent determinism canary.

Deviations from original plan:
- The `phase-advance.ts` migration did not use `expireGrantsForSeat()` directly. A narrower authority helper, `expireReadyBlockingGrantsForSeat()`, was added instead to preserve the live ready-only blocking-expiry contract.
- The probe-overlay migration needed one additional narrow authority helper, `stripZoneFilterFromProbeGrant()`, because `createProbeOverlay()` alone did not cover the live exploration-state probe rewrite in `free-operation-viability.ts`.
- The final proof work used the repo-correct built determinism canary command (`node --test dist/test/determinism/fitl-policy-agent-canary.test.js`) rather than the source `.ts` path referenced earlier in the spec/ticket text.
- The broad acceptance phrasing about “no direct pendingFreeOperationGrants array manipulation anywhere in kernel source files” was narrowed in practice to the migrated writer modules; legitimate non-writer reads and helper construction paths remain out of scope.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test`
- `node --test dist/test/determinism/fitl-policy-agent-canary.test.js`

Result: passed. The engine suite reported `474` passing tests, and the direct determinism canary probe passed on seeds `1001`-`1004`.

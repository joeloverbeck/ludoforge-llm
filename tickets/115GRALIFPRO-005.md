# 115GRALIFPRO-005: Move viability check into lifecycle and remove simulator error recovery

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel viability integration, simulator cleanup, apply-move wiring
**Deps**: `archive/tickets/115GRALIFPRO-004.md`

## Problem

Two critical grant-lifecycle behaviors remain outside the lifecycle module:

1. **Viability probing**: `hasLegalCompletedFreeOperationMoveInCurrentState` is called ad-hoc from `legal-moves.ts`. It should be invoked by the lifecycle module during the `ready → offered` transition for `skipIfNoLegalCompletion` grants, so non-viable grants are skipped before legal moves are surfaced.

2. **Simulator error recovery**: `simulator.ts:151-168` catches `NoPlayableMovesAfterPreparationError` and calls `skipPendingSkippableFreeOperationGrants` — a FOUNDATIONS §5 violation where the simulator compensates for kernel gaps. With the lifecycle owning skip/expiry transitions, this recovery path is no longer needed.

3. **Consume wiring**: `apply-move.ts` calls `consumeTurnFlowFreeOperationGrant` directly. This should be replaced with the lifecycle `consumeUse` transition.

## Assumption Reassessment (2026-04-07)

1. `hasLegalCompletedFreeOperationMoveInCurrentState` is exported from `free-operation-viability.ts:718` — called from `legal-moves.ts:685` — confirmed.
2. `simulator.ts:151-168` contains the catch block for `NoPlayableMovesAfterPreparationError` that calls `skipPendingSkippableFreeOperationGrants` — confirmed.
3. `NoPlayableMovesAfterPreparationError` is defined in `agents/no-playable-move.ts` — agents still throw it — confirmed. The class is NOT deleted.
4. `consumeTurnFlowFreeOperationGrant` is called from `apply-move.ts:1279` — confirmed.
5. `skipPendingSkippableFreeOperationGrants` and `expireUnfulfillableRequiredFreeOperationGrants` are exported from `turn-flow-eligibility.ts` — after this ticket, both are replaced by lifecycle transitions and can be deleted.
6. Ticket `004` already absorbed the runtime `consumeUse` transition inside `consumeTurnFlowFreeOperationGrant` and now immediately promotes newly unblocked sequenced grants after a free-operation use is consumed. This ticket should not re-claim that landed behavior; the remaining owned work is deleting the wrapper/export boundary and finishing the lifecycle-owned call sites.

## Architecture Check

1. Moving viability into the lifecycle means the kernel handles skip/expiry before surfacing legal moves — the simulator never needs to compensate (Foundation 5: One Rules Protocol).
2. The viability function itself stays in `free-operation-viability.ts` — only its invocation point moves to the lifecycle (per spec reassessment decision).
3. Removing the simulator catch block eliminates divergent grant handling paths — determinism by construction (Foundation 8).
4. No backwards-compatibility: old exported functions are deleted, not deprecated (Foundation 14).

## What to Change

### 1. Integrate viability check into lifecycle

In `grant-lifecycle.ts` or the calling site in `phase-advance.ts`/`legal-moves.ts`, add viability probing during the transition from `ready` to `offered` for grants with `completionPolicy === 'skipIfNoLegalCompletion'`:
- Call `hasLegalCompletedFreeOperationMoveInCurrentState` to check viability.
- If no viable completion exists, call `skipGrant` transition instead of `markOffered`.
- If viable, proceed with `markOffered`.

### 2. Wire `consumeUse` in `apply-move.ts`

Replace the direct call to `consumeTurnFlowFreeOperationGrant` at line 1279 by inlining or relocating the remaining wrapper-owned orchestration onto the lifecycle-owned path. Do not re-implement the already-landed `consumeUse` decrement/promotion behavior from ticket `004`; finish the boundary cleanup by removing the extra wrapper/export if the call-site shape allows it.

### 3. Wire `expireGrant` in `phase-advance.ts`

Replace the call to `expireUnfulfillableRequiredFreeOperationGrants` at line 505 with the lifecycle `expireGrant` transition.

### 4. Remove simulator error recovery

In `simulator.ts`, remove the `isNoPlayableMovesAfterPreparationError` catch block (lines 151-168) and the import of `skipPendingSkippableFreeOperationGrants`. The `NoPlayableMovesAfterPreparationError` class in `agents/no-playable-move.ts` is NOT deleted — agents may still throw it for diagnostics, but the simulator no longer catches and recovers from it.

### 5. Delete replaced exports from `turn-flow-eligibility.ts`

Remove:
- `skipPendingSkippableFreeOperationGrants` function and its export
- `expireUnfulfillableRequiredFreeOperationGrants` function and its export
- `consumeTurnFlowFreeOperationGrant` function and its export (replaced by lifecycle `consumeUse`)

Remove all now-unused imports in files that referenced these functions.

## Files to Touch

- `packages/engine/src/kernel/grant-lifecycle.ts` (modify — add viability integration)
- `packages/engine/src/kernel/apply-move.ts` (modify — wire `consumeUse`)
- `packages/engine/src/kernel/phase-advance.ts` (modify — wire `expireGrant`)
- `packages/engine/src/kernel/legal-moves.ts` (modify — wire viability via lifecycle)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify — delete 3 exported functions)
- `packages/engine/src/sim/simulator.ts` (modify — remove catch block and import)

## Out of Scope

- Refactoring `free-operation-viability.ts` internally (spec decision: file stays as-is)
- Deleting `NoPlayableMovesAfterPreparationError` class (agents still use it)
- Test fixture migration (ticket 006)
- Re-doing the consume-path promotion behavior already landed in ticket `004`

## Acceptance Criteria

### Tests That Must Pass

1. `simulator.ts` has NO grant-specific error handling — no `skipPendingSkippableFreeOperationGrants` import, no `isNoPlayableMovesAfterPreparationError` catch.
2. `turn-flow-eligibility.ts` no longer exports `skipPendingSkippableFreeOperationGrants`, `expireUnfulfillableRequiredFreeOperationGrants`, or `consumeTurnFlowFreeOperationGrant`.
3. `apply-move.ts` calls lifecycle `consumeUse`, not the old function.
4. `pnpm turbo typecheck` passes.
5. `pnpm turbo build` passes.

### Invariants

1. The simulator has no grant-specific logic (Foundation 5).
2. Viability is checked during lifecycle transitions, not ad-hoc (Foundation 15).
3. All transitions are deterministic (Foundation 8).
4. No backwards-compatibility shims for removed functions (Foundation 14).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — add viability integration tests (skip when no viable completion)
2. `packages/engine/test/unit/phase-advance.test.ts` — update to verify `expireGrant` transition is called

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

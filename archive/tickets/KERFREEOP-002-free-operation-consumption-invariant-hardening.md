# KERFREEOP-002: Fail fast on free-operation grant consumption desynchronization

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/turn-flow-eligibility.ts`, runtime invariant contracts, free-operation grant tests
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/runtime-error.ts`, `packages/engine/src/kernel/turn-flow-invariant-contract-types.ts`, `packages/engine/src/kernel/turn-flow-invariant-contracts.ts`

## Problem

`consumeTurnFlowFreeOperationGrant()` authorizes against the pre-move state and mutates the post-move state, which is the correct lifecycle split. But if the grant found in the pre-move authorization state is missing from post-move `runtime.pendingFreeOperationGrants`, the function currently returns unchanged state instead of raising a runtime invariant. That silently tolerates sequencing corruption at the kernel boundary.

## Assumption Reassessment (2026-03-11)

1. Current code in `turn-flow-eligibility.ts` authorizes against `authorizationState` and then searches for the same `grantId` in post-move `runtime.pendingFreeOperationGrants`.
2. If the `grantId` is not present post-move, current behavior is a silent early return instead of a runtime error.
3. The existing architecture does not model this as a `TurnFlowRuntimeError`; turn-flow invariants are expressed through `kernelRuntimeError('RUNTIME_CONTRACT_INVALID', ...)` with typed context contracts.
4. `apply-move.ts` already delegates grant consumption to `consumeTurnFlowFreeOperationGrant()` and does not need additional plumbing unless context capture proves insufficient.
5. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already contains the most relevant free-operation corruption and lifecycle coverage, so it is the primary regression target. `legal-moves.test.ts` is not the best home for this bug.

## Architecture Check

1. Failing fast on turn-flow state corruption is cleaner than allowing silent fallback because it keeps engine invariants explicit and easier to debug.
2. This stays game-agnostic: the invariant is about generic pending-grant lifecycle consistency, not about any particular game's event sequencing.
3. The cleanest implementation is to extend the existing turn-flow runtime invariant contract family instead of introducing a parallel ad hoc error channel for one consumption failure.
4. No backwards-compatibility path should preserve the silent fallback.

## What to Change

### 1. Raise a typed runtime invariant when authorized grants disappear

When a free operation is authorized in the pre-move state but the same `grantId` cannot be found in post-move pending runtime, throw a typed runtime/turn-flow invariant error instead of returning unchanged state.

Use the existing `RUNTIME_CONTRACT_INVALID` error path with a dedicated turn-flow invariant context/message helper, rather than introducing a new standalone turn-flow error class.

The invariant context should include enough structured data to diagnose:
- move `actionId`,
- active seat,
- authorized `grantId`,
- pre-move and post-move pending grant ids.

### 2. Add regression coverage for desync detection

Add a focused regression that constructs the desync case and verifies the engine throws the runtime invariant instead of silently continuing.

### 3. Keep the change surgical

Do not broaden this ticket into grant ordering, overlap resolution, or recovery semantics. The scope is invariant hardening around an already-authorized grant disappearing between authorization and consumption.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify for invariant context typing)
- `packages/engine/src/kernel/turn-flow-invariant-contract-types.ts` (modify)
- `packages/engine/src/kernel/turn-flow-invariant-contracts.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if context propagation is unexpectedly required)

## Out of Scope

- Refactoring free-operation grant ordering or viability semantics beyond the missing-grant invariant.
- Changing FITL card data.
- Adding recovery behavior for corrupted pending-grant state.
- Rehoming broad free-operation lifecycle tests into unrelated legality suites.

## Acceptance Criteria

### Tests That Must Pass

1. A desynchronized free-operation consumption path throws a typed invariant error instead of returning unchanged state.
2. Normal required-grant consumption still succeeds for chained free operations.
3. The invariant is emitted as `RUNTIME_CONTRACT_INVALID` with dedicated structured context for the missing authorized grant.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. If a grant authorizes a free move in the pre-move state, the post-move state must either consume/update that exact grant id or fail loudly.
2. Turn-flow invariant enforcement remains generic and independent of any game-specific card/event data.
3. Kernel runtime invariant contracts remain the single architecture for turn-flow corruption, rather than mixing invariant failures across unrelated error types.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a regression that simulates post-move pending-grant desynchronization and expects the runtime invariant failure.
2. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add coverage for the new invariant context/message contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-11
- What actually changed: added a dedicated turn-flow runtime invariant contract for an authorized free-operation grant disappearing before post-move consumption; `consumeTurnFlowFreeOperationGrant()` now throws `RUNTIME_CONTRACT_INVALID` with structured invariant context instead of silently returning; added regression coverage in the free-operation integration suite and contract coverage in `runtime-error-contracts.test.ts`.
- Deviations from original plan: `apply-move.ts` did not require changes; `legal-moves.test.ts` was not touched because the existing free-operation integration suite and runtime-error contract suite were a cleaner, more accurate fit for this invariant.
- Verification results: `pnpm -F @ludoforge/engine build`, `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`, `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`, `pnpm -F @ludoforge/engine lint`, and `pnpm -F @ludoforge/engine test` all passed.

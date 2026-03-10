# KERFREEOP-002: Fail fast on free-operation grant consumption desynchronization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/apply-move.ts`, turn-flow tests
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/src/kernel/turn-flow-eligibility.ts`, `packages/engine/src/kernel/apply-move.ts`

## Problem

`consumeTurnFlowFreeOperationGrant()` now authorizes against the pre-move state and mutates the post-move state, which is correct. But if the grant found in the pre-move authorization state is missing from post-move pending runtime, the function currently returns unchanged state instead of raising an invariant error. That hides sequencing corruption at exactly the point where the engine should fail loudly.

## Assumption Reassessment (2026-03-10)

1. Current code in `turn-flow-eligibility.ts` authorizes against `authorizationState` and then searches for the same `grantId` in post-move `runtime.pendingFreeOperationGrants`.
2. If the `grantId` is not present post-move, current behavior is a silent early return instead of a runtime error.
3. The corrected scope is to harden the invariant at the kernel boundary, not to add FITL-specific recovery logic or test-only assertions.

## Architecture Check

1. Failing fast on turn-flow state corruption is cleaner than allowing silent fallback because it keeps engine invariants explicit and easier to debug.
2. This stays game-agnostic: the invariant is about generic pending-grant lifecycle consistency, not about any particular game's event sequencing.
3. No backwards-compatibility path should preserve the silent fallback.

## What to Change

### 1. Raise a runtime invariant when authorized grants disappear

When a free operation is authorized in the pre-move state but the same `grantId` cannot be found in post-move pending runtime, throw a typed runtime/turn-flow invariant error instead of returning unchanged state.

The error should include enough structured context to diagnose:
- move `actionId`,
- active seat,
- authorized `grantId`,
- pre-move and post-move pending grant ids.

### 2. Add regression coverage for desync detection

Add a focused test that constructs or simulates the desync case and verifies the engine throws the invariant error rather than silently continuing.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify only if error plumbing needs context propagation)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if integration coverage is the best fit)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify only if unit coverage belongs there)

## Out of Scope

- Refactoring free-operation grant ordering or viability semantics beyond the missing-grant invariant.
- Changing FITL card data.
- Adding recovery behavior for corrupted pending-grant state.

## Acceptance Criteria

### Tests That Must Pass

1. A desynchronized free-operation consumption path throws a typed invariant error instead of returning unchanged state.
2. Normal required-grant consumption still succeeds for chained free operations.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. If a grant authorizes a free move in the pre-move state, the post-move state must either consume/update that exact grant id or fail loudly.
2. Turn-flow invariant enforcement remains generic and independent of any game-specific card/event data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a regression that forces or simulates post-move pending-grant desynchronization and expects the invariant failure.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add focused unit coverage only if a narrow helper-level test is cleaner than integration setup.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`

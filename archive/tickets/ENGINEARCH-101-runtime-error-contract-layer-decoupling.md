# ENGINEARCH-101: Decouple Runtime Error Contracts from Turn-Flow Implementation Modules

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract module extraction and import-boundary cleanup
**Deps**: tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md

## Problem

`runtime-error.ts` currently imports `FreeOperationBlockExplanation` from `turn-flow-eligibility.ts`. This couples the generic runtime error contract layer to a turn-flow implementation module and inverts dependency direction.

## Assumption Reassessment (2026-02-27)

1. Confirmed: `runtime-error.ts` has a type-only import from `turn-flow-eligibility.ts`.
2. Confirmed: runtime behavior is currently unaffected, but architecture layering is inverted (contract depends on implementation).
3. Confirmed: `FreeOperationBlockCause` and `FreeOperationBlockExplanation` are currently defined in `turn-flow-eligibility.ts` and consumed by runtime error contracts.
4. Scope correction: extract these shared types into a dedicated, implementation-agnostic kernel contract module and make both modules import from that module.
5. Test correction: strengthen unit contract tests to assert canonical type usage remains stable after extraction.

## Architecture Check

1. A dedicated contract module is cleaner and more extensible than sharing type contracts from an implementation module.
2. This aligns with stable kernel layering and reduces future coupling risk as turn-flow internals evolve.
3. No backwards-compatibility aliasing/shims; establish one canonical contract source.

## What to Change

### 1. Extract shared denial contract type(s)

Create a neutral kernel contract module for `FreeOperationBlockCause` and `FreeOperationBlockExplanation`.

### 2. Rewire imports to the contract source

Update both `runtime-error.ts` and `turn-flow-eligibility.ts` to consume the shared contract from the new canonical module.

### 3. Keep public exports explicit

Export the new contract module from kernel index to keep contracts discoverable via canonical kernel exports.

### 4. Strengthen tests for canonical contract location

Update runtime error contract tests to assert free-operation denial context remains type-safe and stable via the extracted contract.

## Files to Touch

- `packages/engine/src/kernel/free-operation-denial-contract.ts` (add)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)

## Out of Scope

- Free-operation denial semantics changes.
- Cross-surface parity additions.

## Acceptance Criteria

### Tests That Must Pass

1. `runtime-error.ts` no longer imports from `turn-flow-eligibility.ts` for denial contract types.
2. `turn-flow-eligibility.ts` and `runtime-error.ts` consume one shared denial contract module.
3. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` validates denial context shape against the canonical extracted type.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Kernel contract layering remains implementation-agnostic.
2. Public kernel exports remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — assert extracted denial contract type remains the canonical context payload type.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

Implemented as planned with one scope clarification applied first:

1. Added canonical contract module `packages/engine/src/kernel/free-operation-denial-contract.ts` for `FreeOperationBlockCause` and `FreeOperationBlockExplanation` (plus shared action-class contract type).
2. Rewired both `runtime-error.ts` and `turn-flow-eligibility.ts` to consume this neutral contract source.
3. Exported the new contract module from `packages/engine/src/kernel/index.ts`.
4. Strengthened `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` by binding FREE_OPERATION_NOT_GRANTED context payload to the extracted canonical contract type.
5. Verified full validation plan passes (`build`, targeted unit test, full engine tests, lint).

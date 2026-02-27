# ENGINEARCH-101: Decouple Runtime Error Contracts from Turn-Flow Implementation Modules

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract module extraction and import-boundary cleanup
**Deps**: tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md

## Problem

`runtime-error.ts` currently imports `FreeOperationBlockExplanation` from `turn-flow-eligibility.ts`. This couples the generic error-contract layer to a turn-flow implementation module and increases architectural entanglement risk as contracts evolve.

## Assumption Reassessment (2026-02-27)

1. The dependency is currently type-only, so runtime behavior is unaffected.
2. Despite being type-only, this import direction inverts layering: generic error contract code depends on specific turn-flow implementation.
3. Mismatch: architecture target is stable, reusable contract boundaries. Corrected scope is to extract shared contract types into a neutral kernel contract module.

## Architecture Check

1. A neutral contract module is cleaner than cross-importing implementation modules for shared payload types.
2. This preserves game-agnostic kernel design and avoids game-specific leakage.
3. No backwards-compatibility aliasing/shims; use one canonical contract type location.

## What to Change

### 1. Extract shared denial contract type(s)

Move `FreeOperationBlockCause`/`FreeOperationBlockExplanation` (or dedicated aliases) into a contract-oriented kernel module.

### 2. Rewire imports to contract source

Update `runtime-error.ts` and `turn-flow-eligibility.ts` to consume the shared contract type from the neutral module.

### 3. Keep public exports stable and explicit

Export the contract from kernel index through the canonical module path.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/kernel/` (add new contract module)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify if imports/types are asserted)

## Out of Scope

- Free-operation denial semantics changes.
- Cross-surface parity additions.

## Acceptance Criteria

### Tests That Must Pass

1. `runtime-error.ts` no longer imports turn-flow implementation modules for denial contract typing.
2. Turn-flow and runtime-error modules consume the same canonical denial contract type.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel contract layering remains implementation-agnostic.
2. Public kernel exports remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — ensure denial context shape remains stable after contract extraction.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

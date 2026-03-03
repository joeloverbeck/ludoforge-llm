# SEATRES-064: Eliminate active-seat surface type alias/re-export paths

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — contract module ownership boundaries for active-seat invariant surfaces
**Deps**: archive/tickets/SEATRES/SEATRES-051-replace-function-name-surface-literals-with-stable-semantic-ids.md

## Problem

`TurnFlowActiveSeatInvariantSurface` is still re-exported through `turn-flow-invariant-contracts.ts` even though the owning module is now `turn-flow-active-seat-invariant-surfaces.ts`. This leaves a secondary alias import path for the same contract symbol.

## Assumption Reassessment (2026-03-03)

1. Active-seat surface ID ownership was moved into `turn-flow-active-seat-invariant-surfaces.ts`.
2. `turn-flow-invariant-contracts.ts` still exports `TurnFlowActiveSeatInvariantSurface`, creating an alias path that is not needed for ownership clarity.
3. `packages/engine/test/helpers/active-seat-invariant-parity-helpers.ts` currently imports `TurnFlowActiveSeatInvariantSurface` from `kernel/index.ts`, which means removal of the alias export must be paired with helper import migration to the owner module.
4. Existing tests do not currently enforce a single import path for this type contract.

## Architecture Check

1. Single-owner symbol paths are cleaner than re-export aliases because layering is explicit and import intent is unambiguous.
2. This is contract-boundary hygiene inside game-agnostic kernel code and does not introduce game-specific behavior.
3. No backwards-compatibility pathing: remove alias export path and migrate imports directly to owner module.

## What to Change

### 1. Remove alias re-export

1. Stop exporting `TurnFlowActiveSeatInvariantSurface` from `turn-flow-invariant-contracts.ts`.
2. Ensure imports requiring the type pull from `turn-flow-active-seat-invariant-surfaces.ts` (or directly from `kernel/index.ts` only when it re-exports the owner module, not the alias module).
3. Migrate `active-seat-invariant-parity-helpers.ts` type import to the canonical owner path.

### 2. Guard module ownership

1. Add/extend source guard tests to assert no alias re-export path exists for active-seat surface type.
2. Add an import-surface assertion for canonical contract ownership.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-invariant-contracts.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify only if public export ownership requires tightening)
- `packages/engine/test/helpers/active-seat-invariant-parity-helpers.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` (modify/add)

## Out of Scope

- Renaming the surface ID values themselves
- Runtime behavior changes in turn-flow eligibility/effects
- Any GameSpecDoc or visual-config work

## Acceptance Criteria

### Tests That Must Pass

1. No alias export path exists for `TurnFlowActiveSeatInvariantSurface` outside the owner module/public-surface policy.
2. Canonical owner module is enforced by source guard tests.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat surface contract ownership is explicit and single-path.
2. Contract-layer modules remain game-agnostic and independent of game-specific data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` — add alias-path prohibition and canonical-owner assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Removed `TurnFlowActiveSeatInvariantSurface` re-export from `packages/engine/src/kernel/turn-flow-invariant-contracts.ts`.
  - Migrated `packages/engine/test/helpers/active-seat-invariant-parity-helpers.ts` to import `TurnFlowActiveSeatInvariantSurface` directly from `turn-flow-active-seat-invariant-surfaces.ts`.
  - Extended `packages/engine/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.ts` with ownership assertions that forbid alias re-export and enforce canonical owner-module import for the helper.
- **Deviations From Original Plan**:
  - Expanded explicit scope to include helper import migration after reassessment found active alias-path usage in `active-seat-invariant-parity-helpers.ts`.
  - `packages/engine/src/kernel/index.ts` did not require changes because it already re-exports the canonical owner module.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-invariant-contract-source-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` passed.

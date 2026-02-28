# ENGINEARCH-136: Canonical Free-Operation Analysis API Without Legacy Overlaps

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — turn-flow free-operation API ownership + export cleanup
**Deps**: archive/tickets/ENGINEARCH-124-unify-free-operation-denial-analysis-single-pass.md, archive/tickets/ENGINEARCH-129-eliminate-discovery-context-dispatcher-alias.md, archive/tickets/ENGINEARCH-133-canonical-free-operation-zone-filter-surface-contract.md

## Problem

The codebase now has a canonical free-operation discovery analysis resolver but still exports overlapping helper APIs (`explainFreeOperationBlockForMove`, `resolveFreeOperationExecutionPlayer`, `resolveFreeOperationZoneFilter`). This keeps multiple parallel entry points and alias paths for the same policy domain, increasing drift risk.

## Assumption Reassessment (2026-02-28)

1. `resolveFreeOperationDiscoveryAnalysis` now provides denial + execution player + zone filter in one artifact.
2. `apply-move` and `legal-choices` already consume `resolveFreeOperationDiscoveryAnalysis`; no remaining internal callsites use `explainFreeOperationBlockForMove`, `resolveFreeOperationExecutionPlayer`, or `resolveFreeOperationZoneFilter`.
3. Legacy helper APIs still exist as exports from `turn-flow-eligibility`, so overlap is now export-surface only.
4. Corrected scope: remove overlapping legacy helper exports/functions and lock a single canonical free-operation analysis contract.

## Architecture Check

1. One canonical API is cleaner and easier to reason about than multiple overlapping helpers with partially overlapping semantics.
2. This is purely kernel API ownership cleanup; no game-specific logic leaks into game-agnostic engine/simulator layers.
3. No backwards-compatibility aliasing: remove deprecated/overlapping paths instead of retaining wrappers.

## What to Change

### 1. Remove overlapping legacy helper exports/functions

Delete or internalize legacy helper APIs that duplicate canonical analysis outputs.

### 2. Harden tests around single-contract usage

Add/adjust tests to ensure denial cause, execution seat override, and zone-filter behavior remain unchanged after API consolidation.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts` (add)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (verify/no-change expected)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (verify/no-change expected)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (verify/no-change expected)

## Out of Scope

- Turn-flow gameplay rule changes.
- GameSpecDoc schema changes unrelated to free-operation analysis ownership.
- Any simulator visual/presentation concerns.

## Acceptance Criteria

### Tests That Must Pass

1. All free-operation analysis consumers use one canonical analysis contract (no parallel legacy helper path).
2. Denial cause mapping and execution seat/zone-filter behavior are unchanged.
3. Kernel public API does not export overlapping free-operation helper aliases.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No alias/backcompat shim exports for overlapping free-operation analysis APIs.
2. Kernel contract ownership stays centralized and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts` — assert canonical `resolveFreeOperationDiscoveryAnalysis` remains exported while overlapping legacy helper exports are absent.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — verify discovery behavior remains unchanged under canonical-only API.
3. `packages/engine/test/unit/kernel/apply-move.test.ts` — verify strict execution behavior remains unchanged under canonical-only API.
4. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — verify denial/execution parity remains intact after helper consolidation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-analysis-api-contract.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What changed**:
  - Corrected scope first: internal callsite consolidation was already complete; only legacy export-surface overlap remained.
  - Removed overlapping legacy helper exports/functions from `packages/engine/src/kernel/turn-flow-eligibility.ts`:
    - `explainFreeOperationBlockForMove`
    - `resolveFreeOperationExecutionPlayer`
    - `resolveFreeOperationZoneFilter`
  - Added `packages/engine/test/unit/kernel/free-operation-analysis-api-contract.test.ts` to enforce canonical API ownership.
- **Deviations from original plan**:
  - No changes were needed in `apply-move.ts`, `legal-choices.ts`, or `kernel/index.ts` because those callsites were already canonical.
  - Existing behavior/parity tests were verified without modifying their assertions.
- **Verification results**:
  - `pnpm turbo build` passed.
  - Targeted unit tests passed:
    - `node --test packages/engine/dist/test/unit/kernel/free-operation-analysis-api-contract.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
  - `pnpm -F @ludoforge/engine test` passed (`323` passed, `0` failed).
  - `pnpm turbo lint` passed.

# ENGINEARCH-136: Canonical Free-Operation Analysis API Without Legacy Overlaps

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — turn-flow free-operation API ownership + callsite consolidation + export cleanup
**Deps**: archive/tickets/ENGINEARCH-124-unify-free-operation-denial-analysis-single-pass.md, archive/tickets/ENGINEARCH-129-eliminate-discovery-context-dispatcher-alias.md, tickets/ENGINEARCH-133-canonical-free-operation-zone-filter-surface-contract.md

## Problem

The codebase now has a canonical free-operation discovery analysis resolver but still exports overlapping helper APIs (`explainFreeOperationBlockForMove`, `resolveFreeOperationExecutionPlayer`, `resolveFreeOperationZoneFilter`). This keeps multiple parallel entry points and alias paths for the same policy domain, increasing drift risk.

## Assumption Reassessment (2026-02-28)

1. `resolveFreeOperationDiscoveryAnalysis` now provides denial + execution player + zone filter in one artifact.
2. Legacy helper APIs remain exported from `turn-flow-eligibility` and are reachable via kernel index exports.
3. Mismatch: overlapping APIs permit partial-policy consumption and future divergence; corrected scope is to enforce one canonical free-operation analysis contract and remove legacy overlaps.

## Architecture Check

1. One canonical API is cleaner and easier to reason about than multiple overlapping helpers with partially overlapping semantics.
2. This is purely kernel API ownership cleanup; no game-specific logic leaks into game-agnostic engine/simulator layers.
3. No backwards-compatibility aliasing: remove deprecated/overlapping paths instead of retaining wrappers.

## What to Change

### 1. Consolidate callsites on canonical analysis contract

Replace internal callsites that still depend on legacy helper APIs with `resolveFreeOperationDiscoveryAnalysis`-based consumption.

### 2. Remove overlapping legacy helper exports/functions

Delete or internalize legacy helper APIs that duplicate canonical analysis outputs.

### 3. Harden tests around single-contract usage

Add/adjust tests to ensure denial cause, execution seat override, and zone-filter behavior remain unchanged after API consolidation.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify if needed after helper removal)
- `packages/engine/src/kernel/legal-choices.ts` (modify if needed after helper removal)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- Turn-flow gameplay rule changes.
- GameSpecDoc schema changes unrelated to free-operation analysis ownership.
- Any simulator visual/presentation concerns.

## Acceptance Criteria

### Tests That Must Pass

1. All free-operation analysis consumers use one canonical analysis contract (no parallel legacy helper path).
2. Denial cause mapping and execution seat/zone-filter behavior are unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No alias/backcompat shim exports for overlapping free-operation analysis APIs.
2. Kernel contract ownership stays centralized and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — assert discovery behavior unchanged under canonical-only API.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` — assert strict execution behavior unchanged under canonical-only API.
3. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — assert denial/execution parity remains intact after helper consolidation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo lint`

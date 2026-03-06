# TOKFILAST-032: Add No-Legacy-API Regression Guard for Condition-Surface Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contracts public API regression hardening
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

The condition-surface contract migrated from flat suffix keys and a generic append helper to family-scoped APIs. There is no explicit guard that fails if deprecated flat keys or generic helper surfaces are reintroduced.

## Assumption Reassessment (2026-03-06)

1. Current contract exports family-scoped suffix namespaces and family-scoped append helpers.
2. Existing tests validate behavior and callsite usage but do not explicitly fail on reintroduction of legacy flat API shapes.
3. There are currently no active `TOKFILAST-025..029` tickets in `tickets/`; no separate active ticket enforces this no-legacy-condition-surface API invariant.
4. `appendConditionSurfacePath` currently exists as a private local helper in `condition-surface-contract.ts`; the guard target is accidental export exposure, not helper removal.

## Architecture Check

1. A strict no-legacy regression guard preserves a clean contract surface and prevents architectural drift.
2. This is engine contract hygiene only; it does not add game-specific branches and keeps `GameDef`/simulator agnostic.
3. No backwards-compatibility aliases/shims are introduced; legacy API shape remains intentionally absent.
4. Benefit vs current architecture: adding explicit negative export assertions increases robustness at the module boundary without adding runtime complexity or duplicating behavior checks.

## What to Change

### 1. Add contract-level negative regression assertions

Add tests that assert legacy flat keys and `appendConditionSurfacePath` are not exported from contracts public surface.

### 2. Ensure guard aligns with contracts public-surface policy

Keep checks colocated with existing contract boundary/public surface tests to fail fast on accidental API expansion.
No `contracts-kernel-boundary` changes unless a direct gap is found during implementation.

## Files to Touch

- `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (modify)

## Out of Scope

- Renaming current family-scoped helpers.
- Runtime validator behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. Contract tests fail if legacy flat condition-surface keys are reintroduced.
2. Contract tests fail if generic `appendConditionSurfacePath` is re-exposed on public contracts surface.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition-surface contracts remain family-scoped and explicit.
2. Engine kernel/runtime contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` — enforce no legacy condition-surface API exports.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What actually changed:
  - Added explicit negative regression assertions in `contracts-public-surface-import-policy.test.ts` to enforce that contracts public surface does not export:
    - legacy flat condition-surface keys (`ifWhen`, `spaceFilterCondition`, `via`, `where`, `filterCondition`, `moveAllFilter`, `grantFreeOperationZoneFilter`, `applicability`, `legality`, `costValidation`, `targetingFilter`)
    - generic helper `appendConditionSurfacePath`
  - Reassessed and corrected assumptions/scope before implementation (no active `TOKFILAST-025..029`; guard target clarified as accidental export exposure).
- Deviations from original plan:
  - `contracts-kernel-boundary.test.ts` was not modified after reassessment because the gap existed in public export regression coverage, not kernel-boundary enforcement.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.

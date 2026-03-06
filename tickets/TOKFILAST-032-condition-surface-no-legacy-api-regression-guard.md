# TOKFILAST-032: Add No-Legacy-API Regression Guard for Condition-Surface Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contracts public API regression hardening
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

The condition-surface contract migrated from flat suffix keys and a generic append helper to family-scoped APIs. There is no explicit guard that fails if deprecated flat keys or generic helper surfaces are reintroduced.

## Assumption Reassessment (2026-03-06)

1. Current contract exports family-scoped suffix namespaces and family-scoped append helpers.
2. Existing tests validate behavior and callsite usage but do not explicitly fail on reintroduction of legacy flat API shapes.
3. Active tickets (`TOKFILAST-025..029`) do not currently enforce this no-legacy-condition-surface API invariant.

## Architecture Check

1. A strict no-legacy regression guard preserves a clean contract surface and prevents architectural drift.
2. This is engine contract hygiene only; it does not add game-specific branches and keeps `GameDef`/simulator agnostic.
3. No backwards-compatibility aliases/shims are introduced; legacy API shape remains intentionally absent.

## What to Change

### 1. Add contract-level negative regression assertions

Add tests that assert legacy flat keys and `appendConditionSurfacePath` are not exported from contracts public surface.

### 2. Ensure guard aligns with contracts public-surface policy

Keep checks colocated with existing contract boundary/public surface tests to fail fast on accidental API expansion.

## Files to Touch

- `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (modify)
- `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` (modify, if needed)

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
2. `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` — reinforce family-scoped contract surface ownership.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`


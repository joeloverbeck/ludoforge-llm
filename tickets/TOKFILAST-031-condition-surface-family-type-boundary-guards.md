# TOKFILAST-031: Add Compile-Time Family Boundary Guards for Condition-Surface Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract type-boundary guard coverage
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-024-condition-surface-contract-taxonomy-normalization.md

## Problem

Condition-surface helpers are now family-scoped (`valueExpr`, `query`, `effect`, `actionPipeline`), but there is no explicit type-level regression test guaranteeing family mismatch calls stay impossible.

## Assumption Reassessment (2026-03-06)

1. `condition-surface-contract.ts` exposes family-scoped helper APIs and family-scoped suffix maps.
2. Existing runtime/unit tests validate emitted path behavior, but do not explicitly codify compile-time family isolation guarantees.
3. No active ticket currently scopes type-level family-boundary guard assertions for condition-surface helper APIs.

## Architecture Check

1. Explicit type-boundary tests are cleaner than implicit trust because they lock in the architectural contract as code evolves.
2. This strengthens generic engine contracts without introducing game-specific logic; `GameDef`/simulator remain game-agnostic.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add type-level contract tests for family mismatch rejection

Introduce compile-time assertions that query/effect/valueExpr/actionPipeline suffixes cannot be passed to non-matching append helpers.

### 2. Add positive type-level parity assertions

Assert each helper accepts its own family suffix domain and emits canonical path strings.

## Files to Touch

- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)
- `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` (modify, if needed for contract API parity checks)

## Out of Scope

- Validator runtime logic changes.
- Additional condition-surface categories beyond current families.

## Acceptance Criteria

### Tests That Must Pass

1. Compile-time checks fail when cross-family suffix/helper wiring is attempted.
2. Compile-time checks pass for valid family-scoped helper usage.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition-surface family ownership remains explicit and type-enforced.
2. `GameDef` and simulation/kernel remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-exhaustive.test.ts` — add family-scoped append helper type-level mismatch/acceptance assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`


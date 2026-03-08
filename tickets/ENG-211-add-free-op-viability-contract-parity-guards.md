# ENG-211: Add Free-Operation Viability Contract Parity Guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract parity guard tests for free-operation viability policy surfaces
**Deps**: packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/types-turn-flow.ts, packages/engine/src/kernel/types-events.ts, packages/engine/src/kernel/types-ast.ts, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts, packages/engine/src/cnl/compile-effects.ts

## Problem

`viabilityPolicy` now spans contracts, types, schemas, compiler lowering, validation, and runtime. Without explicit parity guards, future edits can silently drift one surface and break determinism or produce inconsistent diagnostics.

## Assumption Reassessment (2026-03-08)

1. Canonical viability-policy values exist in `contracts/turn-flow-free-operation-grant-contract.ts`.
2. Multiple downstream surfaces consume these values, but no dedicated parity guard test currently enforces full cross-surface consistency.
3. Mismatch: consistency relies on convention, not enforced contract checks. Correction: add explicit parity guard tests.

## Architecture Check

1. Contract parity guards prevent drift and keep behavior deterministic across compiler/runtime layers.
2. This work is strictly game-agnostic and does not encode any game-specific branching.
3. No backwards-compatibility aliases/shims: tests enforce one canonical source of truth.

## What to Change

### 1. Add source parity guard tests

Add tests that verify viability-policy values and field presence are aligned across:
- contracts canonical constants
- AST/event/runtime grant type surfaces
- AST/extensions schema surfaces

### 2. Add behavior-surface guard checks

Add tests that verify lowering and runtime validation reject unknown policy values and accept canonical values.

## Files to Touch

- `packages/engine/test/unit/kernel/<free-op-viability-contract-parity>.test.ts` (new)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if needed)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify, if needed)

## Out of Scope

- Changes to policy semantics.
- Sequence/mandatory grant behavior redesign.

## Acceptance Criteria

### Tests That Must Pass

1. Canonical viability policy values are identical across all declared contract/type/schema surfaces.
2. Unknown policy values fail consistently at lowering and runtime validation boundaries.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical policy-value source drives all surfaces.
2. Contract drift is caught by tests before merge.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<free-op-viability-contract-parity>.test.ts` — enforce cross-surface parity.
2. `packages/engine/test/unit/compile-effects.test.ts` — compiler boundary rejection checks.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — runtime boundary rejection checks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

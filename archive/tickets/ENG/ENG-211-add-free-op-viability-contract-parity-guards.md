# ENG-211: Add Free-Operation Viability Contract Parity Guards

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — contract parity guard tests for free-operation viability policy surfaces
**Deps**: packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts, packages/engine/src/kernel/types-turn-flow.ts, packages/engine/src/kernel/types-events.ts, packages/engine/src/kernel/types-ast.ts, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

`viabilityPolicy` now spans contracts, types, schemas, compiler lowering, validation, and runtime. Without explicit parity guards, future edits can silently drift one surface and break determinism or produce inconsistent diagnostics.

## Assumption Reassessment (2026-03-09)

1. Canonical viability-policy values exist in `contracts/turn-flow-free-operation-grant-contract.ts`.
2. Multiple downstream surfaces consume these values, but no dedicated parity guard test currently enforces full cross-surface consistency.
3. Compiler boundary rejection already exists in `packages/engine/test/unit/compile-effects.test.ts` (`rejects invalid grantFreeOperation.viabilityPolicy values`).
4. Runtime rejection of invalid `viabilityPolicy` exists in `effects-turn-flow.ts` but is not directly covered by a focused unit test.
5. Mismatch corrected: keep existing compiler test, add dedicated parity guard tests, and add focused runtime-invalid-policy coverage.

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

### 2. Add behavior-surface guard checks (non-duplicative)

Add/adjust tests that verify:
- lowering accepts canonical values and rejects unknown policy values (reusing existing compile-effects coverage)
- runtime validation in `applyGrantFreeOperation` rejects unknown policy values

## Files to Touch

- `packages/engine/test/unit/kernel/<free-op-viability-contract-parity>.test.ts` (new)
- `packages/engine/test/unit/compile-effects.test.ts` (already covers invalid-value rejection; modify only if parity gaps remain)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify, if needed)

## Out of Scope

- Changes to policy semantics.
- Sequence/mandatory grant behavior redesign.

## Acceptance Criteria

### Tests That Must Pass

1. Canonical viability policy values are identical across all declared contract/type/schema surfaces.
2. Unknown policy values fail consistently at lowering and runtime validation boundaries.
3. Existing compile-effects invalid-policy test remains valid (no redundant duplicate test required).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical policy-value source drives all surfaces.
2. Contract drift is caught by tests before merge.
3. Runtime validation boundary for malformed viability policies is directly exercised by unit tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<free-op-viability-contract-parity>.test.ts` — enforce cross-surface parity.
2. `packages/engine/test/unit/compile-effects.test.ts` — existing compiler boundary rejection check remains and is verified.
3. `packages/engine/test/unit/effects-turn-flow.test.ts` — runtime boundary rejection checks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-09
- **Outcome amended**: 2026-03-09
- **What actually changed**:
  - Added `packages/engine/test/unit/kernel/free-operation-viability-contract-parity.test.ts` to enforce cross-surface viability-policy parity across canonical contract values, type-level surfaces (turn-flow/AST/event), schema surfaces, runtime guard, and compile-effect lowering rejection paths.
  - Added focused runtime boundary coverage in `packages/engine/test/unit/effects-turn-flow.test.ts` for invalid `grantFreeOperation.viabilityPolicy` values.
  - Refined `packages/engine/src/kernel/validate-gamedef-behavior.ts` to validate `grantFreeOperation.viabilityPolicy` via canonical `isTurnFlowFreeOperationGrantViabilityPolicy(...)` runtime guard (instead of direct literal-array membership checks), and added a guard assertion in parity tests to prevent regression.
  - Reassessed assumptions and narrowed scope to avoid duplicating existing compiler-invalid-policy coverage already present in `packages/engine/test/unit/compile-effects.test.ts`.
- **Deviations from original plan**:
  - Did not add new assertions to `compile-effects.test.ts` because equivalent invalid-policy rejection coverage already existed and remains valid.
- **Verification results**:
  - Passed: `pnpm -F @ludoforge/engine build`
  - Passed: `cd packages/engine && node --test dist/test/unit/compile-effects.test.js dist/test/unit/effects-turn-flow.test.js dist/test/unit/kernel/free-operation-viability-contract-parity.test.js`
  - Passed: `pnpm -F @ludoforge/engine lint`

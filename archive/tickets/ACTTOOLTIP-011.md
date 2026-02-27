# ACTTOOLTIP-011: Add explicit `removeByPriority` macro-origin policy parity guardrails

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — binder-surface policy tests
**Deps**: None

## Problem

`removeByPriority` macro-origin group annotation currently depends on `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS`. A dedicated parity assertion exists, but it is one-way: it verifies policy fields are declared, yet does not fail when new `removeByPriority.groups.*` declared binder fields are added without explicit policy classification.

## Assumption Reassessment (2026-02-27)

1. `removeByPriority` group annotation in macro expansion uses `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` — confirmed.
2. `removeByPriority` declared binder paths are defined canonically in `EFFECT_BINDER_SURFACES.removeByPriority.declaredBinderPaths` — confirmed.
3. Existing tests already include a dedicated `removeByPriority` group parity assertion in `binder-surface-registry.test.ts` — corrected.
4. The existing assertion is subset-only and does not enforce bidirectional parity or report extra declared group binder fields omitted from policy — confirmed mismatch and corrected scope.

## Architecture Check

1. Dedicated parity guardrails are cleaner than relying on incidental behavioral tests for policy drift.
2. Bidirectional parity is cleaner than subset-only checks because binder-surface expansion must force an explicit macro-origin policy decision.
3. This remains compiler-internal and game-agnostic.
4. No compatibility fallback: policy drift should fail tests immediately.

## What to Change

### 1. Add `removeByPriority` policy parity test

- Replace subset-only validation with bidirectional parity between:
  - `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS`
  - leaf fields from `EFFECT_BINDER_SURFACES.removeByPriority.declaredBinderPaths` filtered to `groups.*`
- Fail on both missing and extra fields.

### 2. Tighten failure diagnostics in the test

- Include actionable diagnostics that list:
  - fields present in policy but not declared surfaces
  - fields declared on `groups.*` surfaces but missing from policy

## Files to Touch

- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- Refactoring `removeByPriority` runtime semantics
- Changing macro-origin parent-resolution policy logic
- UI/runner behavior

## Acceptance Criteria

### Tests That Must Pass

1. Test fails if `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` drifts from group-level declared binder paths.
2. Test fails when group-level declared binder paths gain a new field without explicit policy update.
3. Existing `expand-effect-macros` `removeByPriority` macro-origin behavior tests remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `removeByPriority` group macro-origin policy is anchored to canonical binder surfaces.
2. `removeByPriority.groups.*` binder declarations and macro-origin policy classification remain in explicit lockstep.
3. All validation remains game-agnostic with no game-specific conditionals.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add explicit parity assertion for `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` vs `removeByPriority` group binder paths.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`
3. `pnpm turbo test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Corrected ticket assumptions/scope to reflect that a `removeByPriority` parity test already existed and that the actual gap was one-way coverage plus weak diagnostics.
  - Hardened `packages/engine/test/unit/binder-surface-registry.test.ts` to enforce bidirectional parity between `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` and `removeByPriority.groups.*` declared binder leaf fields, with explicit missing/extra diagnostics.
  - Updated `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` to include both declared group binders (`bind`, `countBind`) so policy and binder surface contracts stay in lockstep.
  - Added a focused edge-case in `packages/engine/test/unit/expand-effect-macros.test.ts` proving group macro-origin annotation can come from `countBind` when `bind` is exported/non-local.
- **Deviations from Original Plan**:
  - Original ticket draft implied test-only changes; final implementation also updated macro-origin policy constant to satisfy strict bidirectional parity and improve long-term architectural consistency.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed (`304` passed, `0` failed).
  - `pnpm turbo lint` passed (`2/2` tasks).
  - `pnpm turbo test` passed (`engine: 304 passed`, `runner: 1363 passed`).

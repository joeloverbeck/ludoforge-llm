# ACTTOOLTIP-011: Add explicit `removeByPriority` macro-origin policy parity guardrails

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — binder-surface policy tests
**Deps**: None

## Problem

`removeByPriority` macro-origin group annotation currently depends on `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS`, but there is no dedicated parity assertion that this list stays aligned with binder surface contracts for `removeByPriority.groups.*`.

## Assumption Reassessment (2026-02-27)

1. `removeByPriority` group annotation in macro expansion uses `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` — confirmed.
2. `removeByPriority` declared binder paths are defined canonically in `EFFECT_BINDER_SURFACES.removeByPriority.declaredBinderPaths` — confirmed.
3. Existing tests cover behavior but do not include a dedicated contract-parity assertion for this policy constant — confirmed mismatch and corrected scope.

## Architecture Check

1. Dedicated parity guardrails are cleaner than relying on incidental behavioral tests for policy drift.
2. This remains compiler-internal and game-agnostic.
3. No compatibility fallback: policy drift should fail tests immediately.

## What to Change

### 1. Add `removeByPriority` policy parity test

- Assert that each field in `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` is present in the leaf segments of `removeByPriority` declared binder paths that apply to groups.

### 2. Tighten failure diagnostics in the test

- Include actionable failure messages naming missing/extra fields so future updates are explicit.

## Files to Touch

- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- Refactoring `removeByPriority` runtime semantics
- Changing macro-origin parent-resolution policy logic
- UI/runner behavior

## Acceptance Criteria

### Tests That Must Pass

1. Test fails if `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` drifts from group-level declared binder paths.
2. Existing `expand-effect-macros` `removeByPriority` macro-origin behavior tests remain green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `removeByPriority` group macro-origin policy is anchored to canonical binder surfaces.
2. All validation remains game-agnostic with no game-specific conditionals.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add explicit parity assertion for `REMOVE_BY_PRIORITY_MACRO_ORIGIN_GROUP_BIND_FIELDS` vs `removeByPriority` group binder paths.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`

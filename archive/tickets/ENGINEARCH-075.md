# ENGINEARCH-075: Enforce test coverage for non-`during` `replaceRemainingStages` invariants

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — kernel unit tests only
**Deps**: ENGINEARCH-072 (archived)

## Problem

`validateCompoundTimingConfiguration` now rejects any defined `replaceRemainingStages` value when `timing !== 'during'`. Current tests cover `replaceRemainingStages: true` for `before/after`, but do not explicitly cover `replaceRemainingStages: false` for those same timings. That leaves a contract hole where future regressions could accidentally allow one boolean branch while rejecting the other.

## Assumption Reassessment (2026-02-26)

1. `packages/engine/src/kernel/apply-move.ts` rejects `replaceRemainingStages` when `timing !== 'during'` without checking truthiness (`!== undefined` semantics).
2. `packages/engine/test/unit/kernel/apply-move.test.ts` currently asserts non-`during` illegality for `replaceRemainingStages: true` (`timing=before/after`), but not for `false`.
3. Scope correction: add explicit `false` cases for both non-`during` timings so tests encode the field-presence invariant (`replaceRemainingStages !== undefined`) instead of a single truthy branch.

## Architecture Check

1. This is a contract-hardening ticket: explicit tests make the invariant stable and prevent semantic drift.
2. Scope is kernel-generic (`CompoundMovePayload`), with no game-specific branching.
3. No backward-compatibility aliasing/shims are introduced.
4. Benefit vs current architecture: this strengthens the existing architecture (presence-based validation) without introducing new behavior branches or policy surface area.

## What to Change

### 1. Extend compound timing invariant tests

In `apply-move.test.ts`, add explicit illegal-move assertions for:
- `replaceRemainingStages: false` with `timing: 'before'`
- `replaceRemainingStages: false` with `timing: 'after'`

Assert reason and metadata consistency with the existing invariant tests.

### 2. Keep taxonomy assertions unchanged

No new runtime reason code is required. Reuse `COMPOUND_TIMING_CONFIGURATION_INVALID`.

## Files to Touch

- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in `apply-move.ts`
- Trace/observability enhancements (covered separately)

## Acceptance Criteria

### Tests That Must Pass

1. `replaceRemainingStages: false` with `timing: 'before'` throws `IllegalMoveError`
2. `replaceRemainingStages: false` with `timing: 'after'` throws `IllegalMoveError`
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. For non-`during` timing, `replaceRemainingStages` is invalid regardless of boolean value.
2. Illegal reason remains `compoundTimingConfigurationInvalid` for this class of misconfiguration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add explicit `false`-branch invariant tests for non-`during` timing

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-26
- What actually changed:
  - Added two unit tests in `packages/engine/test/unit/kernel/apply-move.test.ts`:
    - `replaceRemainingStages: false with timing=before is illegal`
    - `replaceRemainingStages: false with timing=after is illegal`
  - Updated this ticket’s assumption language to explicitly encode presence-based validation (`replaceRemainingStages !== undefined`) and confirm scope.
- Deviations from original plan:
  - None in implementation scope; no runtime/kernel behavior changes were needed.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js"` passed.
  - `pnpm -F @ludoforge/engine test` passed (`297/297`).
  - `pnpm turbo lint` passed.

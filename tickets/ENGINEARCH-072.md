# ENGINEARCH-072: Validate compound `replaceRemainingStages` requires `timing: 'during'`

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel `apply-move.ts` validation + unit tests
**Deps**: none

## Problem

`replaceRemainingStages: true` on a `CompoundMovePayload` silently does nothing when `timing` is `'before'` or `'after'`. The `break` statement only lives inside the stage loop, which only fires for `timing === 'during'`. This means a misconfigured compound move (e.g., `timing: 'after', replaceRemainingStages: true`) would silently ignore the flag — the SA would run after all stages instead of replacing them.

The same silent-no-op pattern exists for `insertAfterStage` when `timing !== 'during'`, so this ticket should address both flags together for consistency.

## Assumption Reassessment (2026-02-26)

1. `apply-move.ts:686` sets `insertAfter = -1` when `timing !== 'during'`, making `insertAfterStage` silently unused.
2. `apply-move.ts:706` only reaches the `replaceRemainingStages` check inside the stage loop, so it's also silently unused when `timing !== 'during'`.
3. No compile-time validation in the compiler catches this misconfiguration.
4. **Mismatch + correction**: Both `insertAfterStage` and `replaceRemainingStages` should be rejected or warned when `timing !== 'during'`.

## Architecture Check

1. Adding a validation check in `apply-move.ts` at the compound-move preamble is the cleanest approach — it catches the error at the point of use rather than requiring every caller to validate.
2. Both flags are game-agnostic engine primitives on `CompoundMovePayload` — validation stays in the kernel, no game-specific branching.
3. No backwards-compatibility aliasing needed. Existing valid compound moves all use `timing: 'during'` when these flags are set.

## What to Change

### 1. Runtime validation in `apply-move.ts`

In `executeMoveAction`, before the stage loop, add a check that rejects compound moves where `insertAfterStage` or `replaceRemainingStages` is set but `timing !== 'during'`. Return an `illegal` result with a descriptive reason.

### 2. Unit tests for the validation

Add test cases that verify:
- `insertAfterStage` with `timing: 'before'` → illegal
- `insertAfterStage` with `timing: 'after'` → illegal
- `replaceRemainingStages: true` with `timing: 'before'` → illegal
- `replaceRemainingStages: true` with `timing: 'after'` → illegal
- Valid combinations continue working

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)

## Out of Scope

- Compile-time validation in the compiler (compound constraints are assembled from GameSpecDoc data; compiler-level validation is a separate concern)
- `insertAfterStage` bounds checking (ensuring it's < stage count) — related but distinct

## Acceptance Criteria

### Tests That Must Pass

1. `replaceRemainingStages: true` with `timing: 'before'` returns illegal move result
2. `replaceRemainingStages: true` with `timing: 'after'` returns illegal move result
3. `insertAfterStage` with `timing: 'before'` returns illegal move result
4. `insertAfterStage` with `timing: 'after'` returns illegal move result
5. Valid `timing: 'during'` with both flags continues working
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `replaceRemainingStages` and `insertAfterStage` are only meaningful when `timing === 'during'`
2. Misconfigured compound moves fail fast with descriptive errors rather than silently ignoring flags

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — New describe block for compound timing validation

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "compound"`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`

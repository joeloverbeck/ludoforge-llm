# OPSAGRP-003: Add test coverage for direct operationPlusSpecialActivity emission

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`deriveActionGroups` has a branch for `ac === 'operationPlusSpecialActivity'` (line 1147) handling the case where the engine emits this class directly (2nd eligible faction in COIN). This branch has no dedicated test coverage. The existing test only validates the synthesis-from-`operation` path.

## Assumption Reassessment (2026-03-10)

1. The `ac === 'operationPlusSpecialActivity'` branch exists at line 1147-1152 of `derive-render-model.ts` — confirmed.
2. The test `synthesizes Op+SA group from operation moves and filters out specialActivity` in `derive-render-model-state.test.ts` does not include any move with `actionClass: 'operationPlusSpecialActivity'` in its input array — confirmed. It only tests the synthesis path.
3. The COIN 2nd-eligible path in the engine does emit `operationPlusSpecialActivity` directly — this is the expected kernel behavior for the limited-operation case.

## Architecture Check

1. This is a pure test-coverage addition — no production code changes.
2. No game-specific logic added to agnostic layers.
3. No backwards-compatibility concerns.

## What to Change

### 1. Add test case for direct `operationPlusSpecialActivity` emission

Add a test in `derive-render-model-state.test.ts` that includes moves with `actionClass: 'operationPlusSpecialActivity'` directly (not via synthesis from `operation`). Verify they appear in the Op+SA group with the correct `actionClass` value.

### 2. Add combined test

Add a test with mixed moves: some `operation` (synthesized into Op+SA) and some direct `operationPlusSpecialActivity` — verify deduplication works correctly when both paths produce entries for the same group.

## Files to Touch

- `packages/runner/test/model/derive-render-model-state.test.ts` (modify)

## Out of Scope

- Changing the grouping logic itself
- Engine-level changes to when `operationPlusSpecialActivity` is emitted

## Acceptance Criteria

### Tests That Must Pass

1. Direct `operationPlusSpecialActivity` moves appear in the Op+SA group with `actionClass: 'operationPlusSpecialActivity'`
2. Mixed direct + synthesized Op+SA entries deduplicate correctly by `actionId`
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No production code changes in this ticket

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model-state.test.ts` — two new test cases for the direct-emission and mixed-emission scenarios

### Commands

1. `pnpm -F @ludoforge/runner test`

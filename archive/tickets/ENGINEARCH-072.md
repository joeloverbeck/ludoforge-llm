# ENGINEARCH-072: Validate compound timing/flags fail fast (no silent no-ops)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel move validation/runtime reasons + unit tests
**Deps**: none

## Problem

Compound move fields currently allow silent no-op configurations:

1. `replaceRemainingStages: true` does nothing when `timing` is `'before'` or `'after'`.
2. `insertAfterStage` does nothing when `timing` is `'before'` or `'after'`.
3. `timing: 'during'` does nothing when the operation has no matched staged execution pipeline (SA never runs).

These should fail fast as illegal moves instead of being accepted and partially ignored.

## Assumption Reassessment (2026-02-26)

1. In [`packages/engine/src/kernel/apply-move.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts), `insertAfterStage` and `replaceRemainingStages` are only consumed in the `'during'` staged loop path, so they are silently ignored for `'before'`/`'after'`.
2. In the same file, `'during'` execution is only meaningful when `executionProfile` exists; without a matched pipeline, compound SA is never invoked.
3. [`packages/engine/src/kernel/schemas-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/schemas-core.ts) validates field shapes only; it does not enforce cross-field timing semantics.
4. [`packages/engine/src/kernel/runtime-reasons.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/runtime-reasons.ts) currently has no dedicated illegal-move reason for invalid compound timing/flag configuration.
5. **Mismatch + correction**: Validation must reject (not warn) these misconfigurations:
   - `insertAfterStage` or `replaceRemainingStages` when `timing !== 'during'`
   - `timing === 'during'` when no staged execution pipeline is matched

## Architecture Check

1. Fail-fast runtime validation is architecturally better than silent no-op behavior: it preserves invariants and makes authored specs deterministic.
2. Validation belongs in shared kernel move-validation/execution flow (generic `CompoundMovePayload` semantics), not in game-specific compilers or data.
3. Add a dedicated illegal-move reason code for this invariant breach rather than overloading unrelated reasons.
4. No compatibility aliasing: invalid configurations should break and be fixed at source.

## What to Change

### 1. Runtime validation in `apply-move.ts`

Add a shared compound timing validator and enforce it before execution:

- Reject `insertAfterStage` when `timing !== 'during'`
- Reject `replaceRemainingStages` when `timing !== 'during'`
- Reject `timing === 'during'` when no matched staged execution profile exists

Implementation behavior: throw `IllegalMoveError` with a dedicated `ILLEGAL_MOVE_REASONS` entry and metadata identifying the invalid fields/timing context.

### 2. Extend illegal-move reasons in `runtime-reasons.ts`

Add one explicit reason constant/message for invalid compound timing configuration and include it in `KERNEL_RUNTIME_REASONS`.

### 3. Unit tests for the validation

Add test cases that verify:
- `insertAfterStage` with `timing: 'before'` → illegal
- `insertAfterStage` with `timing: 'after'` → illegal
- `replaceRemainingStages: true` with `timing: 'before'` → illegal
- `replaceRemainingStages: true` with `timing: 'after'` → illegal
- `timing: 'during'` with no matched pipeline → illegal
- Valid combinations continue working

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify)

## Out of Scope

- Compile-time validation in the compiler (compound constraints are assembled from GameSpecDoc data; compiler-level validation is separate)
- `insertAfterStage` bounds checking (ensuring it's < stage count) — related but distinct

## Acceptance Criteria

### Tests That Must Pass

1. `replaceRemainingStages: true` with `timing: 'before'` throws `IllegalMoveError`
2. `replaceRemainingStages: true` with `timing: 'after'` throws `IllegalMoveError`
3. `insertAfterStage` with `timing: 'before'` throws `IllegalMoveError`
4. `insertAfterStage` with `timing: 'after'` throws `IllegalMoveError`
5. `timing: 'during'` without staged pipeline throws `IllegalMoveError`
6. Valid `timing: 'during'` with staged pipeline and flags continues working
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `replaceRemainingStages` and `insertAfterStage` are only meaningful when `timing === 'during'`
2. `timing === 'during'` requires a matched staged execution pipeline
3. Misconfigured compound moves fail fast with descriptive errors rather than silently ignoring fields

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — New/extended describe block for compound timing validation
2. `packages/engine/test/unit/kernel/runtime-reasons.test.ts` — Update stable taxonomy expectations for new reason constant

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js" "packages/engine/dist/test/unit/kernel/runtime-reasons.test.js"`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Added shared compound timing configuration validation in `apply-move.ts` and enforced it in both move validation and move execution paths.
  - Added a new canonical reason: `ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID`.
  - Added kernel unit tests for invalid compound timing/flag combinations, including `timing: 'during'` without a staged pipeline.
  - Updated runtime-reason taxonomy test expectations for the new reason constant.
- **Deviations from original plan**:
  - Included `timing: 'during'` without matched staged pipeline in enforcement scope (not just `insertAfterStage`/`replaceRemainingStages` with non-`during` timings), because current architecture treated it as a silent no-op.
  - Updated `runtime-reasons.test.ts` in addition to originally listed files to preserve stable reason-taxonomy contracts.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `node --test "packages/engine/dist/test/unit/kernel/apply-move.test.js" "packages/engine/dist/test/unit/kernel/runtime-reasons.test.js"` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (297 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅

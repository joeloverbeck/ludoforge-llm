# 64MCTSPEROPT-014: CI Workflow Preset-to-Profile Migration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — CI/workflow changes only
**Deps**: 64MCTSPEROPT-009

## Problem

Six CI workflows reference old preset names (`fast`, `default`, `strong`). After budget profiles replace presets (ticket 009), these workflows must update their preset references to use the new profile names. The spec (section 7) explicitly lists these as files to change.

## Assumption Reassessment (2026-03-17)

1. Six MCTS CI workflows exist — **confirmed**:
   - `engine-mcts-fitl-fast.yml`, `engine-mcts-fitl-default.yml`, `engine-mcts-fitl-strong.yml`
   - `engine-mcts-e2e-fast.yml`, `engine-mcts-e2e-default.yml`, `engine-mcts-e2e-strong.yml`
2. These workflows pass preset names to test scripts — need to verify exact mechanism.
3. Test files (`fitl-mcts-fast.test.ts`, etc.) reference presets — may need parallel updates.

## Architecture Check

1. Mapping: `fast` → `interactive`, `default` → `turn`, `strong` → `background` or `analysis`.
2. Workflow changes are mechanical — no logic changes.
3. Test files may need config updates to match new profile resolution.

## What to Change

### 1. Update FITL MCTS workflows

- `engine-mcts-fitl-fast.yml` → use `interactive` profile
- `engine-mcts-fitl-default.yml` → use `turn` profile
- `engine-mcts-fitl-strong.yml` → use `background` profile

### 2. Update generic MCTS e2e workflows

- `engine-mcts-e2e-fast.yml` → use `interactive` profile
- `engine-mcts-e2e-default.yml` → use `turn` profile
- `engine-mcts-e2e-strong.yml` → use `background` profile

### 3. Update test files if they reference preset names

If `fitl-mcts-fast.test.ts` et al. call `resolvePreset('fast')`, update to `resolveBudgetProfile('interactive')`.

## Files to Touch

- `.github/workflows/engine-mcts-fitl-fast.yml` (modify)
- `.github/workflows/engine-mcts-fitl-default.yml` (modify)
- `.github/workflows/engine-mcts-fitl-strong.yml` (modify)
- `.github/workflows/engine-mcts-e2e-fast.yml` (modify)
- `.github/workflows/engine-mcts-e2e-default.yml` (modify)
- `.github/workflows/engine-mcts-e2e-strong.yml` (modify)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts` (modify — if it references preset names)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-default.test.ts` (modify — if it references preset names)
- `packages/engine/test/e2e/mcts-fitl/fitl-mcts-strong.test.ts` (modify — if it references preset names)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-fast.test.ts` (modify — if it references preset names)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-default.test.ts` (modify — if it references preset names)
- `packages/engine/test/e2e/mcts/texas-holdem-mcts-strong.test.ts` (modify — if it references preset names)

## Out of Scope

- Changing profile configs or behaviors (ticket 64MCTSPEROPT-009)
- Adding new workflows
- Modifying test logic beyond preset name references
- Parallel search workflows

## Acceptance Criteria

### Tests That Must Pass

1. All six CI workflows reference valid budget profile names (no references to `fast`/`default`/`strong` as preset names).
2. All MCTS e2e tests pass with updated profile references.
3. `pnpm -F @ludoforge/engine test:e2e` passes.
4. `pnpm turbo typecheck` passes.

### Invariants

1. CI workflows still test the same scenarios — only the profile resolution changes.
2. No test logic changes beyond config/preset references.
3. No new workflows created or old ones deleted.

## Test Plan

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. `pnpm turbo typecheck`

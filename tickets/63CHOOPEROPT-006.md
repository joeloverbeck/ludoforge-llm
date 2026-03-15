# 63CHOOPEROPT-006: Stochastic and ambiguous probe classification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — choose-n-option-resolution.ts, legal-choices.ts
**Deps**: 63CHOOPEROPT-001, 63CHOOPEROPT-003

## Problem

When a chooseN probe crosses a stochastic decision boundary or an ambiguous authority surface, the engine must NOT mark the option `legal` or `illegal`. It must return `unknown` with the appropriate `resolution` value (`stochastic` or `ambiguous`).

## Assumption Reassessment (2026-03-15)

1. `classifyProbeOutcomeLegality` already handles `pendingStochastic` by classifying it as `unknown`. Confirmed via codebase context report.
2. `freeOperationAmbiguousOverlap` handling exists in `legalChoicesWithPreparedContextStrict` (lines 832-866). This is a known complexity surface.
3. The spec (4.8) requires these two resolution categories be explicitly distinguished from `provisional` (budget-exhausted).

## Architecture Check

1. This extends the singleton probe classification (003) and witness search classification (004) with two additional resolution categories.
2. No new algorithm — just richer classification of existing probe outcomes.
3. No game-specific logic.

## What to Change

### 1. Extend `ProbeSummary` in `choose-n-option-resolution.ts`

Add explicit stochastic and ambiguous outcome categories to the probe summary type:
- `stochastic: true` when probe encounters `pendingStochastic`
- `ambiguous: true` when probe encounters authority mismatch or overlap surface

### 2. Update singleton probe classification

In `runSingletonProbePass()`:
- Stochastic probe → `unknown`, `resolution: 'stochastic'`
- Ambiguous probe → `unknown`, `resolution: 'ambiguous'`
- These options are NOT passed to witness search (no point searching through stochastic boundaries)

### 3. Update witness search boundary handling

In `runWitnessSearch()`:
- If a witness search node encounters a stochastic/ambiguous probe, stop descending that branch
- If ALL branches for an option are stochastic/ambiguous → `unknown`, `resolution: 'stochastic'` or `'ambiguous'`

### 4. Add test fixtures

Per spec 11.4, create chooseN probe fixtures that return `pendingStochastic` and ambiguous overlap.

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify — if probe classification helper needs updates)

## Out of Scope

- Changing how `pendingStochastic` is produced by the kernel
- Changing `freeOperationAmbiguousOverlap` logic
- Worker-local session (Phase B)
- UI display of stochastic/ambiguous (63CHOOPEROPT-011)

## Acceptance Criteria

### Tests That Must Pass

1. New test: chooseN with stochastic probe outcome → option is `unknown`, `resolution: 'stochastic'`
2. New test: chooseN with ambiguous authority surface → option is `unknown`, `resolution: 'ambiguous'`
3. New test: stochastic/ambiguous options are NOT fed into witness search
4. New test: option that is stochastic on one branch but has a deterministic witness on another → `legal` if witness found (stochastic branch is just skipped, not conclusive)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Stochastic/ambiguous options are NEVER marked `legal` or `illegal`.
2. `resolution: 'stochastic'` and `resolution: 'ambiguous'` are distinct from `resolution: 'provisional'` (budget-exhausted).
3. No change to how `pendingStochastic` or ambiguous overlap is produced upstream.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-stochastic-ambiguous.test.ts` — stochastic and ambiguous probe classification
2. Modify `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — integration with singleton and witness paths

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

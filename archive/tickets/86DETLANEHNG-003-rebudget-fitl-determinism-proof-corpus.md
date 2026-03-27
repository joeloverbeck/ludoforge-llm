# 86DETLANEHNG-003: Rebudget FITL determinism proof corpus

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — determinism test corpus only
**Deps**: `docs/FOUNDATIONS.md`, `tickets/README.md`, `archive/tickets/86DETLANEHNG-001-harden-determinism-lane-runner.md`, `archive/tickets/86DETLANEHNG-002-fix-determinism-lane-stall-root-cause.md`

## Problem

The determinism lane now runs substantially faster than before, but FITL still dominates wall time. The current FITL proof corpus spends too much runtime on overlapping broad random-play trajectories relative to the unique determinism signal they add.

The fix must preserve proof quality while making the FITL proof budget more intentional. The lane should keep three distinct proof roles:
- replay determinism
- exact incremental-hash parity
- broad drift detection

But each role should carry only the FITL trajectory volume needed for that role.

## Assumption Reassessment (2026-03-27)

1. The current FITL determinism budget is still much larger than the Texas budget and dominates lane wall time.
2. The biggest remaining FITL cost centers are the four `zobrist-incremental-property-fitl-*` shards plus the replay-parity FITL seeds in `draft-state-determinism-parity.test.ts`.
3. The FITL broad property sweep currently uses 35 seeds at 150 turns, while replay parity uses 4 FITL seeds at 200 turns and exact parity uses 3 FITL seeds at 200 turns.
4. Existing default/integration determinism coverage already exercises smaller seeded determinism invariants, so the dedicated determinism lane should optimize for unique production-scale proof responsibility rather than contiguous-seed brute force.
5. Any redesign must respect Foundations 6, 10, and 11: bounded proof units, explicit invariant ownership, and no weakening of determinism semantics.

## Architecture Check

1. The clean architecture is a FITL proof corpus with explicit budget classes:
long curated replay seeds, curated exact-parity seeds, and shorter/medium diverse drift-detection seeds.
2. Replacing contiguous FITL seed ranges with curated seed classes is cleaner than preserving brute-force ranges because it makes the proof design intentional and reviewable.
3. No backwards-compatibility shims, runner exceptions, or game-specific kernel behavior are introduced. This is a test-corpus rebudgeting change only.

## What to Change

### 1. Reduce FITL replay and exact-parity budgets

- Reduce FITL replay parity in `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` from four curated long seeds to three curated long seeds.
- Reduce FITL exact incremental parity in `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` from three seeds to two curated seeds.
- Keep turn budgets for these long/exact proof roles unchanged.

### 2. Replace the broad FITL drift sweep with two curated budget classes

- Remove the current four FITL broad property files:
  - `zobrist-incremental-property-fitl-diverse-seeds`
  - `zobrist-incremental-property-fitl-seeds-01-08`
  - `zobrist-incremental-property-fitl-seeds-09-16`
  - `zobrist-incremental-property-fitl-seeds-17-25`
- Replace them with:
  - one short diverse FITL drift file
  - one medium diverse FITL drift file
- Keep interval verification for the broad sweep, but reduce total FITL trajectories and make seed sets explicit in shared helpers/comments.

### 3. Keep lane contract tests aligned

- Update determinism lane policy expectations so the new FITL property files are the explicit determinism members.
- Keep the runner tests unchanged unless the redesign changes lane ownership assumptions.

## Files to Touch

- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (modify)
- `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` (modify)
- `packages/engine/test/determinism/zobrist-incremental-property-fitl-*.test.ts` (replace)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify)
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modify)

## Out of Scope

- Changing the determinism runner behavior from `86DETLANEHNG-001`
- Weakening determinism assertions or downgrading hash drift failures
- Runtime/kernel performance work outside the determinism proof corpus
- Texas proof-budget redesign beyond keeping its current role intact

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:determinism` completes successfully with lower wall time than the current post-`86DETLANEHNG-002` corpus.
2. FITL replay determinism is still represented by curated long runs.
3. FITL exact incremental-hash parity is still represented by curated full-verification seeds.
4. FITL broad drift detection is still represented by interval-verified diverse trajectories.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Determinism coverage is preserved, but FITL proof volume is less redundant and more intentional.
2. Each FITL determinism file has a single clear proof role and bounded budget.
3. No compatibility aliases, runner carve-outs, or game-specific engine behavior are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` — reduce FITL replay seeds to a smaller curated long-run set
2. `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` — reduce FITL exact-parity seeds to a smaller curated set
3. `packages/engine/test/determinism/zobrist-incremental-property-fitl-*.test.ts` — replace the four current FITL broad-sweep files with two curated budget classes
4. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` — keep lane membership expectations aligned with the new FITL file set

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/determinism/draft-state-determinism-parity.test.js`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`
6. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-27

What actually changed:
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` now uses 3 curated FITL replay seeds in normal mode instead of 4, while keeping the long-run replay role intact.
- `packages/engine/test/determinism/zobrist-incremental-parity.test.ts` now uses 2 curated FITL exact-parity seeds instead of 3.
- Replaced four FITL broad-sweep files with two clearer budget classes:
  - `packages/engine/test/determinism/zobrist-incremental-property-fitl-short-diverse.test.ts`
  - `packages/engine/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.ts`
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` now defines explicit short/medium FITL trajectory budgets and curated diverse seed sets for the broad drift sweep.
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` was updated so determinism-lane membership matches the redesigned FITL file set.

Deviations from original plan:
- No additional helper-level unit test was needed because the redesign stayed within existing test-file ownership and lane-policy coverage already enforces the lane contract.

Verification results:
- `pnpm -F @ludoforge/engine build` passed.
- `node --test packages/engine/dist/test/unit/run-tests-script.test.js` passed.
- `node --test packages/engine/dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js` passed.
- `pnpm -F @ludoforge/engine test:determinism` passed. Observed file durations were approximately `6m 6s`, `1m 37s`, `3m 3s`, `2m 42s`, and `4s`.
- Compared with the prior post-`86DETLANEHNG-002` lane timings (`7m 34s`, `2m 58s`, `7m 1s`, `6m 20s`, `4m 36s`, `6m 19s`, `8s`), total wall time dropped from about `34m 56s` to about `13m 32s`.
- `pnpm turbo typecheck` passed.
- `pnpm turbo lint` passed.
- `pnpm turbo test` passed.

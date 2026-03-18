# 67AIRETIRE-003: Remove MCTS CI workflows, e2e lanes, and diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine package scripts, test-lane manifest, e2e suites, lint policy tests
**Deps**: `67AIRETIRE-001`, `67AIRETIRE-002`

## Problem

The repository still dedicates workflows, package scripts, lane taxonomy, environment flags, and e2e suites to MCTS-specific coverage. Once the engine and runner stop supporting MCTS, the CI surface must stop advertising or executing those removed paths.

## Assumption Reassessment (2026-03-18)

1. Six dedicated workflows still exist under `.github/workflows/engine-mcts-*.yml` and each runs a `pnpm -F @ludoforge/engine test:e2e:mcts*` command.
2. `packages/engine/package.json`, `packages/engine/scripts/test-lane-manifest.mjs`, and `packages/engine/scripts/run-tests.mjs` still define `e2e:mcts` and `e2e:mcts:fitl:*` lanes.
3. Engine lint-policy tests still enforce MCTS-specific workflow path and lane taxonomy expectations, and engine e2e directories `packages/engine/test/e2e/mcts/**` and `packages/engine/test/e2e/mcts-fitl/**` are still present.

## Architecture Check

1. CI should reflect live supported product surface. Deleting MCTS lanes is cleaner than leaving dormant workflows or no-op package scripts.
2. This change removes repo operations tied to a retired generic search agent without introducing game-specific CI special cases.
3. No compatibility env vars such as `RUN_MCTS_E2E` or placeholder empty lane definitions should remain.

## What to Change

### 1. Delete MCTS-dedicated workflows and test lanes

Remove the six dedicated workflow files, any trigger references from broader workflows, the MCTS package scripts, lane-manifest branches, and run-test dispatch entries.

### 2. Remove MCTS e2e suites and diagnostics contracts

Delete the MCTS and MCTS-FITL e2e suites, their helpers, and any diagnostics/reporting contracts that exist only for those lanes. Update workflow/lint policy tests and repo-level CI documentation to match the reduced lane model.

## Files to Touch

- `.github/workflows/engine-mcts-e2e-fast.yml` (delete)
- `.github/workflows/engine-mcts-e2e-default.yml` (delete)
- `.github/workflows/engine-mcts-e2e-strong.yml` (delete)
- `.github/workflows/engine-mcts-fitl-fast.yml` (delete)
- `.github/workflows/engine-mcts-fitl-default.yml` (delete)
- `.github/workflows/engine-mcts-fitl-strong.yml` (delete)
- `.github/workflows/ci.yml` (modify if it references removed workflows or lane contracts)
- `.github/workflows/engine-e2e-all.yml` (modify if it references removed lanes)
- `packages/engine/package.json` (modify)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify)
- `packages/engine/scripts/run-tests.mjs` (modify)
- `packages/engine/test/e2e/mcts/` (delete)
- `packages/engine/test/e2e/mcts-fitl/` (delete)
- `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` (modify)
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modify)
- `README.md` (modify)

## Out of Scope

- Engine production-source removal outside lane/CI wiring
- Runner seat/UI removal outside CI/test references
- Top-level spec and active-ticket cleanup

## Acceptance Criteria

### Tests That Must Pass

1. `.github/workflows/` contains no dedicated `engine-mcts-*` workflow files.
2. `packages/engine/package.json` contains no `test:e2e:mcts*` scripts and no `RUN_MCTS_*` env-gated commands.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Repo CI contracts mention only live supported test lanes.
2. No dead workflow-path policy or lane-taxonomy assertions remain for deleted MCTS suites.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` — rewrite lane assertions after MCTS removal.
2. `packages/engine/test/unit/lint/engine-special-suite-workflow-path-policy.test.ts` — remove MCTS workflow exceptions and validate remaining workflow policy.
3. `README.md` CI command examples — verify command references stay consistent with package scripts.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-03-18
- What actually changed:
  - Deleted all six dedicated `.github/workflows/engine-mcts-*.yml` workflow files.
  - Removed MCTS-specific engine package scripts, lane manifest branches, run-test dispatch entries, and the MCTS/MCTS-FITL e2e suites plus diagnostics helpers that existed only for those lanes.
  - Rewrote the engine lane taxonomy test to assert the surviving fast/slow/all e2e partition and updated workflow-path policy coverage to stop expecting removed MCTS workflow paths.
  - Updated `README.md` so CI and local e2e documentation references only live lane commands.
- Deviations from original plan:
  - No changes were required in `.github/workflows/ci.yml` or `.github/workflows/engine-e2e-all.yml` because they no longer referenced the retired MCTS lane contracts.
  - The resulting lane model is cleaner than the original proposal because `test:e2e` now explicitly means the fast lane while `test:e2e:all` aggregates fast plus slow coverage without any MCTS compatibility naming.
- Verification results:
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅

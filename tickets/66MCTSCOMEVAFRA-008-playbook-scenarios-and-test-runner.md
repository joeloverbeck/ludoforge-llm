# 66MCTSCOMEVAFRA-008: Playbook Scenarios S1–S10 + Test Runner + Test Lane

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-002, archive/tickets/66MCTSCOMEVAFRA/66MCTSCOMEVAFRA-002b-cross-faction-strategic-evaluators.md, 66MCTSCOMEVAFRA-003, 66MCTSCOMEVAFRA-004, 66MCTSCOMEVAFRA-005, 66MCTSCOMEVAFRA-006, 66MCTSCOMEVAFRA-007

## Problem

The evaluator framework from tickets 002–007 exists, but it is not yet wired into an end-to-end competence runner. The initial 10 playbook scenarios (S1–S10) should reuse the existing replay infrastructure and the existing `CATEGORY_SCENARIOS`/`VICTORY_SCENARIO` decision points, but be expressed as a pure competence scenario catalog with richer evaluator composition. A dedicated lane is still needed so the real competence runner can be executed independently from the broader FITL MCTS e2e bucket.

## Assumption Reassessment (2026-03-18)

1. `CATEGORY_SCENARIOS` (S1–S9) and `VICTORY_SCENARIO` (S10) already define the underlying playbook decision points in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts`. This ticket should build on those canonical positions, not duplicate them.
2. `replayToDecisionPoint`, `createPlaybookBaseState`, `runFitlMctsSearch`, and `runFitlMctsTimedSearch` already exist in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts`.
3. `engineerScenarioState` already exists in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts`; the scenario type in `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` already has an optional `engineeredState` hook. Ticket 008 should not recreate either abstraction.
4. The evaluator framework already exists in `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`, and there is already evaluator-focused coverage in `fitl-competence-evaluators.test.ts` plus framework/helper coverage in `fitl-competence-types.test.ts`.
5. `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` currently defines the `CompetenceScenario` type only; it does not yet export `COMPETENCE_SCENARIOS`.
6. `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` does not exist yet.
7. The lane infrastructure already exists in `packages/engine/scripts/test-lane-manifest.mjs` and `packages/engine/scripts/run-tests.mjs`, but there is no dedicated `e2e:mcts:fitl:competence` lane or package script yet.
8. The existing `e2e:mcts:fitl` lane is intentionally broad and includes every FITL MCTS e2e file under `test/e2e/mcts-fitl/`; the dedicated competence lane must therefore filter the exact competence runner file rather than rely on directory membership.
9. `RUN_MCTS_FITL_E2E` already gates FITL MCTS e2e suites.
10. At these FITL pending-decision positions, the MCTS search currently returns the selected root action family rather than a fully resolved move payload. A generic e2e runner cannot safely `applyMove()` that result for most scenarios yet.

## Architecture Check

1. The clean architecture is to keep scenario intent in one pure-data catalog: `COMPETENCE_SCENARIOS` should describe the decision point and evaluator composition, while the runner remains generic. That is a better long-term shape than scattering scenario-specific logic across test files.
2. The e2e runner should use the timed FITL search helper so the lane enforces real wall-clock bounds instead of silently becoming an unbounded soak test.
3. Given current FITL MCTS throughput and unresolved move payloads at pending decision points, the dedicated competence lane should run the shared scenario catalog at `interactive` budget only and evaluate only pre-resolution-safe integration checks there. Layer 2/3 strategic semantics remain covered by evaluator/unit tests until pool/timing work and resolved move outputs make higher-budget e2e runs practical.
4. The new lane `e2e:mcts:fitl:competence` should match the exact runner filename only. That is cleaner than broad directory matching because the directory already contains profiler, timing, and helper-focused suites that serve different purposes.
5. Existing crash/sanity/timing suites remain additive and separate. This ticket should not fold those concerns into the new competence runner.

## What to Change

### 1. Define `COMPETENCE_SCENARIOS` for S1–S10 in `fitl-competence-scenarios.ts`

Each scenario should compose existing evaluators from the catalog and export one shared `COMPETENCE_SCENARIOS` array:

| Scenario | Faction | Evaluators (by layer) |
|----------|---------|----------------------|
| S1: T1 VC — Burning Bonze | VC | L1: `categoryCompetence(['event','rally','march','attack','terror','tax','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcRallyQuality`, `vcOppositionGrowth`, `vcBaseExpansion` |
| S2: T1 ARVN — post NVA pass | ARVN | L1: `categoryCompetence(['train','patrol','sweep','govern','transport','raid'])`, L2: `victoryProgress(computeArvnVictory, 50, 3)`, L3: `arvnTrainCubes`, `arvnGovern`, `arvnControlMaintain` |
| S3: T2 NVA — Trucks | NVA | L1: `categoryCompetence(['event','rally','march','terror','infiltrate'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaRallyTrailImprove`, `nvaControlGrowth` |
| S4: T3 VC — Green Berets | VC | L1: `categoryCompetence(['rally','terror','tax','march','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcRallyQuality`, `vcBaseExpansion`, `vcTaxEfficiency` |
| S5: T4 US — Gulf of Tonkin | US | L1: `categoryCompetence(['event','train','patrol','sweep','assault','advise','airLift','airStrike'])`, L2: `victoryProgress(computeUsVictory, 50, 3)`, L3: `usSupportGrowth` |
| S6: T4 NVA — post US event | NVA | L1: `categoryCompetence(['rally','march','terror','infiltrate'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaMarchSouthward`, `nvaControlGrowth` |
| S7: T5 VC — Brinks Hotel | VC | L1: `categoryCompetence(['event','terror','rally','tax','march','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcTerrorTarget`, `vcOppositionGrowth` |
| S8: T6 ARVN — Henry Cabot Lodge | ARVN | L1: `categoryCompetence(['event','train','patrol','sweep','assault','govern','transport','raid'])`, L2: `victoryProgress(computeArvnVictory, 50, 3)`, L3: `arvnSweepRaid`, `arvnControlMaintain` |
| S9: T7 NVA — Booby Traps | NVA | L1: `categoryCompetence(['attack','rally','ambushNva','bombard'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaAttackConditions`, `nvaControlGrowth` |
| S10: T8 US — coup pacification | US | L1: `categoryCompetence(['coupPacifyUS'])`, L2: `victoryProgress(computeUsVictory, 50, 3)`, L3: `usPacification`, `usSupportGrowth` |

Each scenario should currently run at `['interactive']` in the dedicated e2e competence lane. Higher-budget semantics stay exercised by evaluator/unit coverage until the FITL search budget profiles become fast enough for a practical CI lane.

### 2. Create `fitl-competence.test.ts` as the generic competence runner

- Gated by `RUN_MCTS_FITL_E2E=1`.
- Iterates `COMPETENCE_SCENARIOS`, and for each scenario budget:
  1. Replay to decision point (or use engineered state if present)
  2. Run timed MCTS search
  3. Build `CompetenceEvalContext`
  4. Run all evaluators that are applicable and safe at that budget (skip those below budget via `budgetRank`)
  5. Assert all applicable evaluators passed, with failures reported by evaluator name and explanation

### 3. Register a dedicated test lane `e2e:mcts:fitl:competence`

- Add an explicit filename predicate in `test-lane-manifest.mjs` for `fitl-competence.test.ts`.
- Add `'e2e:mcts:fitl:competence'` case to `listE2eTestsForLane`.
- Add `test:e2e:mcts:fitl:competence` script to `packages/engine/package.json`.
- Add or update lane-policy tests so the new lane stays exact and isolated.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (modify — add S1-S10 definitions)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` (new — test runner)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify — add competence lane)
- `packages/engine/scripts/run-tests.mjs` (modify — add competence lane entry)
- `packages/engine/package.json` (modify — add test:e2e:mcts:fitl:competence script)
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modify — enforce the new lane/script contract)
- `packages/engine/test/unit/scripts/mcts-lane-isolation.test.ts` or a sibling lane test (modify/add — enforce exact competence-lane isolation)

## Out of Scope

- Engineered scenarios S11–S15 (ticket 008b)
- New evaluator implementations (tickets 002–007 — already implemented)
- Production code changes
- Pool sizing tuning (62MCTSSEAVIS-019)
- Evaluation function changes
- Reworking existing crash/sanity/timing FITL MCTS suites beyond minimal lane-policy adjustments

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-competence.test.ts`: S1–S10 execute at `interactive`, and every evaluator that is applicable and pre-resolution-safe at that budget passes.
4. `pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence` — new lane runs the competence test file.
5. `pnpm turbo typecheck` — no type errors.
6. `pnpm turbo lint` — no lint errors.
7. `pnpm -F @ludoforge/engine test` — all existing tests still pass (competence tests only run with `RUN_MCTS_FITL_E2E=1`).

### Invariants

1. No production source code changes.
2. Existing FITL MCTS crash/sanity/timing suites keep their current responsibilities.
3. Scenarios are pure data — adding/removing a scenario requires no runner changes.
4. Budget-stratified: evaluators below budget are skipped, not failed.
5. Deterministic: same seed + same code = same results.
6. `COMPETENCE_SCENARIOS` is exported for use by ticket 008b.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` — 10 test cases (S1–S10 at interactive budget)
2. Lane-policy test update(s) — dedicated competence lane/script coverage

### Commands

1. `pnpm turbo build`
2. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`

# 66MCTSCOMEVAFRA-008: Playbook Scenarios S1–S10 + Test Runner + Test Lane

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-002, 66MCTSCOMEVAFRA-002b, 66MCTSCOMEVAFRA-003, 66MCTSCOMEVAFRA-004, 66MCTSCOMEVAFRA-005, 66MCTSCOMEVAFRA-006, 66MCTSCOMEVAFRA-007

## Problem

The evaluators from tickets 002–007 need to be composed into concrete scenarios and run by a test runner. The initial 10 playbook scenarios (S1–S10) reuse the existing REPLAY_TURNS infrastructure and the existing `CATEGORY_SCENARIOS` positions, but with much richer evaluator composition. A dedicated test lane is needed so competence tests can be run independently.

## Assumption Reassessment (2026-03-18)

1. `CATEGORY_SCENARIOS` (9 scenarios) + `VICTORY_SCENARIO` (S10) already define the 10 positions — confirmed in `fitl-mcts-test-helpers.ts:1068-1085`.
2. `replayToDecisionPoint` handles arbitrary (turnIndex, moveIndex) replay — confirmed at line 883.
3. `runFitlMctsSearch` runs search at a position with a given budget profile — confirmed at line 911.
4. `applyMove` is available from kernel exports — confirmed.
5. Test lanes defined in `test-lane-manifest.mjs` with `listE2eTestsForLane` — confirmed.
6. Existing lanes filter by file name pattern (e.g., `fitl-mcts-${profile}.test.ts`) — confirmed.
7. `RUN_MCTS_FITL_E2E` env gate already exists — confirmed at line 62.

## Architecture Check

1. Scenarios are pure data — arrays of `CompetenceScenario` objects composing evaluators from tickets 002–007.
2. Test runner is a generic loop: for each scenario, for each budget, replay → search → apply → evaluate → assert.
3. New test lane `e2e:mcts:fitl:competence` filters for the new test file name.
4. No changes to existing test files — competence tests are additive.

## What to Change

### 1. Define S1–S10 scenarios in `fitl-competence-scenarios.ts`

Each scenario composes evaluators from the catalog:

| Scenario | Faction | Evaluators (by layer) |
|----------|---------|----------------------|
| S1: T1 VC — Burning Bonze | VC | L1: `categoryCompetence(['event','rally','march','attack','terror','tax','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcRallyQuality`, `vcOppositionGrowth`, `vcBaseExpansion` |
| S2: T1 ARVN — post NVA pass | ARVN | L1: `categoryCompetence(['train','sweep','assault','event','govern'])`, L2: `victoryProgress(computeArvnVictory, 50, 3)`, L3: `arvnTrainCubes`, `arvnGovern`, `arvnControlMaintain` |
| S3: T2 NVA — Trucks | NVA | L1: `categoryCompetence(['rally','march','attack','event','infiltrate'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaRallyTrailImprove`, `nvaControlGrowth` |
| S4: T3 VC — Green Berets | VC | L1: `categoryCompetence(['rally','terror','tax','march','event','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcRallyQuality`, `vcBaseExpansion`, `vcTaxEfficiency` |
| S5: T4 US — Gulf of Tonkin | US | L1: `categoryCompetence(['event','sweep','assault','train','airStrike'])`, L2: `victoryProgress(computeUsVictory, 50, 3)`, L3: `usSupportGrowth` |
| S6: T4 NVA — post US event | NVA | L1: `categoryCompetence(['march','rally','attack','event','infiltrate'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaMarchSouthward`, `nvaControlGrowth` |
| S7: T5 VC — Brinks Hotel | VC | L1: `categoryCompetence(['event','terror','rally','tax','march','ambushVc'])`, L2: `victoryProgress(computeVcVictory, 35, 2)`, L3: `vcTerrorTarget`, `vcOppositionGrowth` |
| S8: T6 ARVN — Henry Cabot Lodge | ARVN | L1: `categoryCompetence(['sweep','assault','train','event','raid','govern'])`, L2: `victoryProgress(computeArvnVictory, 50, 3)`, L3: `arvnSweepRaid`, `arvnControlMaintain` |
| S9: T7 NVA — Booby Traps | NVA | L1: `categoryCompetence(['attack','march','rally','event','ambushNva'])`, L2: `victoryProgress(computeNvaVictory, 18, 2)`, L3: `nvaAttackConditions`, `nvaControlGrowth` |
| S10: T8 US — coup pacification | US | L1: `categoryCompetence(['coupSupportPhase','coupPacify','event'])`, L2: `victoryProgress(computeUsVictory, 50, 3)`, L3: `usPacification`, `usSupportGrowth` |

Each scenario runs at all three budgets: `['interactive', 'turn', 'background']`.

### 2. Create `fitl-competence.test.ts` — the test runner

- Gated by `RUN_MCTS_FITL_E2E=1`.
- Iterates `COMPETENCE_SCENARIOS`, for each budget, does:
  1. Replay to decision point (or use engineered state if present)
  2. Run MCTS search
  3. Apply chosen move
  4. Build `CompetenceEvalContext`
  5. Run all evaluators (skip those below budget via `budgetRank`)
  6. Assert all passed — report failures with evaluator name + explanation

### 3. Register test lane `e2e:mcts:fitl:competence`

- Add `isMctsFitlCompetenceTest` function to `test-lane-manifest.mjs` — matches `fitl-competence.test.ts`.
- Add `'e2e:mcts:fitl:competence'` case to `listE2eTestsForLane`.
- Add `test:e2e:mcts:fitl:competence` script to `packages/engine/package.json`.

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (modify — add S1-S10 definitions)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` (new — test runner)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify — add competence lane)
- `packages/engine/scripts/run-tests.mjs` (modify — add competence lane entry)
- `packages/engine/package.json` (modify — add test:e2e:mcts:fitl:competence script)

## Out of Scope

- Engineered scenarios S11–S15 (ticket 008b)
- New evaluator implementations (tickets 002–007 — assumed complete)
- Production code changes
- Pool sizing tuning (62MCTSSEAVIS-019)
- Evaluation function changes
- Modifying existing test files (`fitl-mcts-interactive.test.ts`, etc.)

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-competence.test.ts`: All S1–S10 scenarios pass at `interactive` budget (Layer 1 category checks only, since Layer 2/3 evaluators gate at `turn`/`background`).
2. `fitl-competence.test.ts`: S1–S10 at `turn` budget — Layer 1 + Layer 2 evaluators execute (Layer 2 may fail if search doesn't converge — document expected failures).
3. `fitl-competence.test.ts`: S1–S10 at `background` budget — all three layers execute (Layer 3 may fail pending pool optimization — document expected failures).
4. `pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence` — new lane runs the competence test file.
5. `pnpm turbo typecheck` — no type errors.
6. `pnpm turbo lint` — no lint errors.
7. `pnpm -F @ludoforge/engine test` — all existing tests still pass (competence tests only run with `RUN_MCTS_FITL_E2E=1`).

### Invariants

1. No production source code changes.
2. Existing test files (`fitl-mcts-interactive.test.ts`, etc.) are NOT modified.
3. Scenarios are pure data — adding/removing a scenario requires no runner changes.
4. Budget-stratified: evaluators below budget are skipped, not failed.
5. Deterministic: same seed + same code = same results.
6. `COMPETENCE_SCENARIOS` is exported for use by ticket 008b.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` — 30 test cases (10 scenarios x 3 budgets)

### Commands

1. `pnpm turbo build`
2. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm -F @ludoforge/engine test`

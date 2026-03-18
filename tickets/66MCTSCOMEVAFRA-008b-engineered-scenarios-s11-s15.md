# 66MCTSCOMEVAFRA-008b: Engineered Scenarios S11–S15

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001, 66MCTSCOMEVAFRA-008

## Problem

The playbook scenarios (S1–S10) only test positions reachable via normal game replay. Five additional scenarios should extend the same competence runner with engineered pressure and edge-case situations: near-win VC, resource-starved NVA, defensive US, pre-Coup ARVN, and late-game NVA blitz. The state-engineering helper already exists; the remaining work is to encode these scenarios cleanly in the shared scenario catalog and strengthen helper coverage around the exact override patterns these scenarios depend on.

## Assumption Reassessment (2026-03-18)

1. `engineerScenarioState` already exists in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts`; it already supports `globalVars`, `perPlayerVars`, `zoneVars`, `zones`, `markers`, and `globalMarkers`.
2. `createPlaybookBaseState` already produces the canonical playbook starting state for both replay-driven and engineered scenarios.
3. The `CompetenceScenario` type in `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` already has an optional `engineeredState` hook.
4. Ticket 008 is responsible for the generic competence runner; this ticket should only extend the shared scenario catalog and add helper/test coverage needed by S11–S15.
5. Victory helper functions already exist for all four FITL factions in `fitl-mcts-test-helpers.ts`.
6. There is already one framework/helper immutability test in `fitl-competence-types.test.ts`; this ticket should add narrower override-shape coverage for the engineered scenario patterns instead of duplicating generic immutability assertions.

## Architecture Check

1. Engineered states should remain pure state-builders layered on top of the canonical playbook base state. No production kernel branching and no scenario-specific logic in the runner.
2. Each engineered scenario should own only the minimal override builder needed to express its position. That is cleaner and more extensible than baking ad hoc engineering branches into shared helpers.
3. The runner should stay unchanged once ticket 008 lands; this ticket should be scenario-data growth plus focused tests. In practice these engineered scenarios will initially participate in the timed `interactive` e2e lane only, with deeper strategic semantics covered by evaluator/unit tests until FITL search throughput improves and MCTS emits fully resolved moves for pending FITL decisions.
4. S11–S15 should be appended to the shared `COMPETENCE_SCENARIOS` export so the runner remains the single execution path.

## What to Change

### 1. S11: Near-win VC

- **State**: Opposition=33, VC bases=1, scattered guerrillas across map.
- **Expected**: VC should Terror aggressively in high-pop Support spaces to cross threshold 35. Should NOT rally/march (too slow).
- **Evaluators**: `categoryCompetence(['terror','event'])`, `victoryProgress(computeVcVictory, 35, 0)`, `vcTerrorTarget`, `vcOppositionGrowth`.
- **Engineering**: Override `globalVars` for opposition-related markers. Place VC guerrillas in support spaces. Set VC resources adequate for terror.

### 2. S12: NVA resource-starved

- **State**: NVA resources=0, Trail at 2, 15 troops on map.
- **Expected**: NVA should Pass (gain resource). Any operation at 0 resources is wasteful.
- **Evaluators**: `categoryCompetence(['pass'])`, `resourceDiscipline`.
- **Engineering**: Set `nvaResources=0`, `trail=2`. Place 15 NVA troops across map zones.

### 3. S13: US defensive

- **State**: Support at 48, Available=3, NVA massing in 2-pop provinces.
- **Expected**: US should Sweep/Assault to protect Support spaces, not Train. Defensive posture near victory.
- **Evaluators**: `categoryCompetence(['sweep','assault','airStrike'])`, `victoryDefense(computeUsVictory, computeNvaVictory, 50, 18, 2)`, `usSweepActivation`, `usAssaultRemoval`, `usForcePreservation`.
- **Engineering**: Set support markers to achieve score ~48. Place US pieces to have 3 available. Mass NVA troops in 2-pop provinces.

### 4. S14: ARVN pre-Coup

- **State**: Playbook Turn 7 + advance to monsoon card.
- **Expected**: ARVN should Train (place cubes for Redeploy) or Govern (build Patronage before Coup scoring). No Sweep (monsoon constraint).
- **Evaluators**: `categoryCompetence(['train','govern','event','pass'])`, `monsoonAwareness`, `arvnTrainCubes`, `arvnGovern`, `arvnControlMaintain`.
- **Engineering**: Replay to Turn 7 state, then advance to the card immediately before Coup.

### 5. S15: NVA late-game blitz

- **State**: Trail at 4, 25+ NVA troops available, 10+ guerrillas on map.
- **Expected**: NVA should March into SVN population centers for Control. Trail at 4 = free march in Laos/Cambodia.
- **Evaluators**: `categoryCompetence(['march','rally','attack'])`, `victoryProgress(computeNvaVictory, 18, 1)`, `nvaMarchSouthward`, `nvaControlGrowth`.
- **Engineering**: Set `trail=4`. Place 25+ NVA troops in available zone. Place 10+ guerrillas across map.

### 6. Focused tests for `engineerScenarioState` override shapes used by S11–S15

| Test | Description |
|------|-------------|
| globalVar-override | Override `nvaResources=0` → state has 0 NVA resources |
| zone-token-override | Replace a target zone token stack → engineered state reflects exact stack |
| marker-override | Set support/opposition marker → marker reflects override |
| global-marker-override | Set a global marker used by engineered scenarios → override is reflected without mutating base state |
| combined-overrides | Multiple override branches apply together → all reflected and base state stays unchanged |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (modify — add S11-S15)
- `packages/engine/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.ts` (new — focused helper tests for S11-S15 override patterns)

## Out of Scope

- Additional scenarios beyond S11–S15 (future work)
- Production code changes
- Pool sizing tuning (62MCTSSEAVIS-019)
- Evaluation function changes
- Test runner modifications beyond what ticket 008 requires

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-engineer-scenario-state.test.ts`: All focused helper tests for the override shapes used by S11–S15 pass.
2. `fitl-competence.test.ts`: S11–S15 execute through the shared competence runner at `interactive` budget and all applicable pre-resolution-safe evaluators at that budget pass.
4. `pnpm turbo typecheck` — no type errors.
5. `pnpm turbo lint` — no lint errors.
6. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. `engineerScenarioState` never mutates the input state — returns a new state object and preserves untouched branches by reference where possible.
3. Engineered states produce valid game states that the kernel accepts (legal moves can be enumerated).
4. S12 (resource-starved NVA) must have exactly 0 NVA resources — not "low."
5. S13 (defensive US) must have support score ≥ 46 and ≤ 49 — close enough to victory to trigger defensive behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.ts` — focused helper tests for engineered override shapes
2. `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` — 5 additional interactive-budget test cases

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.js`
2. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

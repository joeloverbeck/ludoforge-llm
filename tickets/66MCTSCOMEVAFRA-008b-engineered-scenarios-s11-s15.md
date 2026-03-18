# 66MCTSCOMEVAFRA-008b: Engineered Scenarios S11–S15

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001, 66MCTSCOMEVAFRA-008

## Problem

The playbook scenarios (S1–S10) only test positions reachable via normal game replay. Five additional scenarios need engineered game states to test pressure/edge-case situations that can't occur naturally in the first 8 turns: near-win VC, resource-starved NVA, defensive US, pre-Coup ARVN, and late-game NVA blitz. These scenarios use the `engineerScenarioState` helper from ticket 001.

## Assumption Reassessment (2026-03-18)

1. `engineerScenarioState` modifies `globalVars`, `perPlayerVars`, zone tokens, and markers — defined in ticket 001.
2. `createPlaybookBaseState` produces a valid initial state for engineering — confirmed at line 837.
3. The `CompetenceScenario` type has an optional `engineeredState` field — defined in ticket 001.
4. The test runner in ticket 008 handles `engineeredState` by calling it instead of `replayToDecisionPoint`.
5. Victory compute functions exist for all factions — confirmed.

## Architecture Check

1. Engineered states are created by modifying the base playbook state — no kernel mutation.
2. Each scenario specifies exact overrides (globalVars, zone tokens) to create the desired game position.
3. The test runner needs zero changes — `engineeredState` field already handled by ticket 008's runner.
4. Scenarios are additive — just append to `COMPETENCE_SCENARIOS`.

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

### 6. Integration tests for `engineerScenarioState`

| Test | Description |
|------|-------------|
| globalVar-override | Override `nvaResources=0` → state has 0 NVA resources |
| zone-token-override | Place 15 NVA troops in specific zone → zone has 15 troops |
| marker-override | Set support/opposition marker → marker reflects override |
| immutability | Base state unchanged after engineering |
| combined-overrides | Multiple overrides applied together → all reflected |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-scenarios.ts` (modify — add S11-S15)
- `packages/engine/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.ts` (new — 5 unit tests for helper)

## Out of Scope

- Additional scenarios beyond S11–S15 (future work)
- Production code changes
- Pool sizing tuning (62MCTSSEAVIS-019)
- Evaluation function changes
- Test runner modifications (handled by ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-engineer-scenario-state.test.ts`: All 5 unit tests for `engineerScenarioState` pass.
2. `fitl-competence.test.ts`: S11–S15 at `interactive` budget — Layer 1 category checks pass.
3. `fitl-competence.test.ts`: S11–S15 at `turn`/`background` — execute without crashes (higher-layer evaluators may fail pending pool optimization — document expected state).
4. `pnpm turbo typecheck` — no type errors.
5. `pnpm turbo lint` — no lint errors.
6. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. `engineerScenarioState` never mutates the input state — returns new object.
3. Engineered states produce valid game states that the kernel accepts (legal moves can be enumerated).
4. S12 (resource-starved NVA) must have exactly 0 NVA resources — not "low."
5. S13 (defensive US) must have support score ≥ 46 and ≤ 49 — close enough to victory to trigger defensive behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.ts` — 5 unit tests
2. `packages/engine/test/e2e/mcts-fitl/fitl-competence.test.ts` — 15 additional test cases (5 scenarios x 3 budgets)

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-engineer-scenario-state.test.js`
2. `RUN_MCTS_FITL_E2E=1 pnpm -F @ludoforge/engine test:e2e:mcts:fitl:competence`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

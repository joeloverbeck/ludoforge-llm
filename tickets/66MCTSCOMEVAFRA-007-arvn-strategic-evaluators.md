# 66MCTSCOMEVAFRA-007: ARVN Strategic Evaluators (Layer 3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The ARVN faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.7. These evaluators check whether the MCTS agent follows sound ARVN strategy: training cubes in priority spaces, governing for patronage, maintaining COIN control, sweeping+raiding for guerrilla removal, patrolling sabotaged LoCs, and preserving aid levels.

## Assumption Reassessment (2026-03-18)

1. ARVN cubes are token type `'arvn-cubes'` or similar — need to verify in FITL GameDef.
2. ARVN Rangers are `'arvn-rangers'` or similar — need to verify.
3. Patronage is in `state.globalVars.patronage` — confirmed in `FITL_ARVN_FORMULA.varName`.
4. COIN control determined by `controlFn: 'coin'` in victory formula — confirmed.
5. Sabotage markers in `state.markers[zoneId]` — need to verify exact marker key.
6. Aid is a global var — need to verify exact var name.
7. Total Econ computed from LoC zone properties — need to verify.

## Architecture Check

1. All evaluators are pure functions of `CompetenceEvalContext`.
2. Each evaluator self-skips if the move type doesn't match.
3. Strategic knowledge from FITL rules 8.7, encoded in test code only.
4. All evaluators have `minBudget: 'background'`.

## What to Change

### 1. `arvnTrainCubes` — "Train to place ARVN cubes, Rangers in priority spaces" (8.7.1)

- Skips if move is not `train`.
- Checks: cubes/rangers placed in strategically important spaces (cities, high-pop provinces, spaces needing COIN control).
- Returns fail if cubes placed in low-priority spaces.

### 2. `arvnGovern` — "Govern to increase patronage or aid" (8.7.3)

- Skips if move is not `govern`.
- Checks: patronage increased after govern.
- Returns fail if govern didn't increase patronage (wasted action).

### 3. `arvnControlMaintain` — "ARVN victory = COIN-controlled population + patronage"

- Always evaluates (not move-type-gated).
- Checks: COIN control score maintained or improved.
- Uses `computeArvnVictory` before/after comparison.

### 4. `arvnSweepRaid` — "Sweep then raid to remove guerrillas and gain resources" (8.7)

- Skips if move is not `sweep` or `raid`.
- Checks: after sweep+raid, guerrillas were removed and/or resources gained.
- Compares guerrilla counts and ARVN resources before/after.

### 5. `arvnLocControl` — "Patrol/Sweep LoCs when Sabotage markers present and Resources >= 3" (8.7)

- Evaluates when sabotage markers exist on LoCs and ARVN resources >= 3.
- Checks: ARVN chose Patrol or Sweep targeting sabotaged LoCs.
- Returns fail if ARVN ignored sabotaged LoCs when capable of addressing them.

### 6. `arvnAidPreservation` — "Govern should not drain Aid below Total Econ" (6.2.3)

- Skips if move is not `govern`.
- Checks: after govern, Aid remains >= Total Econ.
- Rule: "US may only spend ARVN Resources exceeding Total Econ" — draining below blocks US.
- Returns fail if Aid dropped below Total Econ.

### 7. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| train-priority-space | `arvnTrainCubes` | Cubes in city → pass |
| train-low-priority | `arvnTrainCubes` | Cubes in empty 0-pop province → fail |
| train-skip-non-train | `arvnTrainCubes` | Move is `govern` → skip |
| govern-patronage-up | `arvnGovern` | Patronage increased → pass |
| govern-patronage-flat | `arvnGovern` | Patronage unchanged → fail |
| control-maintained | `arvnControlMaintain` | ARVN victory ≥ before → pass |
| control-dropped | `arvnControlMaintain` | ARVN victory < before → fail |
| sweep-raid-removed | `arvnSweepRaid` | Guerrillas removed + resources gained → pass |
| sweep-raid-nothing | `arvnSweepRaid` | No guerrillas removed → fail |
| loc-sabotage-addressed | `arvnLocControl` | Sabotaged LoC, ARVN swept it → pass |
| loc-sabotage-ignored | `arvnLocControl` | Sabotaged LoC, ARVN ignored → fail |
| aid-preserved | `arvnAidPreservation` | Aid ≥ Total Econ after govern → pass |
| aid-drained | `arvnAidPreservation` | Aid < Total Econ after govern → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` (modify — add 13 tests)

## Out of Scope

- VC, NVA, US evaluators (tickets 004–006)
- Production code changes
- Non-player AI flowchart implementation (Spec 30)
- Evaluation function / heuristic improvements
- Scenario composition (tickets 008, 008b)

## Acceptance Criteria

### Tests That Must Pass

1. All 13 unit tests listed above pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. All evaluators skip gracefully when move type doesn't match.
4. Strategic knowledge sourced from FITL Rules 8.7 — document section references in code comments.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` — 13 new test cases

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

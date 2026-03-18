# 66MCTSCOMEVAFRA-007: ARVN Strategic Evaluators (Layer 3)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The ARVN faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.7. These evaluators check whether the MCTS agent follows sound ARVN strategy: training cubes in priority spaces, governing for patronage, maintaining COIN control, sweeping+raiding for guerrilla removal, patrolling sabotaged LoCs, and preserving aid levels.

## Assumption Reassessment (2026-03-18)

Verified against current code and FITL data:

1. The competence framework already exists in `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`; this ticket is incremental ARVN coverage, not framework creation.
2. `computeArvnVictory()` already exists in `packages/engine/test/e2e/mcts-fitl/fitl-mcts-test-helpers.ts` and is backed by `FITL_ARVN_FORMULA = { type: 'controlledPopulationPlusGlobalVar', controlFn: 'coin', varName: 'patronage' }`.
3. ARVN "cube" pressure in the current test model is represented by ARVN `troops` and `police` tokens. Actual FITL piece ids include `arvn-troops`, `arvn-police`, and `arvn-rangers`, but evaluator tests operate on normalized token `type` plus `props.faction`.
4. `govern` and `raid` are authored as special activities that may appear as the root action or as the compound special activity of an operation-plus-special move; evaluators must inspect both shapes where relevant.
5. Sabotage is represented as a space marker in `state.markers[zoneId].sabotage` with state `'sabotage'`.
6. Aid and ARVN resources are global vars `aid` and `arvnResources`.
7. FITL already tracks `totalEcon` in `state.globalVars.totalEcon`. The evaluator should treat that as the primary authoritative value in test contexts, rather than duplicating the formula.
8. In the current authored FITL action profiles, `patrol` directly targets LoCs via `$targetLoCs`, while `sweep` targets provinces/cities via `$targetSpaces`. The LoC-response evaluator must follow that authored contract.

## Architecture Check

1. All evaluators are pure functions of `CompetenceEvalContext`.
2. Evaluators should follow the existing Layer 3 pattern already used for VC/NVA/US: small composable functions, move self-gating, and delta-based reasoning from `stateBefore`/`stateAfter`.
3. Strategic knowledge from FITL rules 8.7 remains encoded in test code only; no production branching or FITL-specific engine logic.
4. The implementation should prefer shared local helpers for ARVN token counting and sabotage/LoC targeting, and should consume existing authoritative state signals such as `state.globalVars.totalEcon` instead of recreating formula logic in the evaluator layer.
5. All ARVN Layer 3 evaluators should use `minBudget: 'background'`, matching the existing faction-specific strategic evaluators.

## What to Change

### 1. `arvnTrainCubes` — "Train to place ARVN cubes, Rangers in priority spaces" (8.7.1)

- Skips if move is not `train`.
- Treat ARVN troop/police growth as the core "cube" signal; ranger placement is a bonus signal if present.
- Checks that training improves ARVN presence in strategically important spaces (cities, higher-population provinces, or spaces where stronger COIN presence improves control posture).
- Returns fail if train improves only materially lower-value spaces while a stronger ARVN training target existed.

### 2. `arvnGovern` — "Govern to increase patronage or aid" (8.7.3)

- Evaluates when the move includes `govern` either as the root move or as the compound special activity.
- Checks for a meaningful Govern payoff: patronage gain and/or aid gain.
- Returns fail if Govern produced neither patronage nor aid improvement.

### 3. `arvnControlMaintain` — "ARVN victory = COIN-controlled population + patronage"

- Always evaluates (not move-type-gated).
- Uses the existing `computeArvnVictory()` helper.
- Checks that ARVN victory score is maintained or improved.
- Uses `computeArvnVictory` before/after comparison.

### 4. `arvnSweepRaid` — "Sweep then raid to remove guerrillas and gain resources" (8.7)

- Evaluates ARVN anti-insurgent payoff for `sweep`, `raid`, or a compound move that includes `raid`.
- Checks whether the authored line removed insurgent guerrillas and/or improved ARVN resources.
- Should not require both outcomes on every move; one meaningful payoff is sufficient.

### 5. `arvnLocControl` — "Patrol sabotaged LoCs when Sabotage markers present and Resources >= 3" (8.7, adapted to authored move shape)

- Evaluates when sabotage markers exist on LoCs and ARVN resources >= 3.
- Uses the authored move contract: `patrol` is the direct sabotaged-LoC response because it targets `$targetLoCs`.
- Checks whether ARVN chose `patrol` and targeted sabotaged LoCs.
- Returns fail only when a meaningful sabotaged-LoC response opportunity existed and the move ignored it.

### 6. `arvnAidPreservation` — "Govern should not drain Aid below Total Econ" (6.2.3)

- Evaluates when the move includes `govern`.
- Uses `stateAfter.globalVars.totalEcon` as the authoritative Total Econ value when present.
- Checks: after govern, `aid >= totalEcon`.
- Returns fail if Govern leaves Aid below Total Econ.

### 7. Unit tests — synthetic state deltas

Add the 13 core tests below, plus any focused move-shape regression tests needed to cover root-vs-compound ARVN special-activity handling.

| Test | Evaluator | Description |
|------|-----------|-------------|
| train-priority-space | `arvnTrainCubes` | ARVN presence grows in higher-priority city/province → pass |
| train-low-priority | `arvnTrainCubes` | Train improves only a weaker target while a stronger one exists → fail |
| train-skip-non-train | `arvnTrainCubes` | Move is not `train` → skip |
| govern-payoff | `arvnGovern` | Govern increases patronage or aid → pass |
| govern-wasted | `arvnGovern` | Govern increases neither patronage nor aid → fail |
| control-maintained | `arvnControlMaintain` | ARVN victory ≥ before → pass |
| control-dropped | `arvnControlMaintain` | ARVN victory < before → fail |
| sweep-raid-payoff | `arvnSweepRaid` | ARVN anti-insurgent line removes guerrillas or gains resources → pass |
| sweep-raid-nothing | `arvnSweepRaid` | Sweep/Raid produces no meaningful payoff → fail |
| loc-sabotage-addressed | `arvnLocControl` | Sabotaged LoC exists and ARVN patrols it → pass |
| loc-sabotage-ignored | `arvnLocControl` | Sabotaged LoC exists, ARVN can respond, but does not → fail |
| aid-preserved | `arvnAidPreservation` | Govern leaves Aid at or above Total Econ → pass |
| aid-drained | `arvnAidPreservation` | Govern leaves Aid below Total Econ → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add 13 tests)
- `tickets/66MCTSCOMEVAFRA-007-arvn-strategic-evaluators.md` (modify — corrected assumptions/scope before implementation)

## Out of Scope

- VC, NVA, US evaluators (tickets 004–006)
- Production code changes
- Non-player AI flowchart implementation (Spec 30)
- Evaluation function / heuristic improvements
- Scenario composition (tickets 008, 008b)

## Acceptance Criteria

### Tests That Must Pass

1. All 13 core unit tests listed above pass, plus any added move-shape regression tests.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. Move-shape handling must be consistent with current FITL authored move structure: root actions and compound special activities are both supported where needed.
4. Strategic knowledge sourced from FITL Rules 8.7 and FITL economic constraints — documented in evaluator comments only where the logic is not self-evident.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — 13 core ARVN test cases plus focused move-shape regressions if added

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added six ARVN Layer 3 evaluators in `fitl-competence-evaluators.ts`: `arvnTrainCubes`, `arvnGovern`, `arvnControlMaintain`, `arvnSweepRaid`, `arvnLocControl`, and `arvnAidPreservation`.
  - Added ARVN evaluator coverage in `fitl-competence-evaluators.test.ts`, including the 13 core cases plus move-shape regressions for compound `govern` and compound `raid`.
  - Corrected the ticket assumptions before implementation so the scope matched the current framework, authored FITL move shapes, and authoritative state fields.
- Deviations from original plan:
  - `arvnLocControl` was narrowed from "Patrol/Sweep LoCs" to patrol-driven sabotaged-LoC response because the authored `sweep` profile does not target LoCs.
  - `arvnAidPreservation` uses `state.globalVars.totalEcon` as the authoritative signal instead of recreating Total Econ logic in the evaluator layer.
  - Added move-shape regression tests beyond the original 13 core cases because root-vs-compound special-activity handling is an explicit invariant in the current architecture.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo build --filter=@ludoforge/engine && pnpm -F @ludoforge/engine test`

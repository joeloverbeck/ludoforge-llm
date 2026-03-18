# 66MCTSCOMEVAFRA-006: US Strategic Evaluators (Layer 3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The US faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.8. These evaluators check whether the MCTS agent follows sound US strategy: sweeping to activate guerrillas, assaulting high-value targets, growing support, degrading the trail, pacifying high-population spaces, and preserving forces.

## Assumption Reassessment (2026-03-18)

1. US troops are token type `'us-troops'` — confirmed in `FITL_US_FORMULA.countTokenTypes`.
2. US bases are `'us-bases'` — confirmed in `FITL_US_FORMULA.countTokenTypes`.
3. Guerrilla underground/active state tracked via token props — need to verify exact prop name.
4. Support markers in `state.markers[zoneId].supportOpposition` — confirmed.
5. Trail value in `state.globalVars` — need to verify exact var name.
6. Air Strike actionId — need to verify exact string.

## Architecture Check

1. All evaluators are pure functions of `CompetenceEvalContext`.
2. Each evaluator self-skips if the move type doesn't match.
3. Strategic knowledge from FITL rules 8.8, encoded in test code only.
4. All evaluators have `minBudget: 'background'`.

## What to Change

### 1. `usSweepActivation` — "Sweep to activate guerrillas, then assault" (8.8.1)

- Skips if move is not `sweep`.
- Checks: after sweep, previously underground guerrillas are now active.
- Compares guerrilla token props (underground → active) before/after.

### 2. `usAssaultRemoval` — "Assault where it removes control, bases, or 6+ enemy" (8.8.2)

- Skips if move is not `assault`.
- Checks: assault targeted high-value spaces (spaces where it removes enemy control, bases, or 6+ pieces).
- Returns fail if assault targeted low-value spaces.

### 3. `usSupportGrowth` — "US victory = support + available pieces"

- Always evaluates (not move-type-gated).
- Checks: support total increased or maintained.
- Uses `computeUsVictory` before/after comparison.

### 4. `usTrailDegradation` — "When Trail >= 3 and Air Strike available, include degradeTrail: yes" (8.8)

- Evaluates when Trail >= 3 and Air Strike was available.
- Checks: if Air Strike was chosen, it included trail degradation.
- Returns fail if Air Strike was used without trail degradation when trail was high.

### 5. `usPacification` — "Pacify in highest-population spaces at coup"

- Skips if move is not a coup-phase pacification.
- Checks: pacification targeted max-population spaces.
- Compares support marker changes in high-pop vs low-pop spaces.

### 6. `usForcePreservation` — "US should not lose more than 2 pieces per turn from voluntary operations"

- Always evaluates.
- Checks: US did not lose more than 2 pieces from voluntary operations (assault into strong positions).
- Compares US piece counts in available zone before/after.
- Returns fail if more than 2 US pieces were removed.

### 7. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| sweep-activates | `usSweepActivation` | Underground guerrillas now active → pass |
| sweep-no-activation | `usSweepActivation` | No guerrillas activated → fail |
| sweep-skip-non-sweep | `usSweepActivation` | Move is `assault` → skip |
| assault-high-value | `usAssaultRemoval` | Assault removed enemy base → pass |
| assault-low-value | `usAssaultRemoval` | Assault in empty space → fail |
| support-maintained | `usSupportGrowth` | US victory score ≥ before → pass |
| support-dropped | `usSupportGrowth` | US victory score < before → fail |
| trail-degraded | `usTrailDegradation` | Trail >=3, Air Strike with degrade → pass |
| trail-not-degraded | `usTrailDegradation` | Trail >=3, Air Strike without degrade → fail |
| pacify-high-pop | `usPacification` | Pacified 2-pop space → pass |
| pacify-low-pop | `usPacification` | Pacified 0-pop space when 2-pop available → fail |
| force-preserved | `usForcePreservation` | ≤2 US pieces lost → pass |
| force-wasted | `usForcePreservation` | >2 US pieces lost → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add 13 tests)

## Out of Scope

- VC, NVA, ARVN evaluators (tickets 004, 005, 007)
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
4. Strategic knowledge sourced from FITL Rules 8.8 — document section references in code comments.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — 13 new test cases

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

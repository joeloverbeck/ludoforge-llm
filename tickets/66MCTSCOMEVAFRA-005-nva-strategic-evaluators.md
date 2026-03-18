# 66MCTSCOMEVAFRA-005: NVA Strategic Evaluators (Layer 3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The NVA faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.6. These evaluators check whether the MCTS agent follows sound NVA strategy: attacking only when advantageous, marching southward toward population, improving the trail during rally, growing NVA control, infiltrating with purpose, and using Bombard when numerically dominant.

## Assumption Reassessment (2026-03-18)

1. NVA troops are token type `'nva-troops'` — need to verify in FITL GameDef.
2. NVA bases are `'nva-bases'` — confirmed in `FITL_NVA_FORMULA.basePieceTypes`.
3. Trail value is in `state.globalVars` (e.g., `trail`) — need to verify exact var name.
4. NVA resources in `state.globalVars.nvaResources` — need to verify.
5. Zone adjacency is available via `def.zones[].adjacentTo` — confirmed from kernel DSL docs.
6. Population is a zone property — need to verify exact path.

## Architecture Check

1. All evaluators are pure functions of `CompetenceEvalContext`.
2. Each evaluator self-skips if the move type doesn't match.
3. Strategic knowledge from FITL rules 8.6, encoded in test code only.
4. All evaluators have `minBudget: 'background'`.

## What to Change

### 1. `nvaAttackConditions` — "Attack when troops alone would add NVA control or remove a base or remove 4+ enemy" (8.6.2)

- Skips if move is not `attack`.
- Checks preconditions: NVA troops in the attack space would gain control, remove an enemy base, or remove 4+ enemy pieces.
- Returns fail if attack was launched without meeting these conditions.

### 2. `nvaMarchSouthward` — "March toward population centers in South Vietnam" (8.6.5)

- Skips if move is not `march`.
- Checks: after march, NVA troops are closer to SVN population centers (measured by adjacency hops or presence in higher-population zones).
- Returns fail if troops marched away from SVN population.

### 3. `nvaRallyTrailImprove` — "Rally + improve trail when trail <3 or available >20 troops" (8.6.4)

- Skips if move is not `rally`.
- Checks: if trail < 3 or available NVA troops > 20, trail should have been improved during rally.
- Returns fail if trail improvement was skipped when conditions warranted it.

### 4. `nvaControlGrowth` — "NVA victory = NVA-controlled population + NVA bases on map"

- Always evaluates (not move-type-gated).
- Checks: NVA control score increased or maintained.
- Uses `computeNvaVictory` before/after comparison.

### 5. `nvaInfiltrateValue` — "Infiltrate only if base or 4+ troops placed" (8.6.4)

- Skips if move is not `infiltrate`.
- Checks: infiltrate resulted in a base placement or 4+ troop placements.
- Returns fail if infiltrate was wasted on trivial placements.

### 6. `nvaBombardUsage` — "Bombard when >=3 NVA Troops in/adjacent to enemy-occupied space" (8.6)

- Evaluates when NVA has >=3 troops in a space AND >=3 NVA troops adjacent to a US/ARVN-occupied space.
- If conditions are met and Bombard was not chosen, returns fail.
- If conditions are not met, skips.

### 7. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| attack-gains-control | `nvaAttackConditions` | Attack where NVA gains control → pass |
| attack-no-gain | `nvaAttackConditions` | Attack where no control/base/4+ removal → fail |
| attack-skip-non-attack | `nvaAttackConditions` | Move is `rally` → skip |
| march-toward-svn | `nvaMarchSouthward` | Troops moved closer to SVN population → pass |
| march-away-from-svn | `nvaMarchSouthward` | Troops moved north/away → fail |
| rally-trail-improved | `nvaRallyTrailImprove` | Trail < 3, trail improved → pass |
| rally-trail-skipped | `nvaRallyTrailImprove` | Trail < 3, trail not improved → fail |
| control-maintained | `nvaControlGrowth` | NVA victory score ≥ before → pass |
| control-dropped | `nvaControlGrowth` | NVA victory score < before → fail |
| infiltrate-base-placed | `nvaInfiltrateValue` | Infiltrate placed a base → pass |
| infiltrate-trivial | `nvaInfiltrateValue` | Infiltrate placed 1 troop only → fail |
| bombard-used | `nvaBombardUsage` | >=3 troops adjacent to enemy, Bombard chosen → pass |
| bombard-missed | `nvaBombardUsage` | >=3 troops adjacent to enemy, Bombard not chosen → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` (modify — add 13 tests)

## Out of Scope

- VC, US, ARVN evaluators (tickets 004, 006, 007)
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
4. Strategic knowledge sourced from FITL Rules 8.6 — document section references in code comments.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/e2e-helpers/fitl-competence-evaluators.test.ts` — 13 new test cases

### Commands

1. `pnpm turbo build && node --test dist/test/unit/e2e-helpers/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

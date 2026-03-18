# 66MCTSCOMEVAFRA-005: NVA Strategic Evaluators (Layer 3)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The NVA faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.6. These evaluators check whether the MCTS agent follows sound NVA strategy: attacking only when advantageous, marching southward toward population, improving the trail during rally, growing NVA control, infiltrating with purpose, and using Bombard when numerically dominant.

## Assumption Reassessment (2026-03-18)

1. Runtime state does not use piece-type ids like `'nva-troops'` / `'nva-bases'` on tokens. In evaluator code and tests, token identity is `token.type === 'troops' | 'base' | 'guerrilla'` plus `token.props.faction === 'NVA' | 'VC' | 'US' | 'ARVN'`. The piece-type ids remain relevant for authored data and victory formulas only.
2. `trail` and `nvaResources` are real `state.globalVars` keys in FITL production data. Trail-improvement expectations must respect authored legality (`trail < 4`, `nvaResources >= 2`, and no blocking momentum such as McNamara Line).
3. Population and geography live on zone attributes. `population` and `country` are available via `def.zones[].attributes`, and adjacency is available via `def.zones[].adjacentTo`.
4. NVA availability is better inferred from zone contents such as `available-NVA:none`, not from a dedicated global counter.
5. NVA operation + special-activity decisions are modeled as compound moves in the current engine (`move.compound.specialActivity`). A ticket that only inspects flat `move.actionId` would miss real `march + infiltrate` and future `op + bombard` cases.
6. Bombard opportunity should follow authored legality, not an informal shorthand. The authored selector allows Bombard in a non-North-Vietnam target space with either 3+ COIN troops or any COIN base, plus either 3+ NVA troops in the target space or 3+ NVA troops in adjacent spaces.

## Architecture Check

1. All evaluators remain pure functions of `CompetenceEvalContext`; no production code changes are warranted.
2. Existing evaluator architecture already groups shared helpers and VC evaluators inside `fitl-competence-evaluators.ts`. The clean extension point is to add reusable move-inspection and geography helpers there, then layer NVA evaluators on top.
3. Evaluators should self-skip when their relevant primary action or compound special activity is absent.
4. Strategic knowledge still belongs in test code only, but the implementation must align with the current move model and authored FITL legality rather than prose approximations.
5. All NVA strategic evaluators in this ticket should remain `minBudget: 'background'`.

## What to Change

### 1. `nvaAttackConditions` — "Attack when troops alone would add NVA control or remove a base or remove 4+ enemy" (8.6.2)

- Skips unless the primary action is `attack`.
- Scores the authored target spaces, not arbitrary map deltas.
- Passes when the chosen attack produces at least one strategically meaningful outcome in a targeted space: NVA control gained, an enemy base removed, or enemy pieces reduced by 4 or more.
- Fails when the attack delta shows none of those outcomes.
- This evaluator is outcome-based because the current test context exposes before/after state deltas, not counterfactual search branches for "what else the attack could have done."

### 2. `nvaMarchSouthward` — "March toward population centers in South Vietnam" (8.6.5)

- Skips unless the primary action is `march`.
- Uses the authored adjacency graph plus zone `country` / `population` attributes to compare an aggregate proximity score from NVA troop locations to populated South Vietnam spaces.
- Passes when the march improves or preserves that strategic proximity, especially when troops enter South Vietnam from Laos/Cambodia/North Vietnam.
- Fails when the march clearly moves troop weight farther from populated South Vietnam objectives.

### 3. `nvaRallyTrailImprove` — "Rally + improve trail when trail <3 or available >20 troops" (8.6.4)

- Skips unless the primary action is `rally`.
- Uses `stateBefore.globalVars.trail`, `stateBefore.globalVars.nvaResources`, the McNamara Line marker, and NVA troop count in `available-NVA:none` to decide whether trail improvement was both strategically indicated and legally available.
- Passes when the rally raises `trail` under those conditions.
- Fails when trail improvement was warranted and legal but the move left `trail` unchanged.

### 4. `nvaControlGrowth` — "NVA victory = NVA-controlled population + NVA bases on map"

- Always evaluates (not move-type-gated).
- Checks: NVA control score increased or maintained.
- Uses `computeNvaVictory` before/after comparison.

### 5. `nvaInfiltrateValue` — "Infiltrate only if base or 4+ troops placed" (8.6.4)

- Skips unless the move includes `infiltrate`, either as the primary action or as `move.compound.specialActivity`.
- Passes when infiltrate creates a net NVA base gain or produces a substantial troop build-up (net NVA troop increase of 4 or more across its targeted spaces).
- Fails when infiltrate is present but the observable state delta is strategically trivial.

### 6. `nvaBombardUsage` — "Bombard when >=3 NVA Troops in/adjacent to enemy-occupied space" (8.6)

- Evaluates authored Bombard opportunities using the same observable ingredients as the production selector: a non-North-Vietnam target space with either 3+ COIN troops or a COIN base, plus either 3+ NVA troops in that space or 3+ adjacent NVA troops.
- Passes when Bombard is actually chosen in those circumstances, whether standalone or as a compound special activity.
- Fails when a high-value Bombard opportunity exists but the move does not include Bombard.
- Skips when no authored Bombard opportunity exists in the synthetic state.

### 7. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| attack-gains-control | `nvaAttackConditions` | Attack where a targeted space flips to NVA control → pass |
| attack-removes-base | `nvaAttackConditions` | Attack removes an enemy base in the target space → pass |
| attack-no-meaningful-outcome | `nvaAttackConditions` | Attack causes no control gain / base loss / 4+ removal → fail |
| attack-skip-non-attack | `nvaAttackConditions` | Primary move is not `attack` → skip |
| march-toward-svn | `nvaMarchSouthward` | Troops move from outside / farther away toward populated South Vietnam → pass |
| march-away-from-svn | `nvaMarchSouthward` | Troops move away from populated South Vietnam → fail |
| rally-trail-improved | `nvaRallyTrailImprove` | Trail improvement is warranted and performed → pass |
| rally-trail-skipped | `nvaRallyTrailImprove` | Trail improvement is warranted and legal but omitted → fail |
| rally-trail-skip-when-illegal | `nvaRallyTrailImprove` | Trail would be desirable but illegal or blocked → skip/pass |
| control-maintained | `nvaControlGrowth` | `computeNvaVictory` holds or improves → pass |
| control-dropped | `nvaControlGrowth` | `computeNvaVictory` regresses → fail |
| infiltrate-base-placed | `nvaInfiltrateValue` | Compound `march + infiltrate` adds an NVA base → pass |
| infiltrate-big-buildup | `nvaInfiltrateValue` | Infiltrate adds 4+ net NVA troops → pass |
| infiltrate-trivial | `nvaInfiltrateValue` | Infiltrate adds only a trivial amount of force → fail |
| bombard-used | `nvaBombardUsage` | Authored Bombard opportunity exists and the move includes Bombard → pass |
| bombard-missed | `nvaBombardUsage` | Authored Bombard opportunity exists but Bombard is not chosen → fail |
| bombard-skip-no-opportunity | `nvaBombardUsage` | No authored Bombard opportunity exists → skip/pass |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add NVA evaluator coverage and any small local test helpers needed for compound moves)

## Out of Scope

- VC, US, ARVN evaluators (tickets 004, 006, 007)
- Production code changes
- Non-player AI flowchart implementation (Spec 30)
- Evaluation function / heuristic improvements
- Scenario composition (tickets 008, 008b)

## Acceptance Criteria

### Tests That Must Pass

1. The NVA evaluator unit tests added in `fitl-competence-evaluators.test.ts` pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. All evaluators skip gracefully when the relevant primary action or compound special activity does not match.
4. Strategic knowledge sourced from FITL Rules 8.6 and authored FITL action legality; document the rule references where helpful, but keep the implementation grounded in current engine/state structure.
5. No aliasing or compatibility shims for old move assumptions; helpers should reflect the current move architecture directly.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — new NVA evaluator cases, including compound-move coverage and legality-edge coverage for trail improvement and Bombard opportunity detection

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added six NVA strategic evaluators to `fitl-competence-evaluators.ts`: `nvaAttackConditions`, `nvaMarchSouthward`, `nvaRallyTrailImprove`, `nvaControlGrowth`, `nvaInfiltrateValue`, and `nvaBombardUsage`.
  - Added reusable evaluator helpers for compound move inspection, action-specific target-space extraction, NVA proximity scoring over the authored adjacency graph, and Bombard opportunity detection grounded in authored FITL legality.
  - Expanded `fitl-competence-evaluators.test.ts` with NVA-focused coverage, including compound `op + special activity` cases and legality-edge cases for trail improvement and Bombard.
- Deviations from original plan:
  - The ticket originally assumed flat `move.actionId` handling and piece-type token ids; the implementation instead follows the current engine architecture, where runtime tokens are generic plus faction-tagged and NVA op+special decisions are compound moves.
  - `nvaAttackConditions` was implemented as an outcome-based evaluator over targeted-space deltas because `CompetenceEvalContext` does not expose counterfactual search branches.
  - Bombard evaluation was aligned with authored production legality instead of the ticket’s earlier shorthand.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `node packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`

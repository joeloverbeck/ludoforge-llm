# 66MCTSCOMEVAFRA-006: US Strategic Evaluators (Layer 3)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The US faction needs 6 strategic evaluators encoding principles from FITL Rules Section 8.8. These evaluators should check whether the MCTS agent follows sound US strategy while staying grounded in the current evaluator architecture and the authored FITL move/state surfaces that the test harness actually exposes.

## Assumption Reassessment (2026-03-18)

1. The target module already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` and already contains the shared evaluator framework plus VC and NVA strategic evaluators. This ticket must extend that module, not create a parallel evaluator surface.
2. The focused evaluator test file already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts`. New US coverage belongs there.
3. Runtime tokens do not identify US pieces via runtime `token.type === 'us-troops' | 'us-bases'`. Evaluator code and tests must inspect generic token types such as `'troops'` / `'base'` together with `token.props.faction === 'US'`. The piece-type ids remain relevant to authored victory formulas, not to direct runtime token inspection.
4. Guerrilla posture is represented by `token.props.activity === 'underground' | 'active'`.
5. Support/opposition markers are represented at `state.markers[zoneId].supportOpposition`.
6. The Trail is a real `state.globalVars.trail` key. Air Strike trail degradation is controlled by the authored `airStrike` action and its `$degradeTrail` choice, with additional legality gates such as `mom_oriskany` and `fitl_airStrikeWindowMode`.
7. US Air Strike uses action id `airStrike`, but evaluator logic must account for the current move model: Air Strike can be a standalone free special activity or the compound special activity attached to a US operation. A ticket that only inspects flat `move.actionId` will miss real `op + airStrike` decisions.
8. US victory progress is not “support only”. The current helpers define US victory as `Support + Available US Troops/Bases` via `computeUsVictory`.
9. US pacification in the current engine is modeled as the authored `coupPacifyUS` action with params `targetSpace` and `action` (`removeTerror` or `shiftSupport`). The non-player rule priority is “greatest total shift, then no Terror, then random”, not a raw “highest-population space” heuristic.
10. Assault value should align with the observable authored outcome surface: removal of NVA Control, enemy bases, tunnel exposure/removal, or a large enemy-piece swing. The original ticket omitted tunnel handling and overstated what can be proven from state deltas alone.
11. US-force losses are observable via token movement into force-pool zones such as `casualties-US:none` and `available-US:none`; comparing only `available-US:none` is insufficient.

## Architecture Check

1. All evaluators should remain pure functions of `CompetenceEvalContext`; no production code changes are warranted.
2. The existing architecture already has reusable helper patterns for map-space lookup, token counting, targeted-space inference, and compound special-activity inspection. The clean implementation path is to extend those helpers surgically where US evaluators need them, not to add alias layers or duplicate logic.
3. Evaluators should self-skip when their relevant operation or special activity is absent.
4. Strategic knowledge still belongs in test code only, but must be expressed through observable authored state deltas and the current move model rather than through prose approximations the harness cannot verify.
5. All US strategic evaluators introduced by this ticket should remain `minBudget: 'background'`.

## What to Change

### 1. `usSweepActivation` — "Sweep to activate guerrillas, then assault" (8.8.1)

- Skips unless the primary action is `sweep`.
- Uses authored target spaces when present and otherwise infers targets from state deltas.
- Checks that the sweep activated underground VC/NVA guerrillas in the relevant spaces, especially in spaces where the sweep line was strategically meaningful.
- Evaluates observable activation outcomes only; it does not attempt to prove counterfactual “best possible sweep” branches that `CompetenceEvalContext` does not expose.

### 2. `usAssaultRemoval` — "Assault where it removes control, bases, tunnels, or 6+ enemy" (8.8.2)

- Skips unless the primary action is `assault`.
- Scores the authored target spaces, not arbitrary map deltas.
- Passes when the chosen assault produces at least one strategically meaningful outcome in a targeted space: removes NVA Control, removes an enemy base, flips/removes a tunneled base, or removes 6 or more enemy pieces.
- Fails when the assault delta shows none of those worthwhile outcomes.
- This evaluator should be outcome-based because the current test context exposes before/after state deltas, not the full counterfactual choice tree.

### 3. `usSupportGrowth` — "US victory = support + available pieces"

- Always evaluates (not move-type-gated).
- Uses `computeUsVictory`, not raw support total, because Available US pieces are part of the authored US victory formula and matter strategically.
- Passes when the US victory marker is maintained or improved.
- Fails when the US move regresses that authored victory score.

### 4. `usTrailDegradation` — "When Trail is high and Air Strike is chosen, include trail degradation when legally available" (8.8.2 Air Strike)

- Evaluates only when the move includes `airStrike`, either as the primary action or as `move.compound.specialActivity`.
- Uses the authored Air Strike params surface (`$degradeTrail`) plus authored legality gates (`trail`, `mom_oriskany`, `fitl_airStrikeWindowMode`, and other conditions visible in the synthetic state).
- Passes when a high-trail Air Strike includes trail degradation when that degradation is legally available and strategically warranted.
- Fails when the move uses Air Strike in that situation but declines degradation.
- Skips when the move does not include Air Strike or when trail degradation was not legally available to the chosen Air Strike.

### 5. `usPacification` — "Pacify for the best shift first, then prefer no Terror" (8.8.6)

- Skips unless the move action is `coupPacifyUS`.
- Uses the current authored action model (`targetSpace`, `action`) instead of a generic “coup-phase pacification” abstraction.
- Ranks candidate spaces by observable pacification value grounded in the authored rule priority: greatest total support shift first, then no Terror as a tiebreaker.
- Checks that `shiftSupport` does not ignore a clearly better pacification target and that `removeTerror` is only treated as valuable when it meaningfully supports later shifting in the same space.

### 6. `usForcePreservation` — "US should not lose more than 2 pieces per turn from voluntary operations"

- Always evaluates.
- Compares total observable US force disposition deltas, including movement into `casualties-US:none` and `available-US:none`, rather than looking only at Available.
- Focuses on voluntary US operations that produce avoidable US-piece losses in excess of the intended strategic cap.
- Passes when the move preserves US forces within that bound.
- Fails when the move incurs an excessive US loss swing.

### 7. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| sweep-activates | `usSweepActivation` | Underground guerrillas now active → pass |
| sweep-no-activation | `usSweepActivation` | No guerrillas activated → fail |
| sweep-skip-non-sweep | `usSweepActivation` | Move is `assault` → skip |
| assault-removes-base | `usAssaultRemoval` | Assault removes an enemy base in the target space → pass |
| assault-no-meaningful-outcome | `usAssaultRemoval` | Assault gains no control / base / tunnel / 6+ removal outcome → fail |
| support-maintained | `usSupportGrowth` | `computeUsVictory` score ≥ before → pass |
| support-dropped | `usSupportGrowth` | `computeUsVictory` score < before → fail |
| trail-degraded | `usTrailDegradation` | High-trail Air Strike includes degrade → pass |
| trail-not-degraded | `usTrailDegradation` | High-trail Air Strike omits degrade even though legal → fail |
| trail-skip-no-air-strike | `usTrailDegradation` | Move does not include Air Strike or degrade is not legal → skip |
| pacify-best-shift | `usPacification` | `coupPacifyUS` shifts support in the strongest candidate space → pass |
| pacify-weaker-target | `usPacification` | `coupPacifyUS` shifts support in a clearly dominated candidate space → fail |
| force-preserved | `usForcePreservation` | ≤2 US pieces lost across observable force pools → pass |
| force-wasted | `usForcePreservation` | >2 US pieces lost across observable force pools → fail |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 6 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add focused US evaluator coverage and any small local test helpers needed for Air Strike / coup-pacification move shapes)

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
3. All evaluators skip gracefully when the relevant primary action or compound special activity does not match.
4. Strategic knowledge is sourced from FITL Rules 8.8 but must be expressed through observable authored engine state deltas and the current move model, not through assumptions contradicted by the current FITL rules data.
5. No aliasing or compatibility shims for old move assumptions; helpers should reflect the current architecture directly.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — new US evaluator cases, including Air Strike param coverage, coup-pacification coverage, and force-loss edge coverage

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added six US strategic evaluators to `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`: `usSweepActivation`, `usAssaultRemoval`, `usSupportGrowth`, `usTrailDegradation`, `usPacification`, and `usForcePreservation`.
  - Added shared evaluator helpers for compound-action inspection, Air Strike param extraction, insurgent/tunneled-base counting, and US coup-pacification opportunity scoring.
  - Expanded `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` with focused US coverage, including compound `op + airStrike`, coup-pacification target ranking, and force-loss edge cases.
- Deviations from original plan:
  - Corrected the original ticket before implementation so it matched runtime token identity, the authored `coupPacifyUS` move shape, compound Air Strike handling, US victory scoring, and tunnel/force-pool semantics.
  - `usTrailDegradation` was implemented as an evaluator over chosen Air Strike moves plus authored legality gates, not as a broader “Air Strike was available somewhere” detector that `CompetenceEvalContext` cannot prove.
  - `usPacification` was aligned to the current authored pacification action surface and rule priority (“greatest total shift, then no Terror”) rather than a simpler raw-population heuristic.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `node packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`

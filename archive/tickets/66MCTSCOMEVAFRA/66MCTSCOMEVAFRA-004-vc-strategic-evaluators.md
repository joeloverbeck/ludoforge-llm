# 66MCTSCOMEVAFRA-004: VC Strategic Evaluators (Layer 3)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: None — test infrastructure only
**Deps**: 66MCTSCOMEVAFRA-001

## Problem

The competence framework now has the core contracts, the engineered-state helper, the focused evaluator test file, Layer 1 category competence, cross-faction strategic evaluators, and Layer 2 victory evaluators. What is still missing is the VC-specific Layer 3 evaluator set. These evaluators should encode meaningful VC strategic principles from FITL Rules Section 8.5 while staying grounded in the authored FITL action semantics that the current engine actually exposes.

## Assumption Reassessment (2026-03-18)

1. The target module already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`. It currently contains `categoryCompetence`, `victoryProgress`, `victoryDefense`, `resourceDiscipline`, `monsoonAwareness`, `passStrategicValue`, and `budgetRank`. This ticket must extend that file, not create a parallel evaluator surface.
2. The focused evaluator test file already exists at `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts`. New VC coverage belongs there.
3. VC piece type ids are confirmed in FITL content data: `vc-guerrillas` and `vc-bases`. Guerrilla posture is represented by `token.props.activity`; VC bases use `token.props.tunnel`, not `activity`.
4. Support/opposition markers are represented at `state.markers[zoneId].supportOpposition`. The existing victory helpers already consume that shape.
5. Population and LoC econ are authored as compiled zone attributes (`zone.attributes.population`, `zone.attributes.econ`) on `def.zones`, not on `GameState`.
6. VC resources are tracked in `state.globalVars.vcResources`.
7. The authored VC Rally pipeline does not use a `4+ guerrillas` threshold for base placement. In the current rules data, `replace-with-base` becomes available in a no-base space once there are at least `2` VC guerrillas there and fewer than `2` total bases in the space. The original ticket assumption was wrong and must not drive the evaluator design.
8. The authored Tax pipeline is more specific than the original ticket states: one underground VC guerrilla activates in each taxed space; LoCs grant `econ`; provinces/cities grant `population * 2`; populated non-`activeSupport` provinces/cities shift one level toward Active Support; population-0 spaces do not shift support.
9. The authored Subvert pipeline only affects ARVN `troops` and `police` pieces, never bases; it requires an underground VC guerrilla in the target space; `replace-1` additionally requires an available VC guerrilla; and it does not activate VC guerrillas.

## Architecture Check

1. Adding the VC evaluator layer to the existing evaluator module is still the right architecture. It keeps the competence framework composable and test-only without scattering FITL-specific reasoning across more files.
2. The clean implementation path is shared FITL-private helper logic inside `fitl-competence-evaluators.ts` for:
   - locating map zones and their attributes,
   - counting faction/type/activity tokens per zone,
   - detecting zone-level deltas between `stateBefore` and `stateAfter`,
   - ranking candidate zones for rally/tax/subvert heuristics.
   Do not introduce alias APIs or game-specific branches into production code.
3. These evaluators should remain pure functions of `CompetenceEvalContext`, comparing `stateBefore` vs `stateAfter` and self-skipping when the chosen move does not exercise the relevant strategic surface.
4. All VC Layer 3 evaluators should use `minBudget: 'background'`. Even `vcOppositionGrowth` is better kept in the same tier for consistency with the rest of the strategic layer; coarse victory regression is already covered by Layer 2.
5. The evaluator scope should prefer observable, authored invariants over speculative flowchart prose. For example, Subvert should be judged on legal/value-bearing targets and tangible ARVN-piece removal, not on hand-wavy "max COIN control" claims that the current state delta cannot robustly reconstruct.

## What to Change

### 1. `vcRallyQuality`

- Skips if move is not `rally`.
- Checks that Rally favors adding VC guerrillas in spaces that already contain VC bases when such spaces are available.
- Use authored Rally semantics, not the obsolete ticket assumption. In a with-base space, the relevant observable deltas are:
  - additional VC guerrillas placed, or
  - active VC guerrillas flipped underground.
- Prefer a scoring/ranking approach over a hardcoded "`<4 underground`" check so the evaluator aligns with the current authored Rally pipeline (`population + baseCount` guerrilla placement cap, or flip-active-to-underground option).

### 2. `vcTerrorTarget`

- Skips if move is not `terror`.
- Identifies terrored spaces from state deltas, primarily through `terrorCount` changes and/or `supportOpposition` shifts.
- Checks that targeted spaces were populated and non-opposition spaces where Terror has clear strategic value, with preference for higher-population support spaces over lower-value alternatives.

### 3. `vcBaseExpansion`

- Skips if move is not `rally`.
- Correct the base-placement trigger to match the authored Rally rules: in a space with no VC base, `replace-with-base` is available once there are at least `2` VC guerrillas there and fewer than `2` total bases in the space.
- Checks that if Rally chose a no-base space already meeting that threshold, the move does not ignore a clean base-expansion opportunity.
- The evaluator should compare eligible no-base spaces before the move against actual VC base count deltas after the move.

### 4. `vcOppositionGrowth`

- Evaluates at background budget only.
- Uses `computeVcVictory` from `fitl-mcts-test-helpers.ts`.
- Checks that a VC move does not reduce the VC victory marker and rewards positive movement, but keep this as a strategic-layer evaluator separate from the existing generic Layer 2 factory.
- This evaluator should focus on VC-specific explanation/diagnostics, not duplicate the full `victoryProgress` implementation.

### 5. `vcResourceManagement`

- Skips when the move does not meaningfully test a VC resource decision.
- Reuses the existing authored resource surface:
  - `state.globalVars.vcResources`,
  - whether `tax` is a legal action at the decision point,
  - whether the chosen move is free or paid.
- This evaluator should complement `resourceDiscipline()`, not re-implement it. The useful VC-specific question is whether the move ignores a clearly superior Tax opportunity when VC is resource-starved or selects low-value Tax when resources are already comfortable and better strategic actions are available.

### 6. `vcSubvertTargeting`

- Skips if move is not `subvert`.
- Checks the actual authored prerequisites and outcomes:
  - the targeted space(s) had underground VC guerrillas before the move,
  - ARVN `troops`/`police` were actually removed,
  - `replace-1` only counts as high-value if the move also placed a VC guerrilla from Available,
  - ARVN bases are irrelevant because authored Subvert does not touch them,
  - Subvert should not activate VC guerrillas.
- Prefer concrete value signals such as removing two ARVN cubes when available over vague control heuristics the evaluator cannot prove.

### 7. `vcTaxEfficiency`

- Skips if move is not `tax`.
- Ranks taxed spaces using authored payoff, not only rules prose:
  - LoCs: `econ`,
  - provinces/cities: `population * 2`,
  - populated non-`activeSupport` provinces/cities also gain support-shift upside,
  - population-0 spaces and already-`activeSupport` spaces are lower value than otherwise comparable targets.
- Checks that the chosen tax targets are competitive with the best available targets at the decision point rather than obviously random or dominated.

### 8. Unit tests — synthetic state deltas

| Test | Evaluator | Description |
|------|-----------|-------------|
| rally-base-preferred-pass | `vcRallyQuality` | Rally adds VC presence in an existing-base space when such a space is available |
| rally-base-ignored-fail | `vcRallyQuality` | Rally spends placement on a non-base space while a stronger with-base space was available |
| rally-skip-non-rally | `vcRallyQuality` | Non-rally move self-skips |
| terror-high-pop-support-pass | `vcTerrorTarget` | Terror hits a populated support space and moves it in a VC-favorable direction |
| terror-low-value-target-fail | `vcTerrorTarget` | Terror targets a lower-value neutral/pop-0 space while a better support target existed |
| base-expansion-2g-trigger-pass | `vcBaseExpansion` | A no-base space with 2+ VC guerrillas gains a base |
| base-expansion-missed-fail | `vcBaseExpansion` | A clearly eligible no-base rally space does not gain a base |
| opposition-maintained | `vcOppositionGrowth` | VC-specific victory score is maintained or improved |
| opposition-dropped | `vcOppositionGrowth` | VC-specific victory score regresses |
| resource-tax-when-starved-pass | `vcResourceManagement` | Low-resource VC takes an obviously valuable Tax line |
| resource-tax-ignored-fail | `vcResourceManagement` | Low-resource VC ignores an obviously valuable Tax line |
| subvert-remove-2-pass | `vcSubvertTargeting` | Subvert removes two ARVN cubes from a legal underground-VC target |
| subvert-low-value-replace-fail | `vcSubvertTargeting` | Subvert spends a target on a weaker replace line while a stronger remove-2 target existed |
| subvert-no-activation-invariant | `vcSubvertTargeting` | Existing and replacement VC guerrillas remain underground |
| tax-best-payoff-pass | `vcTaxEfficiency` | Tax selects the strongest available authored-payoff target(s) |
| tax-dominated-target-fail | `vcTaxEfficiency` | Tax skips clearly better payoff targets for dominated spaces |
| tax-pop0-lower-value | `vcTaxEfficiency` | Population-0 province is recognized as lower value than a populated alternative |

## Files to Touch

- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts` (modify — add 7 evaluators)
- `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` (modify — add focused VC evaluator tests)

## Out of Scope

- NVA, US, ARVN evaluators (tickets 005–007)
- Non-player AI flowchart implementation (Spec 30) — these evaluate MCTS, not the NP bot
- Production code changes
- Evaluation function / heuristic improvements
- Scenario composition (tickets 008, 008b)

## Acceptance Criteria

### Tests That Must Pass

1. All focused VC evaluator tests added by this ticket pass.
2. `pnpm turbo typecheck` — no type errors.
3. `pnpm turbo lint` — no lint errors.
4. `pnpm -F @ludoforge/engine test` — all existing tests still pass.

### Invariants

1. No production source code changes.
2. All evaluators are pure functions of `CompetenceEvalContext`.
3. All evaluators skip gracefully when move type doesn't match.
4. All VC evaluators introduced here have `minBudget: 'background'`.
5. Strategic knowledge is sourced from FITL Rules 8.5 but must be expressed through observable authored engine state deltas and current FITL rules data, not through assumptions contradicted by the current authored pipelines.
6. The implementation must not duplicate generic Layer 2 logic or cross-faction helpers where existing evaluator factories already cover that concern.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` — focused synthetic state-delta coverage for the seven VC evaluators, including authored Tax/Subvert edge cases

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added seven VC strategic evaluators to `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.ts`: `vcRallyQuality`, `vcTerrorTarget`, `vcBaseExpansion`, `vcOppositionGrowth`, `vcResourceManagement`, `vcSubvertTargeting`, and `vcTaxEfficiency`.
  - Added shared FITL-private helper logic in the same evaluator module for map-zone lookup, zone-attribute access, token counting, and authored-opportunity scoring so the evaluator implementations stay small and composable.
  - Expanded `packages/engine/test/e2e/mcts-fitl/fitl-competence-evaluators.test.ts` with focused synthetic state-delta coverage for all seven VC evaluators, including authored Tax/Subvert invariants and extra edge cases.
  - Corrected this ticket before implementation so its assumptions matched the current competence framework and the authored FITL Rally/Tax/Subvert pipelines.
- Deviations from original plan:
  - Corrected the original base-expansion premise from `4+` guerrillas to the authored `2+` guerrilla threshold used by the current VC Rally pipeline.
  - Kept `vcOppositionGrowth` in the background-only strategic tier instead of mixing budget tiers inside the VC layer, because generic victory progress/defense is already covered by Layer 2.
  - Defined Tax/Subvert evaluators around authored, observable state deltas and ranking heuristics rather than the original ticket's less-defensible prose about generic cube/control priorities.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine` passed.
  - `node packages/engine/dist/test/e2e/mcts-fitl/fitl-competence-evaluators.test.js` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# pass 438`, `# fail 0`).

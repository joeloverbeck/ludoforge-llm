# Spec 140 Profile Migration Audit

This audit covers the live profiles declared in:

- `data/games/fire-in-the-lake/92-agents.md`
- `data/games/texas-holdem/92-agents.md`

Method:

- Count only expressions reachable from each live profile's active `pruningRules`, `considerations`, and `tieBreakers`.
- Include transitive supporting expressions (`stateFeatures`, `candidateFeatures`, `candidateAggregates`) because those expressions must migrate with the profile.
- Treat preview settings such as `preview.mode` and `preview.phase1` as migration context, not standalone expression rows.

## Summary

- `6` profiles audited
- `93` reachable policy expressions audited
- Category `A`: `63`
- Category `B`: `13`
- Category `C`: `17`

Ticket `140MICRODECPRO-009` remains in scope. Category `C` is non-zero in the live FITL profiles, so the re-evolution gate does not descope.

## Category Rules

- `A` — already valid at microturn scope because the expression reads only current state, current player state, or action-selection metadata (`candidate.tag.*`, `candidate.actionId`).
- `B` — mechanically rewriteable because the expression currently reads completion-time bindings (`candidate.param.*`) or completion-decision metadata (`decision.*`, `option.value`) that map directly to `microturnContext.accumulatedBindings`, `microturnContext.decisionKind`, `microturnContext.decisionKey`, or current-option metadata.
- `C` — not mechanically rewriteable because the expression depends on the retiring two-phase preview/candidate-set model (`preview.*`, normalized preview ranges, or preview-derived deltas). These rows need re-evolution or a deliberate replacement scoring strategy in ticket `008/009`.

## Audit Table

| Profile | Expression ID | Category | Transform notes |
| --- | --- | --- | --- |
| us-baseline | `candidateAggregates.hasNonPassAlternative.of` | A | Aggregate stays on the current published action frontier; no semantic rewrite needed. |
| us-baseline | `candidateFeatures.projectedSelfMargin.expr` | C | Depends on `preview.victory.currentMargin.self` from the retiring exact-world/two-phase preview surface. Replace by re-evolved microturn scoring rather than a literal port. |
| us-baseline | `considerations.preferAdviseAction.value` | A | `candidate.tag.advise` remains direct action-selection metadata. |
| us-baseline | `considerations.preferAssaultAction.value` | A | `candidate.tag.assault` remains direct action-selection metadata. |
| us-baseline | `considerations.preferEvent.value` | A | `candidate.tag.event-play` remains direct action-selection metadata. |
| us-baseline | `considerations.preferEvent.weight` | A | Tunable scalar weight survives unchanged. |
| us-baseline | `considerations.preferPatrolAction.value` | A | `candidate.tag.patrol` remains direct action-selection metadata. |
| us-baseline | `considerations.preferProjectedSelfMargin.value` | C | Inherits the retired preview-based margin signal from `feature.projectedSelfMargin`; treat as a re-evolution input. |
| us-baseline | `considerations.preferProjectedSelfMargin.weight` | A | Tunable scalar weight survives unchanged. |
| us-baseline | `considerations.preferTrainAction.value` | A | `candidate.tag.train` remains direct action-selection metadata. |
| us-baseline | `considerations.preserveResources.value` | A | Reads current player resources only; valid at any microturn. |
| us-baseline | `considerations.preserveResources.weight` | A | Tunable scalar weight survives unchanged. |
| us-baseline | `pruningRules.dropPassWhenOtherMovesExist.when` | A | Current-frontier pruning remains valid once the frontier is `microturn.legalActions`. |
| us-baseline | `stateFeatures.selfMargin.expr` | A | Reads current victory margin only; no rewrite needed. |
| us-baseline | `stateFeatures.selfResources.expr` | A | Reads current player resources only; no rewrite needed. |
| arvn-baseline | `candidateAggregates.hasNonPassAlternative.of` | A | Aggregate stays on the current published action frontier; no semantic rewrite needed. |
| arvn-baseline | `candidateFeatures.projectedSelfMargin.expr` | C | Depends on `preview.victory.currentMargin.self` from the retiring exact-world/two-phase preview surface. Replace by re-evolved microturn scoring rather than a literal port. |
| arvn-baseline | `considerations.preferGovernWeighted.value` | A | `candidate.tag.govern` remains direct action-selection metadata. |
| arvn-baseline | `considerations.preferGovernWeighted.weight` | A | Tunable scalar weight survives unchanged. |
| arvn-baseline | `considerations.preferPopulousTargets.value` | B | `option.value` maps to the currently published microturn option value/metadata. |
| arvn-baseline | `considerations.preferPopulousTargets.when` | B | `decision.type` and `decision.name` rewrite to `microturnContext.decisionKind` and `microturnContext.decisionKey`; target kind comes from current option metadata. |
| arvn-baseline | `considerations.preferProjectedSelfMargin.value` | C | Inherits the retired preview-based margin signal from `feature.projectedSelfMargin`; treat as a re-evolution input. |
| arvn-baseline | `considerations.preferProjectedSelfMargin.weight` | A | Tunable scalar weight survives unchanged. |
| arvn-baseline | `pruningRules.dropPassWhenOtherMovesExist.when` | A | Current-frontier pruning remains valid once the frontier is `microturn.legalActions`. |
| arvn-baseline | `stateFeatures.selfMargin.expr` | A | Reads current victory margin only; no rewrite needed. |
| arvn-evolved | `candidateAggregates.hasNonPassAlternative.of` | A | Aggregate stays on the current published action frontier; no semantic rewrite needed. |
| arvn-evolved | `candidateAggregates.maxMarginScore.of` | C | Depends on preview-derived projected margin candidates; no 1:1 microturn equivalent once candidate-set phase preview retires. |
| arvn-evolved | `candidateAggregates.minMarginScore.of` | C | Depends on preview-derived projected margin candidates; no 1:1 microturn equivalent once candidate-set phase preview retires. |
| arvn-evolved | `candidateFeatures.projectedSelfMargin.expr` | C | Depends on `preview.victory.currentMargin.self` from the retiring exact-world/two-phase preview surface. Replace by re-evolved microturn scoring rather than a literal port. |
| arvn-evolved | `considerations.governWhenPatronageLow.value` | A | `candidate.tag.govern` remains direct action-selection metadata. |
| arvn-evolved | `considerations.governWhenPatronageLow.when` | A | Reads current patronage only; no rewrite needed. |
| arvn-evolved | `considerations.preferGovernWeighted.value` | A | `candidate.tag.govern` remains direct action-selection metadata. |
| arvn-evolved | `considerations.preferGovernWeighted.weight` | A | Tunable scalar weight survives unchanged. |
| arvn-evolved | `considerations.preferPacifyPopulousZones.value` | B | `candidate.param.targetSpace` rewrites to the bound target-space value in `microturnContext.accumulatedBindings` or current-option metadata. |
| arvn-evolved | `considerations.preferPacifyPopulousZones.when` | A | `candidate.actionId` remains direct action-selection metadata. |
| arvn-evolved | `considerations.preferPopulousTargets.value` | B | `option.value` maps to the currently published microturn option value/metadata. |
| arvn-evolved | `considerations.preferPopulousTargets.when` | B | `decision.type` and `decision.name` rewrite to `microturnContext.decisionKind` and `microturnContext.decisionKey`; target kind comes from current option metadata. |
| arvn-evolved | `considerations.preferProjectedSelfMargin.value` | C | Inherits the retired preview-based margin signal from `feature.projectedSelfMargin`; treat as a re-evolution input. |
| arvn-evolved | `considerations.preferProjectedSelfMargin.weight` | A | Tunable scalar weight survives unchanged. |
| arvn-evolved | `considerations.preferRedeployNearEnemies.value` | B | `option.value` rewrites to current-option metadata for the live `chooseOne/chooseNStep` microturn. |
| arvn-evolved | `considerations.preferRedeployNearEnemies.when` | B | `decision.name` rewrites to `microturnContext.decisionKey`. |
| arvn-evolved | `considerations.preferRedeployToPopulousZones.value` | B | `option.value` rewrites to current-option metadata for the live `chooseOne/chooseNStep` microturn. |
| arvn-evolved | `considerations.preferRedeployToPopulousZones.when` | B | `decision.name` rewrites to `microturnContext.decisionKey`. |
| arvn-evolved | `considerations.preferStrongNormalizedMargin.value` | C | Normalizes preview-derived projected margins across the candidate set; this is the clearest two-phase-only scoring pattern in the live repo. |
| arvn-evolved | `considerations.preferTrainWeighted.value` | A | `candidate.tag.train` remains direct action-selection metadata. |
| arvn-evolved | `considerations.preferTrainWeighted.weight` | A | Tunable scalar weight survives unchanged. |
| arvn-evolved | `considerations.trainWhenControlLow.value` | A | `candidate.tag.train` remains direct action-selection metadata. |
| arvn-evolved | `considerations.trainWhenControlLow.when` | A | Reads current controlled-population metric only; no rewrite needed. |
| arvn-evolved | `pruningRules.dropPassWhenOtherMovesExist.when` | A | Current-frontier pruning remains valid once the frontier is `microturn.legalActions`. |
| arvn-evolved | `stateFeatures.coinControlPop.expr` | A | Reads current metric only; no rewrite needed. |
| arvn-evolved | `stateFeatures.patronage.expr` | A | Reads current patronage only; no rewrite needed. |
| arvn-evolved | `stateFeatures.selfMargin.expr` | A | Reads current victory margin only; no rewrite needed. |
| nva-baseline | `candidateAggregates.hasNonPassAlternative.of` | A | Aggregate stays on the current published action frontier; no semantic rewrite needed. |
| nva-baseline | `candidateFeatures.projectedSelfMargin.expr` | C | Depends on `preview.victory.currentMargin.self` from the retiring exact-world/two-phase preview surface. Replace by re-evolved microturn scoring rather than a literal port. |
| nva-baseline | `considerations.preferAttackAction.value` | A | `candidate.tag.attack` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferBombardAction.value` | A | `candidate.tag.bombard` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferEvent.value` | A | `candidate.tag.event-play` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferEvent.weight` | A | Tunable scalar weight survives unchanged. |
| nva-baseline | `considerations.preferInfiltrateAction.value` | A | `candidate.tag.infiltrate` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferMarchAction.value` | A | `candidate.tag.march` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferProjectedSelfMargin.value` | C | Inherits the retired preview-based margin signal from `feature.projectedSelfMargin`; treat as a re-evolution input. |
| nva-baseline | `considerations.preferProjectedSelfMargin.weight` | A | Tunable scalar weight survives unchanged. |
| nva-baseline | `considerations.preferRallyAction.value` | A | `candidate.tag.rally` remains direct action-selection metadata. |
| nva-baseline | `considerations.preferTerrorAction.value` | A | `candidate.tag.terror` remains direct action-selection metadata. |
| nva-baseline | `considerations.preserveResources.value` | A | Reads current player resources only; valid at any microturn. |
| nva-baseline | `considerations.preserveResources.weight` | A | Tunable scalar weight survives unchanged. |
| nva-baseline | `pruningRules.dropPassWhenOtherMovesExist.when` | A | Current-frontier pruning remains valid once the frontier is `microturn.legalActions`. |
| nva-baseline | `stateFeatures.selfMargin.expr` | A | Reads current victory margin only; no rewrite needed. |
| nva-baseline | `stateFeatures.selfResources.expr` | A | Reads current player resources only; no rewrite needed. |
| vc-baseline | `candidateAggregates.hasNonPassAlternative.of` | A | Aggregate stays on the current published action frontier; no semantic rewrite needed. |
| vc-baseline | `candidateAggregates.maxMarginScore.of` | C | Depends on preview-derived projected margin candidates; no 1:1 microturn equivalent once candidate-set phase preview retires. |
| vc-baseline | `candidateAggregates.minMarginScore.of` | C | Depends on preview-derived projected margin candidates; no 1:1 microturn equivalent once candidate-set phase preview retires. |
| vc-baseline | `candidateFeatures.projectedCapabilityGain.expr` | C | Depends on preview-derived feature deltas (`preview.feature.*`); this is not available as a direct microturn binding. |
| vc-baseline | `candidateFeatures.projectedSelfMargin.expr` | C | Depends on `preview.victory.currentMargin.self` from the retiring exact-world/two-phase preview surface. Replace by re-evolved microturn scoring rather than a literal port. |
| vc-baseline | `considerations.preferNormalizedMargin.value` | C | Normalizes preview-derived projected margins across the candidate set; this is a two-phase ranking heuristic, not a direct microturn port. |
| vc-baseline | `considerations.preferPopulousTargets.value` | B | `option.value` maps to the currently published microturn option value/metadata. |
| vc-baseline | `considerations.preferPopulousTargets.when` | B | `decision.type` and `decision.name` rewrite to `microturnContext.decisionKind` and `microturnContext.decisionKey`; target kind comes from current option metadata. |
| vc-baseline | `considerations.preferRallyWeighted.value` | A | `candidate.tag.rally` remains direct action-selection metadata. |
| vc-baseline | `considerations.preferRallyWeighted.weight` | A | Tunable scalar weight survives unchanged. |
| vc-baseline | `considerations.valueCapabilityGain.value` | C | Inherits the retired preview-delta feature from `feature.projectedCapabilityGain`; treat as a re-evolution input. |
| vc-baseline | `pruningRules.dropPassWhenOtherMovesExist.when` | A | Current-frontier pruning remains valid once the frontier is `microturn.legalActions`. |
| vc-baseline | `stateFeatures.selfMargin.expr` | A | Reads current victory margin only; no rewrite needed. |
| vc-baseline | `stateFeatures.vcFriendlyCapCount.expr` | A | Reads current capability markers only; no rewrite needed. |
| baseline | `candidateFeatures.raiseAmount.expr` | B | `candidate.param.raiseAmount` rewrites to the bound raise-size option on the active raise microturn. |
| baseline | `considerations.alwaysRaise.value` | A | `candidate.tag.raise` remains direct action-selection metadata. |
| baseline | `considerations.avoidFold.value` | A | `candidate.tag.fold` remains direct action-selection metadata. |
| baseline | `considerations.foldWhenBadPotOdds.value` | A | Reads current state features plus `candidate.tag.fold`; valid at action-selection microturn. |
| baseline | `considerations.preferCall.value` | A | `candidate.tag.call` remains direct action-selection metadata. |
| baseline | `considerations.preferCheck.value` | A | `candidate.tag.check` remains direct action-selection metadata. |
| baseline | `considerations.preferLargerRaise.value` | B | Inherits the mechanically rewriteable `feature.raiseAmount` binding from the active raise-size microturn. |
| baseline | `stateFeatures.callAmount.expr` | A | Reads current betting state only; no rewrite needed. |
| baseline | `stateFeatures.facingBet.expr` | A | Derived from current betting state only; no rewrite needed. |
| baseline | `stateFeatures.potOddsFavorable.expr` | A | Reads current betting state only; no rewrite needed. |

## Migration Readout

- FITL `us-baseline` and `nva-baseline` are mostly stable action-selection profiles, but both rely on the preview-based `projectedSelfMargin` feature and therefore still carry Category `C` rows.
- FITL `arvn-evolved` is the widest migration surface. Its redeploy and target-space rules convert mechanically, but its normalized preview margin logic remains Category `C`.
- FITL `vc-baseline` has the heaviest Category `C` concentration because it combines preview-derived margin normalization with preview-derived capability deltas.
- Texas Hold'em is the expected easy case from the spec. Its only Category `B` surface is raise-size binding (`candidate.param.raiseAmount`), and it has zero Category `C` rows.

# FITL ARVN Agent Evolution — Musings

## Baseline (fresh, tier 1, seed 1000)
- compositeScore = -6, avgMargin = -6, wins = 0
- Game ended at final Coup: VC won (+5), ARVN -6, US -8, NVA -14.
- ARVN was 6 points short of the 50-point threshold (COIN-Controlled Population + Patronage).

## OBSERVE findings from trace-1000.json
- Decision breakdown: 206 strategic, 24 tactical, **224 tied decisions out of 230** (97% tied).
- Preview is BROKEN for ARVN action-selection candidates: `previewFailureReason: "notDecisionComplete"`, `previewOutcome: "unresolved"`. **Root cause (verified in code, not assumed)**: Spec 140 (microturn-native decision protocol) made every action-selection produce a `pendingAdmissible { continuation: "decision" }` admissibility verdict (there is always an inner `chooseN`/`chooseOne` microturn to follow). `packages/engine/src/agents/policy-preview.ts:172-180` still rejects any non-stochastic `pendingAdmissible` candidate as `notDecisionComplete`. So `preferProjectedSelfMargin` coalesces to the pre-move `feature.selfMargin`, which is identical across candidates → 97% tied decisions. This is an architectural gap opened by the microturn transition, not a general "known limitation." Candidate for a future spec: teach `policy-preview` to follow the decision stack to a terminal (or deep-enough) state before resolving the victory surface. Implication for this campaign: action-tag considerations are the only working signal — the VC-campaign lessons about `projectedMarginWeight=5 being strongest` pre-date Spec 140 and no longer apply.
- ARVN action selection histogram: govern=2, train=29, event=2, plus Coup-phase redeploy/pacify. **Train is overwhelmingly dominant**; Govern is almost never chosen.
- Root cause of train dominance (mid-game): once patronage >= 20, `governWhenPatronageLow` stops firing. Remaining contributions per move:
  - govern: `preferProjectedSelfMargin(-30)` + `preferGovernWeighted(+5)` = -25
  - train:  `preferProjectedSelfMargin(-30)` + `preferTrainWeighted(+3)` + `trainWhenControlLow(+5)` = -22
  - train wins by 3. After that, Patronage never grows further from ARVN's own actions.

## Cross-campaign lessons (hypotheses to verify for ARVN)
From `fitl-vc-agent-evolution` (different faction, different victory formula):
- `preferRallyWeighted` captures multi-turn infrastructure value preview can't see → ARVN analog is **Govern** (builds Patronage, the primary scalar toward the 50-point threshold).
- `projectedMarginWeight=5` is the strongest scoring signal when preview works — but for ARVN, preview is broken (`previewOutcome: unresolved`), so preview cannot currently drive decisions. Candidate-level differentiation must come from action-tag considerations and conditional score terms.
- `dropPassWhenOtherMovesExist` is ESSENTIAL — never remove.
- Weight values are a threshold effect: as long as the RANKING is correct, exact magnitude is cosmetic.

## exp-001: boost governWeight to correct train-over-govern ranking
**Category**: action-priority (UCB1 not yet applicable — first experiment)
**Hypothesis**: Raising `governWeight` from 5 to 10 in the `arvn-evolved` profile will make `preferGovernWeighted` contribute +10 per govern candidate, so the mid-game score ranking flips from `train(-22) > govern(-25)` to `govern(-20) > train(-22)`. ARVN should then govern repeatedly through mid/late game, building Patronage directly toward the 50-point victory threshold. Expected outcome: avgMargin improves from -6 toward 0 or positive; possibly reaches a win on seed 1000.

**Result**: ACCEPT (compositeScore -6 -> 20, wins 0/1 -> 1/1, avgMargin -6 -> +10). ARVN won seed 1000 outright by 10 points.
**Learning**: Hypothesis confirmed. The `preferGovernWeighted` action-tag consideration is the ARVN analog of VC's `preferRallyWeighted` — captures multi-turn infrastructure value (Patronage accumulation) that broken preview cannot see. Threshold-effect applies: governWeight=5 lost to train's combined +8; governWeight=10 dominates. Tier advanced from 1 to 2 (wins == current_tier).

## tier-2 baseline re-measurement
Seeds 1000-1001: compositeScore=15.5, avgMargin=10.5, wins=1/2. Seed 1000 still wins (+10), seed 1001 loses. New best-at-tier-2: wins=1, avgMargin=10.5, compositeScore=15.5. Subsequent experiments are measured against this tier-2 state.

## infra: sync-fixtures.sh rewritten (non-experiment commit)
`PolicyAgent.chooseMove()` was renamed to `chooseDecision()` in Spec 140. The old sync-fixtures.sh crashed before regenerating anything. Rewrote to use `publishMicroturn` + `chooseDecision`, regenerated all three golden fixtures to match current production spec. Catalog fingerprint updated to include governWeight=10.

## seed 1001 diagnosis (lost at tier-2 baseline)
ARVN ended +11 (crossed threshold 50), but VC ended +14 and won by higher margin. ARVN's action distribution: govern=25, train=3, event=2, pass=2 — heavily over-governed. Sweep was available as a candidate on nearly every ARVN action-selection microturn but was NEVER chosen (no `preferSweepWeighted` in arvn-evolved's considerations, and no conditional boost). VC accumulated margin via its own Rally-driven engine while ARVN did nothing to disrupt VC's guerrilla network.

## exp-002: add conditional Sweep when VC guerrilla count is high
**Category**: conditional-strategy
**Hypothesis**: Adding a new library consideration `sweepWhenVcStrong` (fires when `feature.vcGuerrillaCount > 25`, weight 12) and including it in the `arvn-evolved` considerations list should boost Sweep above Govern (+10) when VC is strongly entrenched. Sweep activates VC guerrillas; subsequent Assault (or later turns) can remove them, reducing VC's Opposition+Bases margin. Expected: seed 1001 flips from loss (VC +14, ARVN +11) to win by lowering VC's margin via disruption. Seed 1000 should be mostly unaffected (fewer VC guerrillas in that scenario). lines_delta expected: +11 (new library item + 1 line in use.considerations).

**Result**: REJECT (compositeScore 15.5 -> 10, avgMargin 10.5 -> 5, wins unchanged 1/2). Seed 1000 actually improved slightly (margin 10 -> 11, ARVN did 10 sweeps and VC margin dropped 6 -> 5), but seed 1001 regressed badly (margin 11 -> -1): the 7 sweeps displaced ~7 governs, and each lost govern was ~1 point of patronage. Sweep disrupts VC a little but costs ARVN's own margin more.
**Learning**: Sweep-for-govern is a BAD trade — each govern loss directly costs margin, and sweep only indirectly limits VC's growth through activated guerrilla removal later. Rejected changes stashed as near-miss? No — magnitude (-5.5 compositeScore) exceeds NOISE_TOLERANCE by ~100x, this is a clear REJECT, not a near-miss. Real lesson: ARVN's margin engine is fragile to losing Govern slots; any consideration that competes with Govern must add ARVN margin MORE than the displaced Govern would have.

## exp-003 OBSERVE: govern-mode chooseOne microturn always picks "aid"
Deeper investigation of trace-1001 (post-exp-001): ARVN hit 19 govern-mode chooseOne microturns (options `['aid', 'patronage']`) and picked `aid` 19/19 times. Both candidates score 0 in the move-scoped considerations (completion-scoped considerations aren't declared) so stableMoveKey alphabetical tiebreak picks `aid` (a < p).

Reading `data/games/fire-in-the-lake/30-rules-actions.md:5028-5078`:
- `aid` mode: `var.global.aid += population * 3`. Aid is a COIN resource pool, NOT part of the ARVN victory formula.
- `patronage` mode: conditional on more ARVN-troops/police than US-troops in the space; `var.global.aid -= population`, `var.global.patronage += population`. Patronage IS part of ARVN victory (COIN-Controlled Pop + Patronage - 50).

So every `aid`-mode pick yields 0 direct ARVN-margin gain; a `patronage`-mode pick would have yielded +population ARVN margin. Over 19 govern microturns, that's easily +10 to +20 margin left on the table.

The DSL cookbook flags `scopes: [completion]` and `option.value` as "retired" for NEW authoring post-Spec-140, but the engine still evaluates them (they are the only mechanism by which the policy agent can express per-option preferences at a chooseOne microturn). Using the retired pattern is the right tool for this specific gap — the alternative (Tier 2 DSL extension) is much larger scope and addresses a superset problem.

## exp-003: completion-scoped preferPatronageMode
**Category**: conditional-strategy
**Hypothesis**: Adding a library consideration `preferPatronageMode` (`scopes: [completion]`, weight 10, value = boolToNumber(option.value == "patronage")) and listing it in `arvn-evolved` considerations will cause ARVN to pick `patronage` mode whenever legal at govern-mode chooseOne microturns. Expected: every legal patronage mode replaces an aid mode, gaining +population margin per govern. Seed 1001 margin should rise from +11 toward +20+; seed 1000 should gain similarly. lines_delta expected: +10 (one new library item + 1 line in use.considerations). No competing consideration displaces Govern action selection itself.

**Result**: ACCEPT (compositeScore 15.5 -> 21, avgMargin 10.5 -> 16, wins 1/2 unchanged). Seed 1000 margin jumped 10 -> 28 (ARVN dominant win). Seed 1001 surprisingly regressed to margin 4 (VC 9, ARVN lost by 5 instead of 3); patronage mode chosen 54/54 times across seeds as intended.
**Learning**: Hypothesis directionally confirmed, but seed 1001 exposed a dependency I hadn't modeled: patronage mode COSTS aid (`var.global.aid -= population`). ARVN's aid pool gets depleted after many patronage-mode governs, and in seed 1001 this seems to have cut into ARVN's later operations (though patronage cap at 75 was not hit). Seed 1000's starting aid/population mix happens to tolerate this better. Lesson: aid-resource dependency matters late in the govern sequence; worth a future hypothesis about transitioning from Govern to Train once patronage is built up or aid is low.

## exp-004 plan
**Category**: conditional-strategy
**Hypothesis**: Adding `trainWhenPatronageHigh` (weight 10, fires when `feature.patronage > 40`) to the considerations list should cause ARVN to transition from Govern to Train once patronage is substantially built up. Scoring math: when patronage > 40, train totals `preferTrainWeighted(+3) + trainWhenControlLow(+5 if coinControlPop<25, else 0) + trainWhenPatronageHigh(+10) = +13 to +18`, beating govern's `preferGovernWeighted(+10)`. When patronage <= 40, govern still dominates. Expected: seed 1001 shifts some late govern moves to train, building COIN control for the final Coup pacification, raising ARVN margin via COIN-Controlled Pop gain. Seed 1000 already has margin +28 and is past threshold; small impact expected there.

**Result**: REJECT HARD (compositeScore 21 -> 5, wins 1/2 -> 0/2). Both seeds lost. Seed 1000 margin crashed 28 -> 8 (govern 30 -> 17, train 1 -> 14). Seed 1001 margin regressed 4 -> 2 (govern 24 -> 20, train 4 -> 9).
**Learning**: Hypothesis refuted. **Patronage cap is 75 not 50** — the 50 victory threshold is the sum (COIN-Controlled Pop + Patronage), so continuing to govern past patronage=40 keeps adding direct margin up to the 75 cap. Train's value is INDIRECT — it places troops that enable pacification at Coup — but each govern-patronage move is DIRECTLY worth +population margin instantly. Replacing Govern with Train trades direct margin for uncertain future payoff. Lesson: for ARVN, Govern with patronage mode is strictly dominant over Train for direct-margin accumulation until patronage is at/near cap (75). Do not displace Govern with Train.

## exp-004 (rewritten): preferHighPopulationTarget for chooseN space selection
**Category**: conditional-strategy
**Hypothesis**: At the govern-select-spaces-standard chooseN microturn (`maxSpaces: 2`), ARVN currently picks the 1-2 eligible spaces via stableMoveKey alphabetical tiebreak — which can select low-population spaces. Govern-patronage gains `+population` patronage per space, so high-population spaces are strictly better. Adding a completion-scoped consideration `preferHighPopulationTarget` (weight 2, value = `coalesce(zoneProp(option.value, population), 0)`) will score zone-valued options by their population, biasing the chooseN to pick the 2 highest-population eligible spaces. This should apply uniformly to govern, train, patrol, sweep, assault space selections — all benefit from picking high-population spaces. Expected: modest margin uplift on both seeds, no risk of displacing Govern action selection (this is a completion-scope consideration, doesn't contribute at move-level).

**Result**: REJECT (compositeScore 21 -> 16.5, avgMargin 16 -> 11.5, wins 1/2 unchanged). Seed 1000 margin 28 -> 20, seed 1001 margin 4 -> 3 (with VC margin jumping 9 -> 15).
**Learning**: Generic "prefer high-population" backfires because it applies to all zone-selection chooseNs — including those where ARVN should NOT concentrate (e.g., train space selection where spreading troops across lower-value spaces may secure more control). Concentrating in high-pop spaces can also leave low-pop spaces exposed to VC takeover, which is why VC's margin jumped on seed 1001. Lesson: completion-scope consideration that fires across all chooseN microturns must be carefully gated — either by decision.name or by candidate-context so it only affects specific selections. Note: `decision.name`/`decision.type` are flagged 'retired' in the cookbook, but they are the only mechanism for gating. Revisit if a targeted experiment requires them.

## State after exp-005 (3 consecutive rejects since exp-003)
Best = exp-003 (compositeScore=21, avgMargin=16, wins=1/2, tier=2). Failed directions: sweep displacing govern (exp-002), train displacing govern (exp-004), generic high-pop preference (exp-005). Common failure mode: any change that reduces Govern count cuts ARVN margin faster than it gains elsewhere. Any generic completion-scope consideration has unintended cross-action cascades.

Seed 1001 stuck at ARVN margin +4 vs VC +9. Observed VC behavior in seed 1001: 13 rallies + 18 attacks (aggressive VC). VC attacks remove ARVN pieces from controlled spaces, eroding COIN-Controlled Pop. ARVN's patronage gain is offset by COIN-Pop loss via VC attacks.

## exp-006: add preferEvent with eventWeight=5
**Category**: event-evaluation
**Hypothesis**: ARVN's `arvn-evolved` profile lacks `preferEvent` in considerations, so events score 0 from action-tag terms (only the tied preferProjectedSelfMargin baseline applies). ARVN played events only 2/32 operations in seed 1001. Adding `preferEvent` (weight: eventWeight parameter, value = boolToNumber(candidate.tag.event-play)) and setting eventWeight=5 makes events score +5 — less than Govern (+10) so Govern is not displaced, but more than Train+conditional (+3+5=+8 max) so events beat Train/Sweep/Patrol/Assault when Govern isn't available (e.g., Govern exhausted by capability limits). Events have direct margin impact via their effects (patronage shifts, aid gains, remove VC pieces, etc.). Expected: ARVN plays more events; net margin effect depends on which events appear on each seed, but more active event play should gain on average. Low risk: if event quality is poor, only Train-replacement occurs, which already was minor.

**Result**: REJECT (compositeScore=21 = identical to exp-003 best, lines_delta=+2). ZERO-EFFECT: ARVN played the same 2 events in both seeds. Govern's +10 always beat event's +5; the new consideration never tipped a decision. Treated as REJECT (not near-miss) because lines_delta > 0 with no metric change.
**Learning**: Adding a consideration to push a non-dominant action type does nothing when the dominant type is consistently available — no decision flips. To make events meaningful for ARVN, eventWeight would need to exceed Govern's threshold (>10), which would over-promote events; or, Govern would have to actually be unavailable for many turns, which it is not in observed FITL play.

## CAMPAIGN HALTED — Architectural Ceiling
After exp-006, the picture is clear:
- **exp-001** (governWeight 5→10): action-type ranking — gain. Pure macro lever.
- **exp-003** (preferPatronageMode, completion-scoped): tiebreak fix at chooseOne — gain. Pure micro lever (option-equality).
- **exp-002, exp-004, exp-005, exp-006**: every other direction either regresses (when it tries to trade against Govern) or no-ops (when it tries to add a non-dominant signal).

Common diagnostic across all four rejects: NO PER-CANDIDATE MARGIN SIGNAL is available because `preferProjectedSelfMargin` (the largest scoring weight in every shipped profile) is dead — `preview.victory.currentMargin.self` resolves `unresolved` for every action-selection candidate post-Spec-140.

Verified in code (not assumed): `packages/engine/src/agents/policy-preview.ts:172-180` rejects every `pendingAdmissible` action-selection as `notDecisionComplete`; `policy-preview.ts:406-448`'s `tryApplyPreview` calls `applyMove` with `advanceToDecisionPoint: false`, so even a non-rejected candidate's preview state sits at the very first inner microturn with no params bound. `coalesce` falls through to the pre-move margin, identical for every candidate.

Decision (campaign halted by user, 2026-04-25): the architectural fix is more valuable than continuing to squeeze Tier 1. Wrote `specs/145-bounded-synthetic-completion-preview.md` proposing a bounded synthetic-completion driver for action-selection candidates (depth-capped, top-K-gated, two completion policies — greedy default, agentGuided opt-in). After Spec 145 lands the campaign can resume with `preferProjectedSelfMargin` actually working.

### Final Campaign State
- **Best**: exp-003 (governWeight=10 + preferPatronageMode completion-scoped). compositeScore=21 at tier 2 (seeds 1000-1001), avgMargin=16, wins=1/2.
- **Tier**: 2 (advanced once after exp-001 won seed 1000).
- **Accepted experiments**: 2 (exp-001, exp-003). Plus 1 infra commit (sync-fixtures.sh post-Spec-140 API fix).
- **Rejected experiments**: 4 (exp-002, exp-004, exp-005, exp-006).
- **Confirmed unwinnable at current architecture**: seed 1001 (ARVN +4 vs VC +9) — flagged for re-evaluation post-145.

# FITL VC Agent Evolution — Musings

Experiment hypotheses, results, and learnings.

## Baseline Observations
- compositeScore=9.0667 (avgMargin=0.4, winRate=86.7%, 13/15 wins)
- **CRITICAL**: preview.victory.currentMargin.self shows as unknownRefId in ALL moves — projected margin preview is non-functional. Agent falls back to current margin via coalesce. This severely limits the projectedMarginWeight parameter's usefulness.
- Most VC turns have very few legal moves (1-3 candidates). The attack move had 41 candidates.
- Win margin is low (0.4 avg) despite high win rate — room to win by more.

## exp-001: Boost Rally and Tax action weights
**Category**: action-priority (UCB1 score: infinity — first attempt)
**Hypothesis**: VC's economic engine is Rally (grow guerrillas, place bases) and Tax (gain resources). Currently all actions weighted equally at 1. Boosting Rally (weight 3) and Tax (weight 2) should prioritize the economic engine, leading to more bases and opposition, increasing both win margin and win rate.
**Result**: ACCEPT (9.0667 -> 10.5333, +16.2%)
**Learning**: Prioritizing the VC economic engine (Rally+Tax) over combat actions is clearly better. avgMargin jumped from 0.4 to 1.2, winRate from 86.7% to 93.3%. Rally weight 3 and Tax weight 2 successfully redirects the agent toward base-building and resource-gathering. The golden fixture files need regeneration whenever policy YAML changes — this is expected overhead.

## exp-002: Conditional Tax preference when resources low
**Category**: conditional-strategy (UCB1 score: infinity — first attempt)
**Hypothesis**: VC should Tax when resources are low (< 5) to fuel the Rally engine. Adding a conditional scoreTerm with `when: selfResources < 5` and high weight for Tax should improve resource management, enabling more Rallies in subsequent turns.
**Result**: NEAR_MISS (10.5333 -> 10.5333, 0% change). Stashed.
**Learning**: Conditional Tax preference when poor did not measurably improve score. Possible reasons: (1) the existing Tax weight of 2 already encourages Tax enough, (2) VC may already Tax naturally when resources are low because other actions cost more, (3) the threshold of 5 may not be the right cutoff. The stash could be combined with other changes later.

## exp-003: Reduce Attack and Terror weights to 0.5
**Category**: action-priority (UCB1 score: 2.178)
**Hypothesis**: Attack and Terror are tactical/defensive actions that don't directly increase VC opposition or bases. Reducing their weight from 1.0 to 0.5 should steer the agent further toward Rally/Tax. With Rally=3, Tax=2, and combat actions at 0.5, the agent should strongly prioritize the economic engine.
**Result**: NEAR_MISS (10.5333 -> 10.5333, 0% change). NOT STASHED (rolled back — conceptually same direction as exp-001 tweaks).
**Learning**: Reducing Attack/Terror weights to 0.5 didn't change outcomes. The games are likely decided by a small number of key decisions. The agent is already winning 14/15, so further action priority changes may hit diminishing returns. Need to look at WHY the 1 lost game was lost — different angle needed.

**Key insight**: projectedSelfMargin uses a coalesce fallback to selfMargin because preview is broken (unknownRefIds). Since selfMargin is the SAME for all candidates at a decision point, projectedMarginWeight=1 contributes a constant offset that doesn't differentiate moves. It's effectively useless.

## exp-004: Boost eventWeight from 1.5 to 4
**Category**: event-evaluation (UCB1 score: infinity — first attempt)
**Hypothesis**: Events in FITL can be transformative for VC (shifting opposition, placing pieces). With Rally at weight 3, the current eventWeight=1.5 means events are deprioritized vs Rally. Boosting to 4 should make the agent strongly prefer events when available, potentially capturing high-impact plays that flip games.
**Result**: NEAR_MISS (10.5333 -> 10.4, -1.2%). Not stashed.
**Learning**: Boosting event preference to 4 slightly hurt margin (-0.13). Events may not always be beneficial for VC — some events help opponents. The indiscriminate event boost is counterproductive. Would need event-discriminating logic (shaded vs unshaded, VC-favorable events) but that's beyond current DSL.

## exp-005: Boost March weight to 2 + set projectedMarginWeight to 0
**Category**: action-priority (UCB1 score: 1/2 + 1.414*sqrt(ln(4)/2) = 0.5 + 1.18 = 1.68)
**Hypothesis**: Two changes: (1) March spreads VC guerrillas into new spaces, directly increasing opposition footprint for the victory formula. Weight 2 should prioritize expansion. (2) projectedMarginWeight is useless because preview is broken — all candidates get the same constant. Setting to 0 eliminates noise and lets other scoreTerms differentiate better.
**Result**: NEAR_MISS (10.5333 -> 10.5333, 0%). Not stashed.
**Learning**: March weight boost and removing projectedMarginWeight had zero effect. The score is locked at 14/15 wins, avgMargin 1.2. Weight-only changes seem to have hit a ceiling. The OBSERVE phase protocol says to check the trace for suboptimal decisions — let me do that next. Need a fundamentally different approach: either DSL extension or pruning rules.

**Deep trace analysis**: Within the same action type, ALL candidates score identically (e.g., 27 Attack moves tied at -2.4). Tiebreaker (stableMoveKey) arbitrarily picks a target. This is because features only differentiate action TYPES, not action TARGETS. To break this ceiling, need candidate-level differentiation: preview (broken), candidateParam (requires DSL extension), or zoneTokenAgg (state-level, not candidate-level).

## exp-006: Aggressive economic params + higher resourceWeight
**Category**: combined (UCB1 score: infinity)
**Hypothesis**: Push the economic engine to the extreme. Rally=5, Tax=3 to maximize base-building and resource generation. Set resourceWeight=0.1 (was 0.03) to better preserve resources for future operations. Remove March bonus (keep at 1) since Rally is more directly impactful for VC. Set event=1 since indiscriminate event preference hurts.
**Result**: NEAR_MISS (10.5333 -> 10.5333, 0%). Not stashed.
**Learning**: Even extreme parameter changes produce identical scores. The 15-seed tournament is deterministic — the same seeds produce the same game trees. Weight changes only affect which action TYPE is chosen, not which action TARGET. Since most VC turns have few candidates or all candidates of the same type score identically, the outcomes are invariant to weight changes once Rally is preferred.

## PLATEAU ANALYSIS (after 5 consecutive non-accepts)
**Root cause**: Weight-only changes (Tier 1) have hit a hard ceiling. The agent's decisions are dominated by:
1. Action-type selection: Rally already wins with weight 3, further boosting doesn't help
2. Target selection within action: ALL candidates of the same type score identically, tiebreaker is arbitrary
3. Preview system broken: projectedSelfMargin falls back to constant, providing zero differentiation

**Strategy shift**: Move to `radical` — investigate DSL extension (Tier 2) to fix candidate-level differentiation. The highest-leverage change would be fixing the preview system so projectedSelfMargin works.

## Seed Analysis
- Seed 1009: VC margin=-8, won=false, stop=noLegalMoves, only 3 moves. This is an engine edge case — very early game termination. Can't fix without engine changes (immutable).
- All other 14 seeds: VC wins with margin 1-2 consistently. Margins tightly clustered.
- To improve compositeScore beyond 10.5333, need either: (a) win seed 1009 (requires engine change), (b) increase winning margins above 2.

## exp-007: Enable preview via Tier 2 — investigate why preview returns unknown
**Category**: dsl-extension (UCB1 score: infinity — first attempt)
**Hypothesis** (revised): Instead of fixing preview (complex Tier 2), use `rng` tiebreaker instead of `stableMoveKey`. Currently, when multiple candidates score equally, `stableMoveKey` always picks the lexicographically first one — deterministically choosing the same target regardless of game state. Randomizing target selection explores the action space more uniformly across 15 seeds, potentially finding better average outcomes.

**Preview investigation findings**: All non-pass moves are classified as `notDecisionComplete` by the viability probe. FITL actions have complex nested decision trees — even with all decisions provided in params, the probe re-discovers decision points. This is a fundamental engine limitation, not fixable without significant Tier 2 work.
**Result**: NEAR_MISS (10.5333 -> 10.4, -1.3%). Not stashed.
**Learning**: Random tiebreaking was slightly WORSE than deterministic stableMoveKey for these 15 seeds. The deterministic selection happens to favor VC on this seed set. Random explores uniformly but doesn't benefit from seed-specific favorable determinism. Since the harness uses fixed seeds, randomization hurts more than helps.

## exp-008: Remove projectedMarginWeight (dead code) + remove preserveResources (minimal impact) — simplification
**Category**: combined (UCB1 score: 0/1 + 1.414*sqrt(ln(7)/1) = 1.97)
**Hypothesis**: projectedMarginWeight is provably useless (preview broken, constant for all candidates). preserveResources has weight 0.03, providing negligible signal. Removing both simplifies the profile without meaningful score loss. If compositeScore stays within 0.3, this is an ACCEPT as simplification (lines_delta < 0).
**Result**: ACCEPT (10.5333 = 10.5333, simplification -4 lines)
**Learning**: Confirmed projectedMarginWeight and preserveResources are dead weight — removing them has zero impact on outcomes. The profile is cleaner now: eventWeight(1.5), rallyWeight(3), taxWeight(2), plus fixed-weight actions.

## exp-009: Remove Subvert from scoreTerms (prune by omission) + remove March/Attack/Terror to focus only on Rally/Tax/Event
**Category**: pruning (UCB1 score: infinity — first attempt)
**Hypothesis**: The VC profile has 7 scoreTerms that give weight to different actions. But only 3 matter: Rally (build guerrillas/bases), Tax (fund operations), Event (high-impact plays). The other actions (March, Attack, Terror, Subvert) score 1 each. When these are the only candidates available, they all tie and stableMoveKey picks. By removing their scoreTerms, these actions score 0 instead of 1. They'll still be chosen when they're the only option (no alternative besides pass which is pruned). But when competing with Rally/Tax/Event, they'll always lose — which is the desired behavior.
**Result**: ACCEPT (10.5333 = 10.5333, simplification -4 lines)
**Learning**: Removing March/Attack/Terror/Subvert scoreTerms has zero impact. Confirms that in decision points where these compete with Rally/Tax/Event, Rally/Tax always won anyway (Rally=3 >> all=1). The profile is now minimal: only Rally(3), Tax(2), Event(1.5).

## exp-010: Remove dropPassWhenOtherMovesExist + remove pruningRules entirely
**Category**: pruning (UCB1 score: 1/1 + 1.414*sqrt(ln(9)/1) = 1 + 2.10 = 3.10)
**Hypothesis**: With only Rally(3), Tax(2), Event(1.5) as scoreTerms, all other actions score 0. Pass also scores 0 (no scoreTerm for it). The `dropPassWhenOtherMovesExist` rule prunes pass, but since pass has the same score (0) as non-scored actions, it would tie anyway. Removing the pruning rule simplifies without impact. Lines delta = -3.
**Result**: CRASH (simulation hung — infinite pass loop)
**Learning**: CRITICAL — pass scores 0 and ties with unscored actions. But stableMoveKey picks alphabetically, and "pass" comes before many action names. Without the pruning rule, the agent picks pass over unscored actions in tie situations. When ALL players do this, the game never terminates. The `dropPassWhenOtherMovesExist` pruning rule is ESSENTIAL — never remove it.

## exp-011: Reduce Rally=2, Tax=1.5 (threshold test)
**Category**: action-priority (UCB1: 2/5 + 1.414*sqrt(ln(10)/5) = 0.4 + 0.96 = 1.36)
**Hypothesis**: Testing if the exp-001 improvement was a threshold effect. If Rally=2 instead of 3 produces the same score, the minimum needed preference is lower (simpler). If it produces a worse score, the higher weight is doing real work.
**Result**: NEAR_MISS (10.5333 = 10.5333, 0 lines delta)
**Learning**: Confirmed threshold effect — Rally=2 produces identical results to Rally=3. The improvement in exp-001 was from Rally having ANY preference over unscored actions, not from the specific weight value. The ranking is: Rally(any >1.5) > Tax(any >1.5) > Event(1.5) > unscored(0). As long as this ranking holds, the specific weights don't matter.

## COMPREHENSIVE CEILING ANALYSIS
After 11 experiments, the compositeScore is firmly locked at 10.5333 (14/15 wins, avg margin 1.2). Proven:
1. Weight changes (Rally 2-5, Tax 1.5-3, Event 1-4, March 1-2): zero effect
2. Removing all non-essential scoreTerms: zero effect
3. Removing dead projectedMarginWeight and preserveResources: zero effect
4. Random vs deterministic tiebreaker: slight regression
5. Seed 1009: unfixable engine edge case (noLegalMoves after 3 moves)

The **fundamental ceiling** is caused by:
- No candidate-level differentiation (preview broken, all candidates of same action score equally)
- Fixed-seed determinism (same seeds always produce same game trees)
- Tight margin clustering (all wins at margin 1-2, determined by Coup-phase victory check timing)

**To break this ceiling**: Need Tier 2 DSL extension enabling candidate-level features (e.g., spatial awareness, target quality scoring). This is beyond simple YAML changes.

## exp-012: Tier 2 — Fix preview bypass in policy-preview.ts
**Category**: dsl-extension (UCB1 score: 0/1 + 1.414*sqrt(ln(11)/1) = 2.19)
**Hypothesis**: The preview system rejects ALL non-pass moves because `classifyPlayableMoveCandidate` returns `notDecisionComplete` — the kernel probe doesn't recognize pre-resolved decisions in params. Fix: modify `policy-preview.ts` (agents layer, Tier 2 mutable) to bypass the probe for legal moves and directly apply them with `applyTrustedMove`. This would make projectedSelfMargin actually work, enabling candidate-level differentiation and breaking the weight ceiling.
**Split-commit policy**: DSL infrastructure (preview fix) committed separately from policy YAML changes.
**Result**: REJECT (preview bypass fails — legal moves at enumeration are templates without inner decisions resolved)
**Learning**: The preview system can't be fixed with a simple bypass because legal moves are TEMPLATES — they only have the outer action selection, not inner choices ($targetSpaces, $movingGuerrillas, etc.). Preview runs at the template level (before completion), but applying templates fails because inner choices are missing. To fix preview properly would require move completion BEFORE scoring, which is the expensive `evaluatePlayableMoveCandidate` path. This is a fundamental agent architecture limitation, not something the campaign can address.

## FINAL CEILING ANALYSIS
compositeScore=10.5333 is the hard ceiling for Tier 1+2 changes. Proven through:
- 10 weight/parameter experiments: all identical at 10.5333 (threshold effect)
- Preview system: unfixable without architectural change to move completion ordering
- Seed 1009: unfixable engine edge case
- Winning margins: locked at 1-2 by Coup-phase victory check timing
- Random tiebreaker: slight regression

The only remaining path to improvement would be a major Tier 2 change: refactoring the agent to complete moves BEFORE scoring (evaluatePlayableMoveCandidate path). This would allow preview to work but would significantly change the agent architecture and performance profile.

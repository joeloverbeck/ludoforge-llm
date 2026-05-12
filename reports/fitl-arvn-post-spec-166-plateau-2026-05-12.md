# FITL ARVN — Post-Spec-166 Plateau & Action-Quality Architectural Gaps

**Date**: 2026-05-12
**Reported from**: `fitl-arvn-agent-evolution` improve-loop campaign (worktree `.claude/worktrees/improve-fitl-arvn-agent-evolution`, branch `improve/fitl-arvn-agent-evolution`)
**Status**: Open — architectural-gap halt invoked at exp-004, presenting evidence for user direction
**Severity**: Medium — campaign metric ceiling at `compositeScore=-3.8`; the action-coverage and event-quality gaps are real but not engine-breaking
**Prior related reports**:
- `reports/agent-candidate-param-discrimination-gap-2026-05-11.md` — resolved by spec-166 (PR #255); side-discrimination now functional
- `reports/agent-candidate-param-proposal.md` — original deep-research proposal
- `reports/fitl-coup-victory-checkpoint-bug-2026-05-11.md` — resolved by commit `edb7a68f6`; multi-coup victory path now reachable

---

## 1. Executive summary

The post-spec-166 ARVN campaign session ran 4 experiments verifying the new `candidate.params.side` ref family **works as designed** (1 architectural verification), exploring the user's directive to encourage event use with correct side selection (2 event-evaluation experiments), and probing whether Govern's static weight dominance is the structural ceiling (1 action-priority experiment, NEAR_MISS).

The metric did not move beyond the tier-15 baseline of `-3.8`. The findings, however, are informative and warrant the user's attention because they identify what spec-166 fixed, what it cannot fix on its own, and where the next architectural lever likely lies.

**Top-level findings**:
1. **spec-166 verified functional**: `candidate.params.side` resolves end-to-end on a live profile (exp-001 contribution check: `avoidShadedEvent` applied `-800` to shaded variants, `0` to unshaded).
2. **"Always prefer unshaded" is a partial heuristic**: at least two FITL event cards (`card-63` Fact Finding, `card-87` Cripps) have shaded branches that genuinely benefit ARVN OR that preview undervalues vs. the unshaded alternative. Side-discrimination alone is not the complete event-quality signal.
3. **Govern dominance is structurally robust to small perturbations**: lowering `governWeight` from `1000` to `500` (exp-004) produced **zero behavioral change** — same action distribution, same metric. The 500-point reduction was insufficient to displace any decision; non-Govern actions score 500-1000 below Govern even after the reduction.
4. **Profile structural coupling**: `preview.inner.chooseOne` / `chooseNStep` opt-in requires at least one microturn-scope consideration consumer. Detected by `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` when `preferOptionProjectedMargin` was removed in isolation (exp-003 CRASH). This is correct compiler behavior, but it limits ablation tests of inner-preview-enabled profiles.

The 4-experiment evidence is thinner than the prior session's; it nevertheless triangulates the boundary of what spec-166 unlocked. The right next move is a user decision: pursue a deeper architectural fix (branch-aware discrimination, preview-fidelity work, conditional-action expansion), or accept the current ceiling and shift the campaign's optimization target.

---

## 2. What spec-166 fixed (and the cookbook now demonstrates)

**Worked example from exp-001** (`avoidShadedEvent` cookbook recipe applied to `arvn-evolved`):

```yaml
avoidShadedEvent:
  scopes: [move]
  appliesToActions: [event]
  weight: -800
  value:
    boolToNumber:
      eq:
        - { ref: candidate.params.side }
        - shaded
  candidateParamFallback:
    onUnavailable: noContribution
```

Trace-level verification (`campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json`, exp-001):

| Decision 0 candidate | `stableMoveKey` (truncated) | `score` | `avoidShadedEvent` contribution |
|---|---|---|---|
| event card-68 shaded | `event\|{"eventCardId":"card-68",...,"side":"shaded"}\|...` | `-5300` | `-800` |
| event card-68 unshaded (irregulars branch) | `event\|{...,"side":"unshaded","branch":"place-irregulars-and-support"}\|...` | `-4500` | `0` |
| event card-68 unshaded (rangers branch) | `event\|{...,"side":"unshaded","branch":"place-rangers-and-support"}\|...` | `-4500` | `0` |

The ref family resolves correctly, fires `appliesToActions` filter as designed, and produces the expected per-variant contribution.

**Net side distribution change at the 15-seed corpus level**:
- Baseline (no consideration): 9 event picks, distribution unknown (not directly traced post-fix, but the prior session report cited ~40% shaded)
- exp-001 (`avoidShadedEvent` alone): 9 picks, 6 unshaded / 3 shaded (66% unshaded, up from baseline ~60%)
- exp-002 (`preferEvent` + `avoidShadedEvent`): 12 picks, 8 unshaded / 4 shaded (66% unshaded, same ratio, more events overall)

Spec-166 reliably reshuffles event picks toward unshaded. The architectural enabler works.

---

## 3. What spec-166 cannot fix on its own

### 3.1 Side ≠ branch ≠ quality

The empirical observation: 3 of the 9 event picks in exp-001 **remained shaded** despite the `-800` penalty. The preview margin gap on those cards exceeded the static penalty.

#### 3.1.1 Card-63 "Fact Finding" — shaded is **correct** for ARVN

`data/games/fire-in-the-lake/41-events/033-064.md:4807-4820`:

- **Unshaded**: "2 US pieces from out-of-play to South Vietnam, or transfer a die roll from Patronage to ARVN Resources. Aid +6."
- **Shaded**: "Remove Support from a COIN-Controlled City outside Saigon. Patronage +4 or VC Resources +4."

The shaded branch `rm-sup-patronage` gives ARVN **+4 Patronage** — a direct increment to ARVN's victory metric (`COIN-Controlled Population + Patronage > 50`). The unshaded grants Aid (resources, not victory-track). The agent's preview correctly identifies shaded card-63 as ARVN-favorable; `avoidShadedEvent` then *incorrectly* suppresses it.

This is **the user's "always unshaded" mental model breaking down**. Side encodes a COIN-vs-Insurgent semantic, but within a side, branches can carry per-faction-tailored sub-effects. For ARVN specifically, anywhere a shaded branch yields direct Patronage, the preference inverts.

#### 3.1.2 Card-87 "Cripps" — unshaded is **correct** but preview undervalues it

`data/games/fire-in-the-lake/41-events/065-096.md:4251` ff:

- **Unshaded**: "Place 3 ARVN pieces within 3 spaces of Hue. Shift receiving spaces each 1 level toward Active Support."
- **Shaded**: "Replace any 2 ARVN with any 2 VC pieces within 2 spaces of Hue. Patronage +4 or -4."

The unshaded is unambiguously ARVN-favorable: 3 ARVN placements + Active Support shifts directly improve COIN-Controlled Population. The shaded loses 2 ARVN troops and offers a binary +4/-4 Patronage swing.

Yet the agent picks shaded card-87 even with `avoidShadedEvent = -800`, meaning preview at `depthCap=4` ranks shaded ≥ 800 score points above unshaded. The preview is **undervaluing token-placement effects** vs. **Patronage-delta effects**. Token placement affects victory only after subsequent Coup phases (multi-turn horizon); the 4-ply inner-preview synthetic completion does not project that far.

This is the "second-order issue" the prior report flagged in §3.5 — at uniform-or-misleading margin frontiers, the agent has no recourse but the hand-tuned action-class boosts. With spec-166 in hand, the *side* dimension is now discriminable, but the **branch + effect-class quality** dimensions remain opaque.

#### 3.1.3 Card-8 unshaded — even unshaded picks can be wrong

`exp-002` trace seed 1012: card-8 unshaded picked → `marginDelta=-5`. The agent enthusiastically picked an unshaded variant whose actual marginal value was substantially negative. Side-discrimination did not protect against this — it only filters by side, not by quality within side.

### 3.2 Govern dominance is structurally robust

**exp-004 result**: `governWeight: 1000 → 500` produced **zero behavioral change** across 15 seeds.
- compositeScore: -3.8 → -3.8 (identical)
- Action distribution: 118 govern, 24 train, 10 event (4 shaded, 6 unshaded), 6 transport (identical to baseline)

The reason: even at `governWeight=500`, Govern's baseline projection-margin score still puts it `500-1000` ahead of all non-Govern actions at action-selection time. To displace Govern would require either:
- `governWeight < 200` (risky — prior global lessons warn against Govern displacement on seed 1000)
- A state-conditional reduction (e.g., `discourageGovernWhenPatronageHigh`) — requires new conditional consideration
- Per-action conditional boosts that selectively elevate Patrol / Sweep / Assault when their preview-margin would otherwise lose — requires new library items and per-game state-feature wiring

The user's directive that "all possible operations [should be] used where it would make sense" runs directly into this structural ceiling. Within the current authoring surface, the only practical knob to broaden action diversity is to add hand-tuned conditional considerations per action × state-feature combination. The prior report estimated this scales linearly with action × condition cross-product; the campaign data confirms small static-weight perturbations have no effect at the action-selection frontier.

### 3.3 Inner-preview opt-in requires microturn-scope consumer

**exp-003 CRASH**: removing `preferOptionProjectedMargin` from `arvn-evolved` (the only microturn-scope consideration) triggered `CNL_COMPILER_AGENT_PREVIEW_INNER_OPT_IN_NO_OPTION_CONSIDERATION` at `profiles.arvn-evolved.preview.inner.chooseOne` and `preview.inner.chooseNStep`.

This is correct compiler behavior — opting into inner preview without any consumer is wasteful and signals authoring error. But it does mean:
- Ablation tests of inner-preview-enabled profiles must remove the inner-preview opt-in together with the microturn consideration; they cannot remove either in isolation.
- The `preferOptionProjectedMargin` consideration is *structurally* required while `preview.inner.chooseOne` is enabled, regardless of whether it is empirically load-bearing for the metric.

This is documented architectural correctness, not a gap. Surfaced here to record it for future authors.

---

## 4. Experiment ledger

| ID | Category | Change | Result | metric | Δ | Status |
|---|---|---|---|---|---|---|
| tier-15-baseline | baseline | post-spec-166 baseline | wins 3/15 | -3.8 | 0 | BASELINE |
| exp-001 | event-evaluation | add `avoidShadedEvent` (-800) | events shift 6 unshaded / 3 shaded; some unshaded picks net-negative | -3.9333 | -0.1333 | REJECT |
| exp-002 | event-evaluation | combined `preferEvent` (eventWeight=500) + `avoidShadedEvent` | events 9→12; seed 1001 +2, seed 1012 -2; net wash | -3.9333 | -0.1333 | REJECT |
| exp-003 | ablation | remove `preferOptionProjectedMargin` | compiler rejected — structural coupling with preview.inner | null | n/a | CRASH |
| exp-004 | action-priority | `governWeight` 1000→500 | zero behavioral change; same action distribution | -3.8 | 0 | NEAR_MISS (stashed) |

Source rows in `campaigns/fitl-arvn-agent-evolution/results.tsv`.

---

## 5. Fix options for the user to consider

Each option is a candidate next direction. None is mutually exclusive.

### Option A — Extend candidate-param surface to declare `branch`

Per spec-166 §2.3, the FITL `event` action declares `params: [eventCardId, eventDeckId, side]` but **not** `branch` ("optional `branch` param remains undeclared under the current required-param contract because branchless event moves are legal"). Extending the declaration to include `branch` with `onMissing` semantics (per the cookbook's "Optional-Style Param With `onMissing`" recipe) would unlock per-branch discrimination at action-selection scope.

A profile could then write:
```yaml
preferPatronageBranch:
  scopes: [move]
  appliesToActions: [event]
  weight: +500
  value:
    boolToNumber:
      in:
        - ref:
            candidate.params.branch:
              onMissing:
                kind: constant
                value: __absent__
        - [rm-sup-patronage, aid-minus-10-patronage-plus-3, ...]
  candidateParamFallback:
    onUnavailable: noContribution
```

**Pros**: Direct extension of spec-166's surface. Closes the card-63 "shaded-but-good" case empirically. Reuses the `onMissing` constant pattern already in the cookbook.
**Cons**: Per-branch identifiers are per-game per-card — profiles would enumerate `rm-sup-patronage`, `aid-minus-10-patronage-plus-3`, etc. — which is finer-grained than `side` and may violate the spirit of "agnostic engine, generic refs." A profile authored against 130 branched cards becomes large.
**Foundation alignment**: §1 (engine agnostic — branch is still a typed scalar param), §6 (schema generic — declaration lives in game data), §20 (state-local, no preview). **Mostly aligned.**

### Option B — Inner-preview depth increase for events specifically

Adopt `continuedDeepening` (spec-164) + `deep1024` cap class for the `event` action only. Deeper preview should resolve event-card effects through their immediate state changes plus 1-2 subsequent factions' responses, which would let preview *correctly* rank card-87 unshaded above shaded for ARVN.

**Pros**: Generic — no game-specific knowledge; spec-164 machinery already exists and is documented functional (local lesson 1).
**Cons**: Continued-deepening at `deep1024` is computationally expensive. The campaign's harness runtime (~11 min for 15 seeds) would extend significantly. Action-class boosts may still dominate at the preview-uniform frontiers that aren't depth-limited.
**Foundation alignment**: §10 (bounded — within deep1024 cap), §20 (preserved by spec-164). **Aligned, with budget cost.**

### Option C — Conditional-action library expansion (no engine changes)

Author new conditional considerations in `92-agents.md`'s library to selectively boost underused actions:
- `preferAssaultWhenEnemyConcentrated` — when a zone has ≥3 VC pieces and ARVN can target it, boost assault
- `preferPatrolWhenGuerrillasUnderground` — when underground guerrillas are detectable, boost patrol
- `preferSweepWhenAdjacentEnemies` — adjacent-enemy state feature, boost sweep
- `discourageGovernWhenPatronageHigh` — negative-weight govern when patronage > 30, to enable mid-game diversification

Each consideration is a YAML-only addition. Per-game state features may need to be added (per FOUNDATIONS — game-side, not engine-side).

**Pros**: Most aligned with FOUNDATIONS (zero engine changes). Composable per game.
**Cons**: O(actions × conditions) authoring scaling. Each conditional requires both a state-feature definition and a tuned weight. Time-consuming and seed-overfitting-prone without careful tier-wise validation.
**Foundation alignment**: §1, §7 (data not code), §10. **Fully aligned.**

### Option D — Accept the ceiling, shift campaign target

The campaign has been at `compositeScore=-3.8` for multiple sessions. The tier-15 ARVN-evolved profile (5 considerations, governWeight=1000) is well-tuned to the metric within current architectural surfaces. Possible alternative campaign targets:
- **Promote arvn-evolved to arvn-baseline** (per `program.md` Campaign Completion section) and end the campaign.
- **Re-formulate the metric** — e.g., add a "diverse-action bonus" to compositeScore so the optimizer is rewarded for action diversity beyond wins.
- **Spawn a sibling campaign** targeting US, VC, or NVA faction evolution where the action-quality landscape may differ.

**Pros**: Frees the operator from chasing a ceiling. Recognizes that the current architectural surface has been pushed near its limit.
**Cons**: Concedes the user's directive about action coverage. The 3/15 win rate is mediocre — the underlying agent is still beatable by the baseline factions.

### Option E — A combined option: B + C in parallel

Increase event preview depth (B) + author 2-3 high-value conditional considerations for underused actions (C). This is the most thorough but slowest path.

---

## 6. Recommendation

I recommend **Option C as the immediate next move**, scoped narrowly to 1-2 conditional considerations (not the full cross-product). Specifically:

1. Add `discourageGovernWhenPatronageHigh` (weight -500 when patronage > 30) to break Govern dominance only in late-game states where Patronage has diminishing returns.
2. Add `preferAssaultWhenEnemyConcentrated` (or similar) to give one specific underused action a state-conditional path to win action selection.

Rationale: this is the **lowest-architectural-cost** path that addresses the user's directive about action diversity. Option A (branch declaration) is structurally clean but adds per-game complexity; Option B (deeper preview) addresses a different gap (preview fidelity) but at significant runtime cost. Option C buys empirical signal at low risk.

If Option C yields measurable improvement, escalate to combined Options B + C. If Option C also plateaus, the campaign has likely reached a genuine architectural ceiling and Option D (promote + close) is appropriate.

---

## 7. Open questions for the user

1. **User's "virtually always unshaded" — was this domain-knowledge intuition or empirical observation?** The evidence shows the heuristic is partial. If the user has strategic context that confirms specific cards (other than 63 and 87) where the heuristic fails, that would refine future side-vs-branch experiments.
2. **Acceptable runtime budget for spec-164 deep1024 preview on events?** A 30s → 90s harness cost per experiment is one tradeoff lever; the campaign's 4 experiments today took ~45 minutes total — deepening events alone would add maybe 15-25%.
3. **Is the campaign goal (a) maximize compositeScore, or (b) also maximize action-diversity coverage?** These are not perfectly correlated; the empirical evidence suggests the current `compositeScore` plateau and the user's diversity directive may pull in different directions.
4. **Should this report trigger a new spec?** If Option A or Option C is approved, a small spec (or set of tickets) would be appropriate. Otherwise this report stands as a campaign-state document.

---

## 8. Adjacent observations

- The prior session's local lesson_2 noted "FITL Govern per-option delta uniform=0 at deep1024" — i.e., even deeper preview does not differentiate Govern target zones because each Govern grants +1 Patronage regardless of target. This is a **per-option** uniformity, not a preview-depth limitation. Solving it requires per-zone scoring (spec 163 lookups can do this — there is a working precedent in local lesson_4 that surfaces zone population via `lookup.surface: policyState`). Not directly part of this report but flagged because it shapes Option C's design space.
- `preferOptionProjectedMargin` is structurally required (per exp-003 CRASH) but local lesson_2 also says Govern target deltas are uniform at deep1024. So the consideration is structurally mandatory but may produce uniform contributions — a degenerate-but-required signal. This is worth tracking but is not the primary gap.
- Worktree branch `improve/fitl-arvn-agent-evolution` is at commit `494a53d99` (baseline) plus 4 experiment commits rolled back. Stashed: 3 entries (latest is exp-004 governWeight=500 zero-effect).

---

## 9. Status

Campaign loop is **paused** at exp-004 (NEAR_MISS, stashed). All experimental changes have been rolled back; the worktree is at the post-spec-166 baseline state. Awaiting user direction per Options A-E above.

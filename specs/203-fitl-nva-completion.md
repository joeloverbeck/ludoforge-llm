# Spec 203 — FITL NVA Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `nva-baseline` has 5 plan templates, 4 strategy modules, 3 guardrails, and 2 profile-quality witnesses, vs. ARVN's 6/8/7/10. The competence report (`reports/fitl-competent-agent-ai.md` §3) requires NVA to be encoded as a conventional/logistics insurgent that builds the Trail, masses force for NVA Control in populated spaces, uses Laos/Cambodia as a highway, distinguishes "build NVA strength" from "steal VC assets" when Infiltrating, and uses Bombard/Attack/Ambush selectively. The most important gap the report names is the **VC-rival filter**: `Infiltrate` reduces Opposition and converts VC infrastructure, so Infiltrate without alliance-rival posture looks malicious. None of this is fully encoded today.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. No engine work. Consumes shared scaffolding from Spec 201.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `reachable`/`adjacent` for March/Infiltrate route binding
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates`
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe for March+Infiltrate / March+Ambush
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — `shared.*` modules and lifecycle conditions

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27). This spec adopts the proposal's §5 NVA faction-by-faction analysis + §6.8 NVA plan-template slice + §§6.9–6.10 NVA posture and guardrail slices.

**Ticket namespace**: `203FITLNVACOMP`

---

## 1. Goal

Complete `nva-baseline` to ARVN-parity by authoring the plan templates, strategy modules, posture evaluators, and witnesses that encode the NVA competence requirements from `reports/fitl-competent-agent-ai.md` §3. Concretely:

1. **New NVA plan templates**:
   - `nva.rallyTrail` — Rally action prioritizing Trail improvement and Laos/Cambodia Base placement.
   - `nva.marchControl` — March to seize NVA Control in populated spaces; uses `reachable` for route binding and `distinctOriginDestination`.
   - `nva.marchInfiltrateControl` — March + Infiltrate to build NVA Troops/Control; gates on NVA-only gain.
   - `nva.infiltrateVcOnlyWhenRational` — Infiltrate target binding that ONLY fires when VC-takeover improves NVA score or denies VC near-win.
   - `nva.marchAmbush` — March + Ambush adjacency pattern.
   - `nva.attackAmbush` — Attack with Ambush selector for guaranteed removal.
   - `nva.bombardCoinStack` — Bombard target binding for concentrated COIN Troops/Bases.
   - `nva.terrorSupportReduction` — Terror for denial / Rally-space opening (not for scoring).
   - `nva.eventLogisticsOrControlSwing` — Event template.

2. **New NVA strategy modules**:
   - `nva.baseNetwork` — gates Rally/Infiltrate templates when NVA base count is below per-profile threshold; promotes Highland/Jungle Base placement.
   - `nva.takeControl` — promotes high-pop control-swing March targets when NVA-margin trails.
   - `nva.conventionalPressure` — promotes Bombard/Attack+Ambush when concentrated COIN stack is near a critical NVA position.
   - `nva.vcRivalRisk` — when VC is near win, suppress `nva.infiltrateVcOnlyWhenRational`'s VC-Opposition-reducing targets in favor of VC-Base-stealing targets; promote denial.

3. **New NVA posture evaluators**:
   - Strengthen `nva.protectLogisticsAndBases` (already present) with `nva.preserveTrail` explicit `prefer` term over projected Trail delta.
   - Add `nva.avoidVcKingmaking` — demotes candidates that improve VC margin when VC near win.

4. **New NVA guardrails**:
   - `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` — vetoes Infiltrate-on-VC-base when neither NVA-margin gain nor VC-margin denial materializes.
   - `nva.avoidLowYieldBombard` — vetoes Bombard candidates that do not change Control or remove a high-value stack.

5. **Profile-quality witnesses** (full list in §7) covering competence report §3 requirements.

## 2. Non-Goals

- **No engine changes.**
- **No US / ARVN / VC scope.** Spec 202/204 own those; Spec 205 owns ARVN selector cleanup.
- **No new cap classes.**
- **No multi-game shared scaffolding.** FITL-specific NVA only.
- **No removal of existing NVA witnesses.** `nva-march-infiltrate-steal-vc-base.test.ts` and `nva-protects-trail-before-coup.test.ts` preserved.
- **No expansion / Trưng / solitaire bot content.**

## 3. Context (verified against codebase, 2026-05-27)

- **Current NVA library inventory** (`92-agents.md`):
  - Templates (5): `nva.rallyInfiltrate`, `nva.marchInfiltrate`, `nva.marchAmbush`, `nva.attackAmbush`, `nva.locOccupationBeforeCoup`.
  - Modules (4): `nva.blockImmediateWin` (removed by Spec 201), `nva.logisticsAndTrail`, `nva.controlAndBases`, `nva.vcRivalLeverage`.
  - Posture: 1 (`nva.protectLogisticsAndBases`).
  - Guardrails (3): `nva.doNotServeVcWin`, `nva.preserveTrailAndBases`, `nva.avoidLowYieldAttrition`, plus the shared `dropPassWhenOtherMovesExist`.
- **Current NVA witnesses**: 2 (`nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts`).
- **VC-rival filter gap**: `nva.vcRivalLeverage` exists but its `when` clause is `condition.vcNearWin.satisfied`; verification finds that no module *suppresses* plan templates whose Infiltrate target is a VC-Opposition space rather than a VC-Base space when VC is NOT near win. The current encoding treats Infiltrate-on-VC as broadly accepted; the competence report requires it to be gated by NVA gain OR VC denial.
- **Available role constraints**: `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn` from Spec 196.
- **Relationships**: `nva.vcNominalAlly` and `nva.vcNearWin` already exist (`92-agents.md:1379-1431`).

## 4. Architecture

### 4.1 Plan templates (additions)

`nva.rallyTrail` — Rally prioritizing Trail / Laos+Cambodia base placement:

```yaml
nva.rallyTrail:
  matchActionTag: rally
  roles:
    rallySpace:
      selector: nva.rallyTrailTarget
      constraints:
        - kind: postState
          predicate: spaceAllowsNvaBase
  microturnSteps:
    - bindTo: rallySpace
  posture: nva.protectLogisticsAndBases
```

`nva.marchControl` — March seizing NVA Control in populated space:

```yaml
nva.marchControl:
  matchActionTag: march
  roles:
    marchOrigin:
      selector: nva.marchControlOrigin
    marchDestination:
      selector: nva.marchControlDestination
      constraints:
        - kind: reachable
          from: marchOrigin
          to: marchDestination
        - kind: distinctOriginDestination
          a: marchOrigin
          b: marchDestination
        - kind: postState
          predicate: nvaControlInDestination
  microturnSteps:
    - bindTo: marchOrigin
    - bindTo: marchDestination
  posture: nva.preserveTrail
```

`nva.marchInfiltrateControl` — March + Infiltrate gated on NVA-only gain:

```yaml
nva.marchInfiltrateControl:
  matchActionTag: march
  roles:
    marchOrigin:
      selector: nva.marchInfiltrateOrigin
    marchDestination:
      selector: nva.marchInfiltrateDestination
      constraints:
        - kind: reachable
          from: marchOrigin
          to: marchDestination
    infiltrateTarget:
      selector: nva.infiltrateForNvaGain
      constraints:
        - kind: locatedIn
          a: infiltrateTarget
          b: marchDestination
  microturnSteps:
    - bindTo: marchOrigin
    - bindTo: marchDestination
    - bindTo: infiltrateTarget
  compoundSpecial:
    tag: infiltrate
    timing: during
  posture: nva.protectLogisticsAndBases
```

`nva.infiltrateVcOnlyWhenRational` — *explicit* template for VC-takeover gating on rational gain:

```yaml
nva.infiltrateVcOnlyWhenRational:
  matchActionTag: infiltrate
  roles:
    infiltrateTarget:
      selector: nva.infiltrateVcTargetRational
      # Selector ONLY emits targets where:
      #   - NVA piece count post-infiltrate would exceed VC + COIN; OR
      #   - VC is near win and the target is a VC Base (denial).
  microturnSteps:
    - bindTo: infiltrateTarget
  posture: nva.preserveTrail
```

`nva.marchAmbush`, `nva.attackAmbush`, `nva.bombardCoinStack`, `nva.terrorSupportReduction`, `nva.eventLogisticsOrControlSwing` — shaped analogously; targets resolve item-local features (Trail value, base proximity, removed-piece-value, control-swing-possible, etc.) without constant-1 placeholders.

### 4.2 Selectors (additions)

```yaml
nva.rallyTrailTarget:
  scope: zones
  filters:
    - or:
        - { ref: zoneProp.isLaosCambodia }
        - { ref: zoneProp.isHighlandOrJungle }
    - not: { ref: zoneProp.hasSupport }
  score:
    add:
      - mul:
          - { weight: 5 }
          - boolToNumber: { ref: zoneProp.isLaosCambodia }
      - mul:
          - { weight: 4 }
          - { ref: zoneProp.population }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.hasNvaBase }

nva.infiltrateForNvaGain:
  scope: tokens
  filters:
    - { ref: tokenProp.faction.vc }
    - or:
        - { ref: tokenProp.type.base }
        - and:
            - { ref: tokenProp.type.guerrilla }
            - gt:
                - { ref: tokenProp.zone.nvaPieceCountPostInfiltrate }
                - { ref: tokenProp.zone.allOtherPieceCount }
  score:
    add:
      - mul:
          - { weight: 6 }
          - boolToNumber: { ref: tokenProp.type.base }
      - mul:
          - { weight: 4 }
          - { ref: tokenProp.zone.nvaControlPostInfiltrate }
```

The exact `tokenProp.zone.*` reference surface for "post-infiltrate" prediction is contingent on existing token-aggregation primitives plus preview refs; P0 surveys whether these are expressible. If not, the selector falls back to current-state inspection and relies on the `nva.vcRivalRisk` guardrail to filter at posture time.

### 4.3 Strategy modules (additions)

```yaml
nva.baseNetwork:
  traceLabel: "build base network"
  when:
    lt:
      - { ref: feature.nvaBaseCount }
      - 6
  applies:
    scopes: [move]
    actionTags: [rally, infiltrate]
  priority: { tier: 40 }
  enablesPlanTemplates:
    - nva.rallyTrail
    - nva.rallyInfiltrate
  scoreGroups:
    - prefer:
        - weight: 4
          value:
            coalesce:
              - { ref: preview.feature.nvaBaseCount }
              - { ref: feature.nvaBaseCount }

nva.takeControl:
  traceLabel: "seize nva control"
  when:
    lt:
      - { ref: feature.nvaMargin }
      - -3
  applies:
    scopes: [move]
    actionTags: [march, attack]
  priority: { tier: 45 }
  enablesPlanTemplates:
    - nva.marchControl
    - nva.marchInfiltrateControl
  scoreGroups:
    - prefer:
        - weight: 5
          value: { ref: feature.projectedSelfMarginDelta }

nva.conventionalPressure:
  traceLabel: "apply conventional pressure"
  when:
    gt:
      - { ref: feature.nvaTroopCount }
      - 8
  applies:
    scopes: [move]
    actionTags: [attack, bombard]
  priority: { tier: 35 }
  enablesPlanTemplates:
    - nva.attackAmbush
    - nva.bombardCoinStack

nva.vcRivalRisk:
  traceLabel: "deny vc when near win"
  when:
    ref: condition.vcNearWin.satisfied
  applies:
    scopes: [move]
  priority: { tier: 60 }
  suppressesPlanTemplates:
    - nva.terrorSupportReduction  # Terror reduces Support; helps VC indirectly
  scoreGroups:
    - prefer:
        - weight: -5
          value: { ref: feature.projectedVcMarginDelta }
```

### 4.4 Posture and guardrails (additions / strengthening)

```yaml
nva.preserveTrail:
  applies:
    scopes: [move]
  prefer:
    - weight: 4
      value: { ref: feature.projectedTrailDelta }
      previewFallback:
        onUnavailable: noContribution

nva.avoidVcKingmaking:
  applies:
    scopes: [move]
  prefer:
    - weight: -6
      value:
        boolToNumber:
          and:
            - { ref: condition.vcNearWin.satisfied }
            - gt:
                - coalesce:
                    - { ref: preview.feature.projectedVcMarginDelta }
                    - 0
                - 0
      previewFallback:
        onUnavailable: noContribution

# Guardrails:

nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial:
  trigger:
    and:
      - { ref: candidate.tag.infiltrate }
      - { ref: roleTarget.infiltrateTarget.isVcBase }
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSelfMarginDelta }
              - 0
          - 1
      - not: { ref: condition.vcNearWin.satisfied }
  effect: veto

nva.avoidLowYieldBombard:
  trigger:
    and:
      - { ref: candidate.tag.bombard }
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSelfMarginDelta }
              - 0
          - 1
      - not: { ref: roleTarget.bombardTarget.changesControl }
  effect: veto
```

### 4.5 Bindings

`nva-baseline.bindings.strategyModules` adds `nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, `nva.vcRivalRisk`. `nva-baseline.bindings.planTemplates` adds the new templates from §4.1.

## 5. Edge cases

- **`feature.nvaBaseCount` requires bespoke `globalTokenAgg`** — Spec 201's P0 metric survey records availability. If not present in Spec 201's P0 output, this spec's P0 authors it via faction+type filter as in `92-agents.md:104-112`.
- **`tokenProp.zone.nvaPieceCountPostInfiltrate`** preview ref may not be supported by current preview aggregation surface — if not, the selector falls back to current-state aggregation plus `nva.vcRivalRisk` posture filter.
- **VC near-win edge case** — when VC is at -1 AND VC has only Bases (no Opposition source), `nva.terrorSupportReduction` suppression has no effect; the guardrail `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`'s `vcNearWin` clause permits VC-base steal.
- **Replay-identity preservation** — `nva-march-infiltrate-steal-vc-base.test.ts` continues to pass: that witness exercises legitimate VC-base steal where NVA gain materializes; the new guardrail only vetoes when neither gain nor denial applies.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector vocabulary survey (Trail / Laos+Cambodia / NVA piece counts) | Inventory; Open Questions list any zone/token props that need to be authored elsewhere | S |
| **P1** | New NVA plan templates (§4.1) | All 9 templates compile; `nva.infiltrateVcOnlyWhenRational` selector compiles | M |
| **P2** | NVA strategy modules + posture + guardrails (§§4.3–4.4) | All compile; eligibility-gating traces through Spec 197 surface | M |
| **P3** | `nva-baseline` bindings (§4.5) | Profile compiles; existing NVA witnesses pass; replay-identity preserved | S |
| **P4** | NVA profile-quality witness suite (§7) | All 9 witnesses pass; build byte-identical | M |
| **P5** | Replay-identity reattestation against Spec 201 | After Spec 201 lands, all FITL canaries byte-identical with NVA baseline changes folded in | S |

## 7. Test plan

- `nva-protects-trail-before-coup.test.ts` (existing; preserved).
- `nva-march-infiltrate-steal-vc-base.test.ts` (existing; preserved — exercises the legitimate-gain path).
- `nva-rally-improves-trail.test.ts` — Rally selector picks a Laos/Cambodia space when Trail is degraded.
- `nva-march-into-populated-control.test.ts` — `nva.marchControl` selects a high-pop space whose post-state NVA piece count exceeds others.
- `nva-march-infiltrate-builds-nva-not-steal-vc.test.ts` — when NVA gain is the rational outcome, `nva.marchInfiltrateControl` fires; not `nva.infiltrateVcOnlyWhenRational`.
- `nva-vc-rival-suppresses-terror.test.ts` — when VC near win, `nva.terrorSupportReduction` is suppressed; `nva.attackAmbush` against VC Base preferred.
- `nva-bombard-concentrated-coin.test.ts` — Bombard target is a 3+-cube COIN stack; low-yield Bombard vetoed.
- `nva-attack-ambush-beats-conventional-attack.test.ts` — when guerrilla attrition matters, `nva.attackAmbush` outscores plain Attack.
- `nva-blocks-vc-near-win.test.ts` — when VC at -1, plan selects VC-Base removal or Opposition reduction by NVA, not new NVA Control.
- `nva-avoid-low-yield-vc-steal.test.ts` — Infiltrate-on-VC-base without gain or denial → vetoed.

Architectural invariant: `nva-templates-bind-shared-modules.test.ts` (when Spec 201 live).

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only |
| #2 | All NVA doctrine evolvable |
| #15 | Closes NVA parity gap |
| #16 | 10 witnesses cover competence report §3 |
| #19 | Compound shapes (March+Infiltrate, March+Ambush, Attack+Ambush) emerge from microturn step decisions |
| #20 | All preview-derived features declare `previewFallback.onUnavailable: noContribution` |

## 9. Reassessment of source proposal

**Adopted:**
- §5 NVA recommendations → §§4.1–4.5.
- §6.8 NVA plan-template list → §4.1 (with `nva.infiltrateVcOnlyWhenRational` as the explicit alliance-rival-gated template).
- §6.10 NVA guardrails → §4.4 (`nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`, `nva.avoidLowYieldBombard`).

**Adopted with adjustment:**
- §5 "Add `nva.trailWeak`, `nva.baseLogistics`, `nva.laosCambodiaSafety` features" — adopted but renamed and folded into the `nva.baseNetwork` and `nva.preserveTrail` modules; no standalone Boolean conditions for each (they're scoring inputs, not gating predicates).

**Corrected:**
- The proposal lists `nva.marchInfiltrateControl` AND `nva.rallyInfiltrateBuild` as separate templates. `nva.rallyInfiltrate` already exists; `nva.rallyInfiltrateBuild` is folded into the existing template via the `nva.baseNetwork` doctrine's `enablesPlanTemplates` rather than created as a duplicate. The proposal's own §6.8 list does this consolidation too.

**Deferred:**
- `nva.marchAmbush` Ambush-from-LoC adjacency variant — uncommitted; the base `nva.marchAmbush` template covers the common case; LoC-adjacency specialization deferred until a witness shows the generic selector cannot differentiate.

## 10. Out of scope (named follow-on / sibling)

- **Spec 201, 202, 204, 205** (sibling).
- NVA Sapper / specialty-unit specific templates — uncommitted (base game does not require this).
- Convoy/Trail-segment-specific scoring — uncommitted.

## 11. Open questions

- **Token-prop vocabulary**: which `tokenProp.zone.*` references for post-Infiltrate prediction exist vs. need authoring? P0 deliverable.
- **`nva.nvaTroopCount` global feature**: present in `92-agents.md` already? P0 verifies and reuses.
- **Threshold calibration** in §4.3 modules — P4.

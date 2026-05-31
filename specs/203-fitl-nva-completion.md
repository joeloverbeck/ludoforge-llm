# Spec 203 — FITL NVA Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `nva-baseline` exposes only 5 plan templates, 3 faction-specific strategy modules (10 bound counting Spec 201 shared), 1 posture, and 3 guardrails — well short of ARVN-baseline's authored coverage (6 templates, ~6 faction modules, 1 posture, 6 guardrails). The competence report (`reports/fitl-competent-agent-ai.md`, NVA sections at lines ~636 onward) requires NVA to be encoded as a conventional/logistics insurgent that builds the Trail, masses force for NVA Control in populated spaces, uses Laos/Cambodia as a highway, distinguishes "build NVA strength" from "steal VC assets" when Infiltrating, and uses Bombard/Attack/Ambush selectively. The most important gap the report names is the **VC-rival filter**: `Infiltrate` reduces Opposition and converts VC infrastructure, so Infiltrate without alliance-rival posture looks malicious. None of this is fully encoded today.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. No engine work. Consumes shared scaffolding from Spec 201.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `reachable`/`adjacent` for March/Infiltrate route binding (authored shape: `{reachable: {from: role.X, to: role.Y, via: routeClass.Z}}`; see `92-agents.md:1454-1458`)
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates` (surface already exercised: see `92-agents.md:2088-2092`)
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe for March+Infiltrate / March+Ambush
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — `shared.*` modules and lifecycle conditions

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27). This spec adopts the proposal's §5 "Faction-by-faction gap analysis" (NVA subsection) + §6.8 "Plan templates" (NVA list) + §§6.9–6.10 NVA posture and guardrail slices.

**Ticket namespace**: `203FITLNVACOMP`

---

## 1. Goal

Complete `nva-baseline` to ARVN-parity by authoring the plan templates, strategy modules, posture evaluators, and witnesses that encode the NVA competence requirements from `reports/fitl-competent-agent-ai.md` (NVA sections). Concretely:

1. **New NVA plan templates**:
   - `nva.rallyTrail` — Rally action prioritizing Trail improvement and Laos/Cambodia Base placement.
   - `nva.marchControl` — March to seize NVA Control in populated spaces using the existing FITL `targetSpaces` microturn surface.
   - `nva.marchInfiltrateControl` — March + Infiltrate to build NVA Troops/Control; gates on NVA-only gain.
   - `nva.infiltrateVcOnlyWhenRational` — Infiltrate target binding that ONLY fires when VC-takeover improves NVA score or denies VC near-win.
   - `nva.marchAmbush` — March + Ambush adjacency pattern.
   - `nva.attackAmbush` — Attack with Ambush selector for guaranteed removal.
   - `nva.bombardCoinStack` — Bombard target binding for concentrated COIN Troops/Bases.
   - `nva.terrorSupportReduction` — Terror for denial / Rally-space opening (not for scoring).
   - Event logistics/control swing remains encoded by bound `shared.eventDirectSwing`; do not author an NVA event plan template because event decisions have no uniform bindable plan-template step surface.

2. **New NVA strategy modules**:
   - `nva.baseNetwork` — gates Rally/Infiltrate templates when NVA base count is below per-profile threshold; promotes Highland/Jungle Base placement.
   - `nva.takeControl` — promotes high-pop control-swing March targets when NVA-margin trails.
   - `nva.conventionalPressure` — promotes Bombard/Attack+Ambush when concentrated COIN stack is near a critical NVA position.
   - `nva.vcRivalRisk` — when VC is near win, suppress `nva.infiltrateVcOnlyWhenRational`'s VC-Opposition-reducing targets in favor of VC-Base-stealing targets; promote denial.

3. **New NVA posture evaluators**:
   - Add `nva.preserveTrail` explicit `prefer` term over projected Trail delta in the same compile-valid slice as the templates that reference it.
   - Add `nva.avoidVcKingmaking` — demotes candidates that improve VC margin when VC near win.

4. **New NVA guardrails**:
   - `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` — demotes Infiltrate-on-VC-base when neither NVA-margin gain nor VC-margin denial materializes.
   - `nva.avoidLowYieldBombard` — demotes Bombard candidates that do not change Control or remove a high-value stack.

5. **Profile-quality witnesses** (full list in §7) covering competence report NVA sections.

## 2. Non-Goals

- **No engine changes.**
- **No US / ARVN / VC scope.** Spec 202/204 own those; Spec 205 owns ARVN selector cleanup.
- **No new cap classes.**
- **No multi-game shared scaffolding.** FITL-specific NVA only.
- **No removal of existing NVA witnesses.** `nva-march-infiltrate-steal-vc-base.test.ts` and `nva-protects-trail-before-coup.test.ts` preserved.
- **No expansion / Trưng / solitaire bot content.**

## 3. Context (verified against codebase, 2026-05-27)

- **Current NVA library inventory** (`92-agents.md`):
  - Templates (5): `nva.rallyInfiltrate@1611`, `nva.marchInfiltrate@1623`, `nva.marchAmbush@1635`, `nva.attackAmbush@1647`, `nva.locOccupationBeforeCoup@1659`.
  - Faction-specific strategy modules (3): `nva.logisticsAndTrail@2334`, `nva.controlAndBases@2353`, `nva.vcRivalLeverage@2373`. Plus 7 shared modules bound via Spec 201 (`shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, `shared.allyRivalThrottle`, `shared.monsoonOperationalRestriction`) — 10 bound total. (`nva.blockImmediateWin` was removed by Spec 201 and is subsumed by `shared.immediateWin` / `shared.blockCurrentLeader`.)
  - Posture (1): `nva.protectLogisticsAndBases@1802`.
  - Guardrails (3): `nva.doNotServeVcWin@2645`, `nva.preserveTrailAndBases@2657`, `nva.avoidLowYieldAttrition@2671`, plus the shared `dropPassWhenOtherMovesExist`.
- **Current NVA witnesses** (under `packages/engine/test/policy-profile-quality/`): 2 — `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts` (both `@test-class: architectural-invariant`).
- **VC-rival filter gap**: `nva.vcRivalLeverage` (`92-agents.md:2373`) is unconditional (`when: true`) and binds the generic `nva.infiltrateTargetSpace` selector with a flat `vcBaseTakeover` weight. It does not gate by `condition.vcNearWin.satisfied`, and it does not suppress plan templates whose Infiltrate target is a VC-Opposition space rather than a VC-Base space. The current encoding treats Infiltrate-on-VC as broadly accepted; the competence report requires it to be gated by NVA gain OR VC denial.
- **Already-used Spec 197 surface**: `enablesPlanTemplates` / `suppressesPlanTemplates` are in active use in the authored profile (e.g., `arvn.buildPoliticalEngine@2080-2092` and several other strategy modules); §4.3 modules extend the same surface.
- **Available role constraints**: `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn` from Spec 196 — authored as single-key constructors `{KIND: {...payload}}` over `role.X` refs (e.g., `{reachable: {from: role.transportOrigin, to: role.transportDestination, via: routeClass.land}}` at `92-agents.md:1454-1458`).
- **Available baseline features** (already authored in `92-agents.md`): `feature.nvaMargin@67`, `feature.nvaBaseCount@176`, `feature.projectedSelfMarginDelta@253`, `feature.projectedTrailDelta@343`.
- **Relationships**: `nva.vcNominalAlly@1884` and `nva.vcNearWin@1890` (relationship + condition definitions).

## 4. Architecture

> YAML stanzas below use the authored surface in `data/games/fire-in-the-lake/92-agents.md`. Each artifact group cites a sibling for shape reference. Concrete `zoneProp.*` / `tokenProp.*` / preview-ref names are validated at P0 (§11) — the stanzas demonstrate the structural shape and identifier intent, not the final byte-for-byte authoring.

### 4.1 Plan templates (additions)

`nva.rallyTrail` — single-action Rally prioritizing Trail / Laos+Cambodia / sanctuary base placement:

```yaml
nva.rallyTrail:
  traceLabel: "NVA Rally to seed Trail / sanctuary Bases"
  root: { actionTags: [rally] }
  postureHook: nva.protectLogisticsAndBases
  roles:
    rallySpace: { selector: nva.rallyTrailTarget, required: true }
  steps:
    - { label: rally-trail-sanctuary, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: `nva.rallyInfiltrate@1611` for the single-faction template shape (drop the `compound` block for single-action templates).

`nva.marchControl` — March seizing NVA Control in populated space:

```yaml
nva.marchControl:
  traceLabel: "NVA March to seize NVA Control"
  root: { actionTags: [march] }
  postureHook: nva.preserveTrail
  roles:
    marchSpace: { selector: nva.marchControlDestination, required: true }
  steps:
    - { label: march-control-space, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: existing NVA March templates bind `decisionPath: targetSpaces`; FITL March does not expose a separate `originSpaces` decision path in the current authored action surface. Post-state NVA-Control filtering lives in the `nva.marchControlDestination` selector body (see §4.2 and P0 selector survey).

`nva.marchInfiltrateControl` — March + Infiltrate gated on NVA-only gain:

```yaml
nva.marchInfiltrateControl:
  traceLabel: "NVA March then Infiltrate to build NVA strength"
  root: { actionTags: [march], compound: { specialTags: [infiltrate], timing: after } }
  postureHook: nva.protectLogisticsAndBases
  roles:
    marchSpace: { selector: nva.marchInfiltrateDestination, required: true }
    infiltrateSpace: { selector: nva.infiltrateForNvaGain, required: true }
  steps:
    - { label: march-build-space, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
    - { label: infiltrate-build, role: infiltrateSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: infiltrate } }
  caps: { capClass: standard256, maxSteps: 3 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: `nva.marchInfiltrate@1623` for the compound-after pattern over the live `targetSpaces` surface.

`nva.infiltrateVcOnlyWhenRational` — explicit template for VC-takeover gating on rational gain:

```yaml
nva.infiltrateVcOnlyWhenRational:
  traceLabel: "NVA Infiltrate VC only when rational"
  root: { actionTags: [infiltrate] }
  postureHook: nva.preserveTrail
  roles:
    infiltrateSpace: { selector: nva.infiltrateVcTargetRational, required: true }
  steps:
    - { label: infiltrate-vc-rational, role: infiltrateSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: infiltrate } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Selector `nva.infiltrateVcTargetRational` enumerates ONLY targets where (a) NVA piece count post-infiltrate would exceed VC + COIN, or (b) VC is near win and the target is a VC Base (denial). Authoring reference: existing `nva.infiltrateTargetSpace` for the source/quality skeleton.

`nva.bombardCoinStack` and `nva.terrorSupportReduction` — shaped analogously as single-action templates (`root: { actionTags: [X] }`). Existing `nva.marchAmbush@1635` and `nva.attackAmbush@1647` already provide the March+Ambush and Attack+Ambush plan-template shapes and stay as the authored template ids for those doctrines. Event logistics/control swing is not a plan template; it remains encoded by the already-bound `shared.eventDirectSwing` strategy module because event decisions expose heterogeneous card-specific parameters with no uniform bindable `decisionPath`. Selectors resolve item-local features (Trail value, base proximity, removed-piece-value, control-swing-possible) within `quality.components`.

### 4.2 Selectors (additions)

```yaml
nva.rallyTrailTarget:
  scopes: [move]
  source: { collection: { kind: zones } }
  quality:
    components:
      - id: laosCambodiaPriority
        value:
          boolToNumber:
            or:
              - eq:
                  - zoneProp: { zone: { ref: selector.item.key }, prop: country }
                  - cambodia
              - eq:
                  - zoneProp: { zone: { ref: selector.item.key }, prop: country }
                  - laos
        weight: 5
      - id: populationDensity
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: population }
            - 0
        weight: 4
      - id: nvaBaseBonus
        value:
          boolToNumber:
            gt:
              - lookup:
                  surface: policyState
                  collection: zones
                  keyType: ZoneId
                  key: { ref: selector.item.key }
                  path: [tokens, nvaBase]
                  onMissing: { kind: constant, value: 0 }
              - 0
        weight: 3
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

Authoring reference: `vc.rallyBaseOrUndergroundSpace@1247` for the structure; `vc.terrorAgitationSpace@1283` for `boolToNumber`-with-`eq` and post-state `lookup` predicate components. The exact `country` / `tokens.nvaBase` property names are subject to the P0 selector-vocabulary survey (§11).

```yaml
nva.infiltrateForNvaGain:
  # Zone-scoped enumeration scored on the highest-value VC token in the zone.
  # Native token-scoped selectors are a P0 open question (§11) — current authored
  # surface uses kind: zones uniformly.
  scopes: [move]
  source: { collection: { kind: zones } }
  quality:
    components:
      - id: vcBaseInZone
        value:
          boolToNumber:
            gt:
              - lookup:
                  surface: policyState
                  collection: zones
                  keyType: ZoneId
                  key: { ref: selector.item.key }
                  path: [tokens, vcBase]
                  onMissing: { kind: constant, value: 0 }
              - 0
        weight: 6
      - id: postInfiltrateNvaMarginGain
        value:
          coalesce:
            - { ref: preview.feature.projectedSelfMarginDelta }
            - 0
        weight: 4
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

Authoring reference: `vc.subvertArvnControlSpace@1312` for the zone-scoped post-state lookup pattern. The `tokenProp.zone.*` post-Infiltrate predictive refs the original brainstorm proposed (e.g., `nvaPieceCountPostInfiltrate`, `nvaControlPostInfiltrate`) are P0 deliverables (§11); if unavailable, this selector relies on the `nva.vcRivalRisk` module and the `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` guardrail to filter at posture/guardrail time.

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
    - id: baseExpansion
      summary: sum
      terms:
        - id: projectedBaseCount
          weight: 4
          value:
            coalesce:
              - { ref: preview.feature.nvaBaseCount }
              - { ref: feature.nvaBaseCount }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }

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
    - id: controlSwing
      summary: sum
      terms:
        - id: projectedNvaMarginDelta
          weight: 5
          value: { ref: feature.projectedSelfMarginDelta }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }

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
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }

nva.vcRivalRisk:
  traceLabel: "deny vc when near win"
  when: { ref: condition.vcNearWin.satisfied }
  applies:
    scopes: [move]
  priority: { tier: 60 }
  suppressesPlanTemplates:
    - nva.terrorSupportReduction
  scoreGroups:
    - id: vcDenial
      summary: sum
      terms:
        - id: vcMarginPenalty
          weight: -5
          value:
            coalesce:
              - { ref: feature.projectedVcMarginDelta }
              - 0
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
```

Authoring reference: `arvn.buildPoliticalEngine@2080-2092` for `enablesPlanTemplates` + `scoreGroups` shape; `arvn.denyUSIfNearWin` (sibling pattern) for ally-rival-near-win gating with `suppressesPlanTemplates`. `feature.nvaTroopCount` and `feature.projectedVcMarginDelta` are P0 open questions (§11).

### 4.4 Posture and guardrails (additions / strengthening)

```yaml
nva.preserveTrail:
  traceLabel: "preserve Trail value"
  must: []
  prefer:
    - id: trailDelta
      value:
        coalesce:
          - { ref: feature.projectedTrailDelta }
          - 0
      weight: 4
      fallback: { contribution: 0 }

nva.avoidVcKingmaking:
  traceLabel: "avoid kingmaking VC"
  must: []
  prefer:
    - id: vcKingmakingPenalty
      when: { ref: condition.vcNearWin.satisfied }
      value:
        coalesce:
          - { ref: preview.feature.projectedVcMarginDelta }
          - 0
      weight: -6
      fallback: { contribution: 0 }
```

Authoring reference: `nva.protectLogisticsAndBases@1802` for the `must`/`prefer` + `fallback: { contribution: N }` shape. `feature.projectedTrailDelta` is already authored (`92-agents.md:343`, `:1978`); `preview.feature.projectedVcMarginDelta` is a P0 open question (§11).

```yaml
nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial:
  scopes: [move]
  when:
    and:
      - { ref: candidate.tag.infiltrate }
      - { ref: roleTarget.infiltrateSpace.isVcBase }
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSelfMarginDelta }
              - 0
          - 1
      - not: { ref: condition.vcNearWin.satisfied }
  severity: demote
  penalty: 600
  onUnavailable: noFire

nva.avoidLowYieldBombard:
  scopes: [move]
  when:
    and:
      - { ref: candidate.tag.bombard }
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSelfMarginDelta }
              - 0
          - 1
      - not: { ref: roleTarget.bombardTarget.changesControl }
  severity: demote
  penalty: 600
  onUnavailable: noFire
```

Authoring reference: `nva.doNotServeVcWin@2645` for the `when` + `severity: demote` + `penalty` + `onUnavailable` shape. Authored guardrails use `severity: demote | prune` with `penalty`; the high-penalty `demote` pattern matches sibling intent ("veto in effect, demote in form"). `roleTarget.infiltrateSpace.isVcBase` and `roleTarget.bombardTarget.changesControl` are P0 open questions (§11); if those post-binding role-target refs are unavailable, the guardrails fall back to post-state `lookup` predicates on `tokens.vcBase` and control-swing aggregates.

### 4.5 Bindings

`nva-baseline.use.strategyModules` adds `nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, `nva.vcRivalRisk` (alongside the existing shared and faction modules). `nva-baseline.use.planTemplates` adds the new templates from §4.1. `nva-baseline.use.guardrails` adds the new guardrails from §4.4. Postures are not bound in the profile's `use:` block; they are referenced per-template via `postureHook`.

## 5. Edge cases

- **`tokenProp.zone.*` post-Infiltrate prediction refs** (e.g., `nvaPieceCountPostInfiltrate`) may not be supported by current preview aggregation surface — if not, `nva.infiltrateForNvaGain` falls back to current-state aggregation plus the `nva.vcRivalRisk` module / `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial` guardrail to filter at posture time.
- **VC near-win edge case** — when VC is at -1 AND VC has only Bases (no Opposition source), `nva.terrorSupportReduction` suppression has no effect; the guardrail `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`'s `vcNearWin` clause permits VC-base steal.
- **Replay-identity preservation** — `nva-march-infiltrate-steal-vc-base.test.ts` continues to pass: that witness exercises legitimate VC-base steal where NVA gain materializes; the new guardrail only demotes when neither gain nor denial applies.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector vocabulary survey (Trail / Laos+Cambodia / NVA piece counts / role-target refs / token-scoped selectors / VC-margin preview refs) | Inventory; Open Questions list any zone/token props or role-target refs that need to be authored elsewhere | S |
| **P1** | New NVA plan templates (§4.1) | All 6 new templates compile; existing `nva.marchAmbush` / `nva.attackAmbush` remain valid; no event plan template is authored; `nva.infiltrateVcOnlyWhenRational` selector compiles | M |
| **P2** | NVA strategy modules + posture + guardrails (§§4.3–4.4) | All compile; eligibility-gating traces through Spec 197 surface | M |
| **P3** | `nva-baseline` bindings (§4.5) | Profile compiles; existing NVA witnesses pass; replay-identity preserved | S |
| **P4** | NVA profile-quality witness suite (§7) | All 10 doctrine witnesses pass (2 existing + 8 new); architectural-invariant `nva-templates-bind-shared-modules.test.ts` validates Spec 201 bindings and corrected plan-template counts; build byte-identical | M |
| **P5** | Replay-identity reattestation against Spec 201 | After Spec 201 lands, all FITL canaries byte-identical with NVA baseline changes folded in | S |

## 7. Test plan

All witnesses live under `packages/engine/test/policy-profile-quality/` (per sibling convention).

- `nva-protects-trail-before-coup.test.ts` (existing; preserved).
- `nva-march-infiltrate-steal-vc-base.test.ts` (existing; preserved — exercises the legitimate-gain path).
- `nva-rally-improves-trail.test.ts` — Rally selector picks a Laos/Cambodia space when Trail is degraded.
- `nva-march-into-populated-control.test.ts` — `nva.marchControl` selects a high-pop space whose post-state NVA piece count exceeds others.
- `nva-march-infiltrate-builds-nva-not-steal-vc.test.ts` — when NVA gain is the rational outcome, `nva.marchInfiltrateControl` fires; not `nva.infiltrateVcOnlyWhenRational`.
- `nva-vc-rival-suppresses-terror.test.ts` — when VC near win, `nva.terrorSupportReduction` is suppressed; `nva.attackAmbush` against VC Base preferred.
- `nva-bombard-concentrated-coin.test.ts` — Bombard target is a 3+-cube COIN stack; low-yield Bombard demoted.
- `nva-attack-ambush-beats-conventional-attack.test.ts` — when guerrilla attrition matters, `nva.attackAmbush` outscores plain Attack.
- `nva-blocks-vc-near-win.test.ts` — when VC at -1, plan selects VC-Base removal or Opposition reduction by NVA, not new NVA Control.
- `nva-avoid-low-yield-vc-steal.test.ts` — Infiltrate-on-VC-base without gain or denial → demoted.

Architectural invariant: `nva-templates-bind-shared-modules.test.ts` (when Spec 201 live).

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only |
| #2 | All NVA doctrine evolvable |
| #15 | Closes NVA parity gap |
| #16 | 10 doctrine witnesses cover competence report NVA sections, plus a binding invariant for shared modules and corrected NVA template bindings |
| #19 | Compound shapes (March+Infiltrate, March+Ambush, Attack+Ambush) emerge from microturn step decisions |
| #20 | All preview-derived prefer terms declare `fallback: { contribution: 0 }` |

## 9. Reassessment of source proposal

**Adopted:**
- §5 "Faction-by-faction gap analysis" (NVA subsection) → §§4.1–4.5.
- §6.8 "Plan templates" (NVA list) → §4.1 (with `nva.infiltrateVcOnlyWhenRational` as the explicit alliance-rival-gated template).
- §6.10 "Guardrails" (NVA list) → §4.4 (`nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`, `nva.avoidLowYieldBombard`).

**Adopted with adjustment:**
- §5 "Add `nva.trailWeak`, `nva.baseLogistics`, `nva.laosCambodiaSafety` features" — adopted but renamed and folded into the `nva.baseNetwork` and `nva.preserveTrail` modules; no standalone Boolean conditions for each (they're scoring inputs, not gating predicates).
- §6.8 "Plan templates" event item — adjusted to keep event doctrine in `shared.eventDirectSwing` instead of authoring `nva.eventLogisticsOrControlSwing`, because the live plan-template compiler requires concrete role+step bindings and events have no single uniform bindable decision path.
- §4.1 March origin/destination examples — adjusted to the live FITL March `targetSpaces` decision path. The current action surface does not expose separate `originSpaces`; route-origin constraints are deferred until a generic, compile-valid microturn surface exists.

**Deferred:**
- `nva.marchAmbush` Ambush-from-LoC adjacency variant — uncommitted; the base `nva.marchAmbush` template covers the common case; LoC-adjacency specialization deferred until a witness shows the generic selector cannot differentiate.

## 10. Out of scope (named follow-on / sibling)

- **Spec 201, 202, 204, 205** (sibling).
- NVA Sapper / specialty-unit specific templates — uncommitted (base game does not require this).
- Convoy/Trail-segment-specific scoring — uncommitted.

## 11. Open questions

- **Token-prop vocabulary**: which `tokenProp.zone.*` references for post-Infiltrate prediction (e.g., `nvaPieceCountPostInfiltrate`, `allOtherPieceCount`, `nvaControlPostInfiltrate`) exist vs. need authoring? P0 deliverable.
- **`feature.nvaTroopCount`**: present in `92-agents.md` already? P0 verifies and reuses. (`feature.nvaBaseCount@176`, `feature.nvaMargin@67`, `feature.projectedSelfMarginDelta@253`, `feature.projectedTrailDelta@343` are already authored.)
- **`feature.projectedVcMarginDelta` / `preview.feature.projectedVcMarginDelta`**: present in the current authoring surface? P0 verifies and either reuses or authors. (`feature.projectedSelfMarginDelta` is confirmed at multiple sites.)
- **`roleTarget.X.isVcBase` / `roleTarget.X.changesControl`**: do these post-binding role-target refs exist on the current authoring surface? P0 deliverable. If not, §4.4 guardrails fall back to post-state `lookup` predicates on `tokens.vcBase` and control-swing aggregates.
- **Token-scoped `source.collection`**: does the selector source surface support `kind: tokens` with a `faction:` filter? Current authored selectors uniformly use `kind: zones`; P0 confirms whether token-scoped selection is available or whether `nva.infiltrateForNvaGain` should remain zone-scoped with a per-zone score on VC-Base presence (as drafted in §4.2).
- **Threshold calibration** in §4.3 modules — P4.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-31:

- [`archive/tickets/203FITLNVACOM-001.md`](../archive/tickets/203FITLNVACOM-001.md) — NVA selector vocabulary survey (P0) (covers §6 P0)
- [`archive/tickets/203FITLNVACOM-002.md`](../archive/tickets/203FITLNVACOM-002.md) — NVA plan templates and supporting selectors (P1) (covers §6 P1)
- [`tickets/203FITLNVACOM-003.md`](../tickets/203FITLNVACOM-003.md) — NVA strategy modules, posture, and guardrails (P2) (covers §6 P2)
- [`tickets/203FITLNVACOM-004.md`](../tickets/203FITLNVACOM-004.md) — nva-baseline profile bindings (P3) (covers §6 P3)
- [`tickets/203FITLNVACOM-005.md`](../tickets/203FITLNVACOM-005.md) — NVA profile-quality witness suite (P4) (covers §6 P4)
- [`tickets/203FITLNVACOM-006.md`](../tickets/203FITLNVACOM-006.md) — Replay-identity reattestation (P5) (covers §6 P5)

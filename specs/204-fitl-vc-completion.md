# Spec 204 — FITL VC Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `vc-baseline` has 5 plan templates, 4 faction-specific strategy modules (11 bound counting Spec 201 shared), 1 posture, and 3 faction-specific guardrails (4 bound counting shared), vs. ARVN's 6 templates / 7 faction-specific modules / 1 posture / 7 faction-specific guardrails. Profile-quality witnesses: VC has 2, ARVN has ~10. The competence report (`reports/fitl-competent-agent-ai.md` §4) requires VC to be encoded as a clandestine political-insurgent network that builds Opposition + VC Bases, stays Underground, uses Terror/Tax/Subvert/Agitation intelligently, Taxes LoCs preferentially over populated spaces, protects VC Bases from NVA Infiltrate, and prepares Agitation before each Coup. The most under-encoded competence area today is **Coup-support-phase Agitation preparation** — VC's Terror turn is half the story, the agent must also value Tax/March/Rally that create Agitation-ready spaces.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. No engine work. Authors two missing candidateFeatures (`feature.projectedNvaMarginDelta`, an Underground-Guerrilla aggregate or proxy). Consumes shared scaffolding from Spec 201; reuses the verified authoring surface Specs 202 (US) and 203 (NVA) reauthored against.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — inline-key role constraints (`{reachable: {from, to, via}}`, `{distinctOriginDestination: {origin, destination}}`, `{notEqual: role.X}`, `{adjacent: ...}`, `{locatedIn: ...}`)
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates` on strategy modules (surface in active use; see `92-agents.md:2402-2406`)
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe via `root.compound: { specialTags: [...], timing: after|during }`
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — `shared.*` modules and lifecycle conditions (`condition.coupImminent`, `condition.nvaNearWin`, `condition.arvnNearWin`, `condition.resourcesLow`)

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27). This spec adopts the proposal's §5 "Faction-by-faction gap analysis" (VC subsection) + §6.8 "Plan templates" (VC list) + §§6.9–6.10 VC posture/guardrail slices. The proposal's YAML used a fictional authoring surface (`matchActionTag`, `microturnSteps`/`bindTo`, `compoundSpecial`, `posture:`, `previewFallback`); §4 reauthors against the verified surface, matching the correction Specs 202 and 203 already applied (see §9 Corrected).

**Ticket namespace**: `204FITLVCCOM`

---

## 1. Goal

Complete `vc-baseline` to ARVN-parity by authoring plan templates, selectors, strategy modules, posture evaluators, guardrails, and profile-quality witnesses that encode the VC competence requirements (`reports/fitl-competent-agent-ai.md` §4). Concretely:

1. **New VC plan templates** (over the verified `root`/`steps`/`postureHook`/`compound` surface):
   - `vc.rallyBaseNetwork` — Rally for Base / Underground guerrilla placement in Highland/Jungle and non-Support spaces.
   - `vc.rallyTax` — Rally + Tax compound where Tax funds future Terror/Rally.
   - `vc.marchSpread` — March to spread Underground network into Opposition / Neutral spaces.
   - `vc.attackAmbush` — Attack with Ambush selector for surgical removal.
   - `vc.agitationPrep` — Coup-support template that consolidates VC pieces and Resources in non-COIN-Controlled spaces through the resolved `agitate` action tag (P0b).
   - **Selector rebinding** on existing `vc.terrorTax` and `vc.terrorSubvert`: shift `terrorSpace` from `vc.terrorAgitationSpace` to a high-pop non-COIN-Controlled selector and `taxSpace` from `vc.taxFundingSpace` to a LoC-targeted selector (the existing templates are fully authored at `@1995-2006` and `@1983-1994`; the change is the selector binding, not the template structure).
   - Event Opposition/Resource swings continue to be encoded by the already-bound `shared.eventDirectSwing` strategy module (no dedicated VC event plan template — same conclusion Spec 202 reached for `us.eventDirectSwing` at §11).

2. **New VC strategy modules** (over the verified `selectors`/`scoreGroups` surface):
   - `vc.oppositionEngine` — gates Terror/Rally templates when total Opposition trails; promotes high-pop Support→Opposition shift targets.
   - `vc.baseNetwork` — gates Rally for VC Base placement when VC base count is low.
   - `vc.subvertPatronage` — when ARVN near win, promote Subvert targets that drop Patronage.
   - `vc.agitationReadiness` — when Coup imminent, promote Tax/Rally/March that create Agitation-ready spaces (VC pieces in non-COIN-Controlled, Resources ≥ Agitation cost).
   - `vc.nvaRivalRisk` — when NVA near win, suppress Infiltrate-vulnerable Base templates and promote Base-protection / Opposition-denial targets.

3. **New VC posture evaluators** (over the verified `must`/`prefer` surface with `fallback: { contribution: 0 }`):
   - `vc.preserveUndergroundAndBases` — `prefer` for projected Underground-guerrilla and VC base counts; demote candidates that activate guerrillas without payoff.
   - `vc.preserveAgitationResources` — demote candidates that drop Resources when `coupImminent` is active.
   - `vc.avoidNvaKingmaking` — demote candidates that improve projected NVA margin when NVA near win.

4. **New VC guardrails** (over the verified `severity: prune|demote|warn|auditOnly` + `penalty: N` surface):
   - `vc.avoidTaxWhenSupportShiftIsTooCostly` — demotes Tax candidates on populated Support spaces unless `resourcesLow`. (`severity: demote, penalty: ~400`; `veto` is not a valid `GuardrailSeverity` — see Spec 202 §11.)
   - Strengthen existing `vc.protectBasesFromNvaInfiltrate` with relationship-driven gating (NVA near-win condition).

5. **New candidateFeatures**:
   - `feature.projectedNvaMarginDelta` — sibling of the existing `projectedArvnMarginDelta@274` / `projectedVcMarginDelta@280`. Authored as `sub(feature.projectedNvaMargin, feature.nvaMargin)`; both operands verified to exist (see §5).
   - Underground-guerrilla aggregate or per-zone proxy: either `feature.vcUndergroundGuerrillaCount` via `globalTokenAgg` (subject to P0a confirmation that the aggregate operator supports a token-active/underground filter), or re-express the posture via a per-zone `lookup` for the Underground marker. P0a finalizes the choice.

6. **Profile-quality witnesses** (full list in §7) covering competence report §4 requirements.

## 2. Non-Goals

- **No engine changes.** All new behavior is authored YAML.
- **No US / ARVN / NVA scope.** Sibling specs 202/203 already shipped US/NVA completion; 205 covers ARVN selector cleanup.
- **No new cap classes.** Existing `standard256` (and `deep1024` where appropriate) suffice.
- **No expansion / Trưng / solitaire bot content.**
- **No removal of existing VC witnesses.** `vc-avoids-conventional-attack-without-ambush.test.ts` and `vc-protects-bases-from-nva-infiltrate.test.ts` preserved; reattested in P5.
- **No `vc.eventOppositionOrResourceSwing` plan template.** Event handling stays with `shared.eventDirectSwing` (already bound in `vc-baseline` at `@3585`), per Spec 202's §11 resolution that FITL events expose no uniform bindable `decisionPath`.

## 3. Context (verified against codebase, 2026-05-27 / reassessed 2026-06-01)

- **Current VC library inventory** (`data/games/fire-in-the-lake/92-agents.md`):
  - **Templates (5)**: `vc.rallySubvert@1959`, `vc.marchSubvert@1971`, `vc.terrorSubvert@1983` (fully authored; this spec rebinds its selectors), `vc.terrorTax@1995` (fully authored; this spec rebinds its selectors), `vc.marchAmbushFromLoc@2007`.
  - **Faction-specific strategy modules (4)**: `vc.buildPoliticalNetwork@2794`, `vc.subvertRegimeSecurity@2814`, `vc.fundAndAmbushCarefully@2833`, `vc.denyNvaIfNearWin@2852`. Plus 7 shared modules bound via Spec 201 (`shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`, `shared.allyRivalThrottle`, `shared.monsoonOperationalRestriction`) — 11 bound total.
  - **Posture (1)**: `vc.protectOppositionAndBases@2141`.
  - **Guardrails (3 faction-specific + 1 shared)**: `vc.avoidConventionalAttackWithoutAmbush@3118`, `vc.protectBasesFromNvaInfiltrate@3130`, `vc.avoidHighPopTaxWithoutPoliticalPlan@3144`, plus the shared `dropPassWhenOtherMovesExist`.
  - **`vc-baseline` bindings** at `@3568-3613`.
- **Current VC witnesses** (under `packages/engine/test/policy-profile-quality/`, flat — no `fitl/vc/` subdirectory): 2 — `vc-avoids-conventional-attack-without-ambush.test.ts` and `vc-protects-bases-from-nva-infiltrate.test.ts` (both `@test-class: architectural-invariant`).
- **Agitation-readiness gap**: no module promotes Tax/March/Rally as Agitation-preparing actions when Coup is imminent. The existing `vc.buildPoliticalNetwork` covers Opposition generation but not Coup-phase resource/piece consolidation.
- **Tax intelligence gap**: `vc.terrorTax@1995` is authored against the generic `vc.taxFundingSpace@1555` selector, which already weights LoC tax-safety (`locTaxSafe` component, weight 8) but does not exclude populated Support spaces. The competence report's Tax-LoC-vs-Tax-populated discrimination needs a new LoC-targeted selector and a guardrail demoting populated-Support Tax.
- **Relationships**: `vc.nvaNominalAlly@2209` and `vc.nvaNearWin@2215` (relationship + condition definitions).
- **Already-used Spec 197 surface**: `enablesPlanTemplates` / `suppressesPlanTemplates` are in active use in the authored profile (e.g., `arvn.buildPoliticalEngine@2402-2406`); §4.3 modules extend the same surface.
- **Available role constraints**: `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn`, `notEqual` from Spec 196 — authored as single-key constructors `{KIND: {...payload}}` over `role.X` refs (e.g., `{reachable: {from: role.X, to: role.Y, via: routeClass.Z}}` at `92-agents.md:1454-1458`).
- **Available baseline features** (already authored): `feature.totalOpposition@172`, `feature.vcBaseCount@104`, `feature.vcGuerrillaCount@95` (all VC guerrillas, NOT Underground-specific), `feature.projectedArvnMarginDelta@274`, `feature.projectedVcMarginDelta@280`, `feature.projectedSelfMarginDelta@262`, `var.player.self.resources` (perPlayerVars), `condition.coupImminent.satisfied@486`, `condition.nvaNearWin.satisfied@450`, `condition.arvnNearWin.satisfied@438`, `condition.resourcesLow.satisfied@498`.
- **Missing features** (must author or proxy in this spec): `feature.projectedNvaMarginDelta` (no sibling of Arvn/Vc delta), `feature.vcUndergroundGuerrillaCount` (only the unfiltered `vcGuerrillaCount` exists). P0a finalizes the authoring/proxy decision.

## 4. Architecture

> YAML stanzas below use the authored surface in `data/games/fire-in-the-lake/92-agents.md`. Each artifact group cites a sibling for shape reference. Concrete `zoneProp.*` / `tokenProp.*` / preview-ref names are validated at P0a (§6 / §11) — the stanzas demonstrate the structural shape and identifier intent, not the final byte-for-byte authoring.

### 4.1 Plan templates (additions and rebindings)

**`vc.rallyBaseNetwork`** — Rally for Base placement / Underground guerrilla seeding:

```yaml
vc.rallyBaseNetwork:
  traceLabel: "VC Rally to seed VC Base and Underground network"
  root: { actionTags: [rally] }
  postureHook: vc.preserveUndergroundAndBases
  roles:
    rallySpace: { selector: vc.rallyBaseTarget, required: true }
  steps:
    - { label: rally-base-network, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: `vc.rallySubvert@1959` for single-action Rally over `targetSpaces`; drop the `compound` block for single-action templates (see `nva.rallyTrail` in archived Spec 203 §4.1 for the same single-action pattern).

**`vc.rallyTax`** — Rally + Tax compound (Tax funds future Terror/Rally):

```yaml
vc.rallyTax:
  traceLabel: "VC Rally then Tax to fund future ops"
  root: { actionTags: [rally], compound: { specialTags: [tax], timing: after } }
  postureHook: vc.preserveAgitationResources
  roles:
    rallySpace: { selector: vc.rallySpaceForFutureOps, required: true }
    taxSpace: { selector: vc.taxLocTarget, required: true }
  steps:
    - { label: rally-future-ops, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
    - { label: tax-loc-funding, role: taxSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: tax } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: `vc.terrorTax@1995` for the Rally+Tax compound shape (same `compound.specialTags: [tax]` and `timing: after` pattern).

**Selector rebinding on `vc.terrorTax`** (existing template at `@1995-2006`):

```yaml
# Diff against current @1995-2006:
vc.terrorTax:
  traceLabel: "VC Terror then Tax"
  root: { actionTags: [terror], compound: { specialTags: [tax], timing: after } }
  postureHook: vc.protectOppositionAndBases
  roles:
    terrorSpace: { selector: vc.terrorHighPopTarget, required: true }  # was: vc.terrorAgitationSpace
    taxSpace:    { selector: vc.taxLocTarget,        required: true }  # was: vc.taxFundingSpace
  steps:
    - { label: terror-political-space, role: terrorSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
    - { label: tax-safe-funding,       role: taxSpace,    match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: tax } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

The new selectors carry the high-pop-non-COIN-controlled and LoC-targeted weights the competence report calls for; the existing template structure is unchanged.

**Selector rebinding on `vc.terrorSubvert`** (existing template at `@1983-1994`):

```yaml
# Diff against current @1983-1994:
vc.terrorSubvert:
  traceLabel: "VC Terror then Subvert"
  root: { actionTags: [terror], compound: { specialTags: [subvert], timing: after } }
  postureHook: vc.protectOppositionAndBases
  roles:
    terrorSpace:   { selector: vc.terrorHighPopTarget,    required: true }  # was: vc.terrorAgitationSpace
    subvertSpace:  { selector: vc.subvertHighValueTarget, required: true }  # was: vc.subvertArvnControlSpace
  steps:
    - { label: terror-political-space, role: terrorSpace,  match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
    - { label: subvert-arvn-control,   role: subvertSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: subvert } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

**`vc.marchSpread`** — March to spread Underground network into Opposition / Neutral spaces:

```yaml
vc.marchSpread:
  traceLabel: "VC March to spread Underground into Opposition / Neutral"
  root: { actionTags: [march] }
  postureHook: vc.preserveUndergroundAndBases
  roles:
    marchSpace: { selector: vc.marchSpreadDestination, required: true }
  steps:
    - { label: march-spread-underground, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Note: FITL March does not expose a separate `originSpaces` decision path in the current authored action surface (see archived Spec 203 §4.1 `nva.marchControl` for the same single-binding pattern). Cross-zone March routing is filtered at the selector layer.

**`vc.attackAmbush`** — Attack with Ambush selector for surgical removal:

```yaml
vc.attackAmbush:
  traceLabel: "VC Attack then Ambush for surgical removal"
  root: { actionTags: [attack], compound: { specialTags: [ambush-vc], timing: after } }
  postureHook: vc.preserveUndergroundAndBases
  roles:
    attackSpace: { selector: vc.attackAmbushTarget, required: true }
  steps:
    - { label: attack-ambush-position, role: attackSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: attack } }
    - { label: ambush-surgical-removal, role: attackSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-vc } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

Authoring reference: existing `vc.marchAmbushFromLoc@2007` for the VC `ambush-vc` compound pattern; `nva.attackAmbush@1918` for the Attack+Ambush template shape.

**`vc.agitationPrep`** — Coup-support Agitation template that consolidates VC pieces and Resources in non-COIN-Controlled spaces:

```yaml
vc.agitationPrep:
  traceLabel: "VC prepare Agitation-ready spaces before Coup"
  root: { actionTags: [agitate] }  # resolved by 204FITLVCCOM-002; Coup-support phase
  postureHook: vc.preserveAgitationResources
  roles:
    prepSpace: { selector: vc.agitationReadinessTarget, required: true }
  steps:
    - { label: agitation-prep, role: prepSpace, match: { decisionKind: chooseOne, targetKind: zone, decisionPath: targetSpace, actionTag: agitate } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

P0b resolved the action tag as `agitate` on the authored `coupAgitateVC` action (`phase: [coupSupport]`). The template therefore represents direct Coup-support Agitation selection; card-phase Agitation preparation remains encoded by `vc.rallyTax` + `vc.marchSpread` + `vc.terrorTax` rebinding under the `vc.agitationReadiness` doctrine (see §4.3).

### 4.2 Selectors (additions — item-local features)

All selectors use the verified `scopes`/`source`/`quality`/`result` surface. Item-local zone reads use the nested `zoneProp: { zone: { ref: selector.item.key }, prop: <name> }` form for static attrs (`population`, `econ`, `category`); per-zone marker reads use `lookup: { surface: policyState, collection: zones, keyType: ZoneId, key: { ref: selector.item.key }, path: [markers, supportOpposition], onMissing: { kind: constant, value: neutral } }`. Faction-specific per-zone token counts use proxies (population + supportOpposition markers + global feature deltas) per Spec 202's §11 audit; per-zone token counts owned by a specific faction are not directly expressible via `zoneTokenAgg` (its `owner` resolves zone ownership, not token faction — see `archive/specs/202-fitl-us-completion.md:466-478`).

**`vc.terrorHighPopTarget`** — high-population non-COIN-Controlled Support space:

```yaml
vc.terrorHighPopTarget:
  scopes: [move]
  source: { collection: { kind: zones } }
  quality:
    components:
      - id: populationLeverage
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: population }
            - 0
        weight: 5
      - id: supportTarget
        value:
          boolToNumber:
            eq:
              - lookup:
                  surface: policyState
                  collection: zones
                  keyType: ZoneId
                  key: { ref: selector.item.key }
                  path: [markers, supportOpposition]
                  onMissing: { kind: constant, value: neutral }
              - activeSupport
        weight: 4
      - id: nonCoinControlled
        # Proxy: high-population spaces are the COIN-control swing — see Spec 202 §11.
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: population }
            - 0
        weight: 3
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

Authoring reference: `vc.terrorAgitationSpace@1509` for the population+supportOpposition pattern.

**`vc.taxLocTarget`** — LoC tax targeting (the high-pop-populated-Support exclusion is handled by the guardrail in §4.5):

```yaml
vc.taxLocTarget:
  scopes: [move]
  source: { collection: { kind: zones } }
  quality:
    components:
      - id: locFunding
        value:
          boolToNumber:
            eq:
              - zoneProp: { zone: { ref: selector.item.key }, prop: category }
              - loc
        weight: 8
      - id: econYield
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: econ }
            - 0
        weight: 3
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

Authoring reference: `vc.taxFundingSpace@1555` for the LoC + econ idiom. This selector enforces LoC-only via `weight: 8` on the LoC check (matching the existing `vc.taxFundingSpace`'s `locTaxSafe` weight).

**`vc.rallyBaseTarget`**, **`vc.rallySpaceForFutureOps`**, **`vc.subvertHighValueTarget`**, **`vc.marchSpreadDestination`**, **`vc.attackAmbushTarget`**, **`vc.agitationReadinessTarget`** — shaped analogously over `scopes`/`source`/`quality`/`result`. Each authors a `quality.components` slice over verified item-local refs (`zoneProp` static attrs + `lookup` markers); selectors that need NVA-Infiltrate-vulnerability proxies use `feature.nvaMargin@67` + populated-Support markers. P0a resolves any remaining vocabulary gap before authoring (§11).

### 4.3 Strategy modules (additions)

All modules use the verified `traceLabel`/`when`/`applies`/`priority`/`selectors`/`scoreGroups`/`guardrailIds`/`fallback` surface plus Spec 197's `enablesPlanTemplates`/`suppressesPlanTemplates`. Reference shape: `vc.buildPoliticalNetwork@2794`; `enablesPlanTemplates` shape: `arvn.buildPoliticalEngine@2402-2406`.

```yaml
vc.oppositionEngine:
  traceLabel: "VC build opposition engine"
  when:
    lt:
      - { ref: feature.totalOpposition }
      - 20
  applies:
    scopes: [move]
    actionTags: [terror, rally]
  priority: { tier: 45 }
  selectors:
    - { role: terrorTarget, selectorId: vc.terrorHighPopTarget }
    - { role: rallyTarget,  selectorId: vc.rallyBaseTarget }
  scoreGroups:
    - id: oppositionDrive
      summary: sum
      terms:
        - { id: oppositionDelta, weight: 5, value: 1 }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
  enablesPlanTemplates:
    - vc.terrorTax
    - vc.terrorSubvert
    - vc.rallyBaseNetwork

vc.baseNetwork:
  traceLabel: "VC build base network"
  when:
    lt:
      - { ref: feature.vcBaseCount }
      - 5
  applies:
    scopes: [move]
    actionTags: [rally]
  priority: { tier: 40 }
  selectors:
    - { role: rallyTarget, selectorId: vc.rallyBaseTarget }
  scoreGroups:
    - id: baseSeed
      summary: sum
      terms:
        - { id: baseProtectionDrive, weight: 6, value: 1 }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
  enablesPlanTemplates:
    - vc.rallyBaseNetwork

vc.subvertPatronage:
  traceLabel: "VC subvert ARVN patronage when ARVN near win"
  when: { ref: condition.arvnNearWin.satisfied }
  applies:
    scopes: [move]
    actionTags: [rally, march, terror]
  priority: { tier: 55 }
  selectors:
    - { role: subvertTarget, selectorId: vc.subvertHighValueTarget }
  scoreGroups:
    - id: patronageDenial
      summary: sum
      terms:
        - id: arvnMarginDenial
          weight: 5
          value:
            sub:
              - 0
              - { ref: feature.projectedArvnMarginDelta }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
  enablesPlanTemplates:
    - vc.rallySubvert
    - vc.marchSubvert
    - vc.terrorSubvert

vc.agitationReadiness:
  traceLabel: "VC prepare Agitation-ready spaces"
  when: { ref: condition.coupImminent.satisfied }
  applies:
    scopes: [move]
    actionTags: [tax, rally, march]
  priority: { tier: 65 }
  selectors:
    - { role: prepTarget, selectorId: vc.agitationReadinessTarget }
  scoreGroups:
    - id: agitationPrep
      summary: sum
      terms:
        - { id: agitationReadyDrive, weight: 7, value: 1 }
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
  enablesPlanTemplates:
    - vc.agitationPrep
    - vc.rallyTax
    - vc.marchSpread

vc.nvaRivalRisk:
  traceLabel: "VC suppress Infiltrate-vulnerable patterns when NVA near win"
  when: { ref: condition.nvaNearWin.satisfied }
  applies:
    scopes: [move]
    actionTags: [rally, march]
  priority: { tier: 60 }
  selectors:
    - { role: protectTarget, selectorId: vc.rallyBaseTarget }
  scoreGroups:
    - id: nvaDenial
      summary: sum
      terms:
        - id: nvaMarginDenial
          weight: 5
          value:
            sub:
              - 0
              - { ref: feature.projectedNvaMarginDelta }   # new candidateFeature — see §5
  guardrailIds: []
  fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
  suppressesPlanTemplates:
    - vc.rallyBaseNetwork    # demote when NVA-Infiltrate-vulnerable Base placement would help NVA
```

### 4.4 Posture evaluators (additions)

All postures use the verified `must`/`prefer` surface with `fallback: { contribution: 0 }`. Reference shape: `vc.protectOppositionAndBases@2141` and `us.preserveSupportAndAvailability@2049-2092` (the Spec 202 strengthening pattern).

```yaml
vc.preserveUndergroundAndBases:
  traceLabel: "VC preserve Underground guerrillas and VC Bases"
  prefer:
    - id: underground-network
      # P0a resolves: either feature.vcUndergroundGuerrillaCount (if authored via globalTokenAgg)
      # or feature.vcGuerrillaCount as a coarser proxy.
      value:
        coalesce:
          - { ref: preview.feature.vcGuerrillaCount }
          - { ref: feature.vcGuerrillaCount }
      weight: 5
      fallback: { contribution: 0 }
    - id: base-network
      value:
        coalesce:
          - { ref: preview.feature.vcBaseCount }
          - { ref: feature.vcBaseCount }
      weight: 4
      fallback: { contribution: 0 }

vc.preserveAgitationResources:
  traceLabel: "VC preserve Resources for Coup-phase Agitation"
  prefer:
    - id: coup-resource-floor
      when: { ref: condition.coupImminent.satisfied }
      value:
        boolToNumber:
          lt:
            - coalesce:
                - { ref: preview.var.player.self.resources }
                - { ref: var.player.self.resources }
            - 5
      weight: -4
      fallback: { contribution: 0 }

vc.avoidNvaKingmaking:
  traceLabel: "VC avoid improving NVA margin when NVA near win"
  prefer:
    - id: nva-kingmaking
      when: { ref: condition.nvaNearWin.satisfied }
      value:
        coalesce:
          - { ref: preview.feature.projectedNvaMarginDelta }
          - { ref: feature.projectedNvaMarginDelta }
      weight: -5
      fallback: { contribution: 0 }
```

`vc.preserveUndergroundAndBases` is attached as `postureHook` on `vc.rallyBaseNetwork`, `vc.attackAmbush`, and `vc.marchSpread` (§4.1). `vc.preserveAgitationResources` is attached on `vc.rallyTax` and `vc.agitationPrep`. `vc.avoidNvaKingmaking` is bound via the `vc.nvaRivalRisk` strategy module rather than a `postureHook` because no single template carries it (per Spec 202 §11's resolution that unhooked postures are inert; an alternative is to attach it as a second `prefer` term on `vc.protectOppositionAndBases` — P2b decides).

### 4.5 Guardrails (additions and strengthening)

`vc.avoidTaxWhenSupportShiftIsTooCostly` — demote Tax candidates on populated Support spaces unless `resourcesLow`. The "tax space is populated Support" proxy uses `feature.projectedSelfMarginDelta` plus `condition.resourcesLow.satisfied`; the candidate-tag check is the primary trigger. Reference shape: `vc.avoidHighPopTaxWithoutPoliticalPlan@3144`.

```yaml
vc.avoidTaxWhenSupportShiftIsTooCostly:
  traceLabel: "VC avoid Tax on populated Support unless resources critical"
  scopes: [move]
  when:
    and:
      - { ref: candidate.tag.tax }
      - lt:
          - { ref: feature.projectedSelfMarginDelta }
          - 1
      - not: { ref: condition.resourcesLow.satisfied }
  severity: demote
  penalty: 400
  onUnavailable: noFire
```

Note: `roleTarget.<role>.*` is a nonexistent ref shape (see Spec 202 §9 Corrected — `archive/specs/202-fitl-us-completion.md:444`). Populated-Support exclusion is therefore expressed through the `projectedSelfMarginDelta` proxy (Tax on populated Support has a negative projected delta because Support→Opposition costs VC margin) plus the `resourcesLow` gate.

Strengthen existing `vc.protectBasesFromNvaInfiltrate@3130` by adding an NVA-near-win clause to its `when` (currently fires on `nvaMargin >= -2`):

```yaml
vc.protectBasesFromNvaInfiltrate:
  traceLabel: "VC protect Bases from NVA Infiltrate"
  scopes: [move]
  when:
    and:
      - or:
          - { ref: candidate.tag.rally }
          - { ref: candidate.tag.march }
      - or:
          - gte:
              - { ref: feature.nvaMargin }
              - -2
          - { ref: condition.nvaNearWin.satisfied }
  severity: demote
  penalty: 400
  onUnavailable: noFire
```

### 4.6 Bindings

Update `vc-baseline.use` (existing block at `@3568-3613`):

```yaml
vc-baseline:
  use:
    guardrails:
      # existing: dropPassWhenOtherMovesExist, vc.avoidConventionalAttackWithoutAmbush,
      # vc.protectBasesFromNvaInfiltrate, vc.avoidHighPopTaxWithoutPoliticalPlan
      - vc.avoidTaxWhenSupportShiftIsTooCostly  # new
    strategyModules:
      # existing 11 (7 shared + 4 VC) preserved
      - vc.oppositionEngine
      - vc.baseNetwork
      - vc.subvertPatronage
      - vc.agitationReadiness
      - vc.nvaRivalRisk
    planTemplates:
      # existing 5 preserved
      - vc.rallyBaseNetwork
      - vc.rallyTax
      - vc.marchSpread
      - vc.attackAmbush
      - vc.agitationPrep
```

Postures `vc.preserveUndergroundAndBases`, `vc.preserveAgitationResources`, and (if applicable) `vc.avoidNvaKingmaking` are wired through `postureHook` on the listed templates rather than directly in `vc-baseline.use` (consistent with the existing `vc.protectOppositionAndBases` pattern).

## 5. Edge cases and prerequisites

- **`vc.agitationPrep` action tag (P0b)**: resolved by 204FITLVCCOM-002 as `agitate` on the authored `coupAgitateVC` action. The tag is published in `phase: [coupSupport]`, not during card-phase Operations, so `vc.agitationPrep` covers direct Coup-support Agitation selection while card-phase preparation remains encoded through `vc.rallyTax` + `vc.marchSpread` + the `vc.agitationReadiness` strategy module's non-Agitation template gates.
- **`feature.projectedNvaMarginDelta` (P1)**: missing — only `projectedArvnMarginDelta@274` and `projectedVcMarginDelta@280` exist. Author as a new candidateFeature `sub(feature.projectedNvaMargin, feature.nvaMargin)` per the Spec 202 pattern (`archive/specs/202-fitl-us-completion.md:466-478`); P0a confirms both operands exist.
- **`feature.vcUndergroundGuerrillaCount` (P0a → P1)**: missing — only `feature.vcGuerrillaCount@95` (unfiltered) exists. P0a resolution path: (a) author via `globalTokenAgg` with a token-active-state filter (verify the operator supports an `isUnderground`/`active` predicate against an existing `globalTokenAgg@<ref>` for shape), (b) re-express the posture via per-zone `lookup` for the Underground marker, or (c) use the coarser `vcGuerrillaCount` as the posture's `prefer` value (draft in §4.4 already uses this fallback).
- **`vc.subvertHighValueTarget` vocabulary (P0a)**: pre-resolve the per-zone ARVN-Patronage proxy (likely a combination of `population` + `supportOpposition: passiveSupport` marker + a `feature.projectedArvnMarginDelta` sign filter) before P1 authoring. The template `vc.terrorSubvert` and module `vc.subvertPatronage` both bind to this selector.
- **Spec 196 constraint kinds in compounds**: `{notEqual: role.X}` is the inline-key form (not `{kind: notEqual, a, b}`). Per-template constraints in §4.1 use the verified surface; no `kind:` wrapper.
- **`vc.terrorTax` and `vc.terrorSubvert`**: the existing bodies at `@1995-2006` and `@1983-1994` are fully authored; the change is selector rebinding (see §4.1 diffs). Replay-identity preservation against the existing two VC witnesses is verified in P5 — the rebound selectors must keep the existing witnesses' chosen candidates byte-identical.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0a** | Capability/vocabulary re-expression audit — produce a table classifying every `zoneProp.*`/feature-ref/condition the spec uses into (a) authorable, (b) authorable via proxy, (c) requires engine work. Mirror `archive/specs/202-fitl-us-completion.md:466-478`. Includes `vc.subvertHighValueTarget` zone-prop vocabulary and the `vcUndergroundGuerrillaCount`-vs-proxy decision. | Audit table merged into §11 Open Questions resolution log; all signals classified (a) or (b); no (c) entries remaining without an engine-prerequisite spec. | S |
| **P0b** | Agitation action-tag investigation — verify whether the engine publishes an Agitation tag during card-phase preparation, or if VC Agitation is purely Coup-phase resolution. | Resolved in §11: `vc.agitationPrep` is authored under the Coup-support `agitate` tag; card-phase preparation routes through `vc.agitationReadiness` gates on `vc.rallyTax` / `vc.marchSpread` / `vc.terrorTax`. | S |
| **P1** | New candidateFeatures (`feature.projectedNvaMarginDelta` + Underground-Guerrilla feature/proxy per P0a) AND new VC plan templates (§4.1) AND selector rebinding on `vc.terrorTax`/`vc.terrorSubvert`. | All compile; `92-agents.md` builds byte-identical to a reference run with the additions folded in. | M |
| **P2a** | VC strategy modules (§4.3) | All compile; `enablesPlanTemplates`/`suppressesPlanTemplates` references all resolve to authored templates. | S |
| **P2b** | VC posture evaluators + guardrails (§4.4, §4.5) | All compile; `severity` values are valid `GuardrailSeverity` enum members. | S |
| **P3** | `vc-baseline` bindings update (§4.6) | Profile compiles; existing two VC witnesses pass; bound module/template/guardrail lists match §4.6. | S |
| **P4** | VC profile-quality witness suite (§7) — 8 new witnesses. | All witnesses pass; thresholds calibrated against the four-profile convergence canary (mirroring Spec 202 P6). | M |
| **P5** | Replay-identity reattestation against Spec 201 baseline AND explicit regression coverage of `vc-avoids-conventional-attack-without-ambush.test.ts` + `vc-protects-bases-from-nva-infiltrate.test.ts`. | All FITL canaries byte-identical with VC changes folded in; two preserved witnesses pass under expanded module/template/guardrail set. | S |

## 7. Test plan

All witnesses live FLAT under `packages/engine/test/policy-profile-quality/` (no `fitl/vc/` subdirectory — matches the existing convention used by `vc-avoids-conventional-attack-without-ambush.test.ts` and `vc-protects-bases-from-nva-infiltrate.test.ts`).

**Preserved (existing)**:
- `packages/engine/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.ts` — preserved unmodified; regression-asserted in P5.
- `packages/engine/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.ts` — preserved; strengthened guardrail (§4.5) must not break this witness.

**New (8 witnesses)**:
- `vc-terror-high-pop-non-coin-controlled.test.ts` — `vc.terrorHighPopTarget` picks the highest-population non-COIN-Controlled Support space.
- `vc-tax-funds-future-terror-rally.test.ts` — `vc.rallyTax` chosen when Resources are low AND a LoC Tax target exists.
- `vc-subvert-drops-arvn-patronage.test.ts` — when `condition.arvnNearWin.satisfied`, `vc.terrorSubvert` or `vc.rallySubvert` chosen over plain Terror/Rally.
- `vc-march-spreads-underground.test.ts` — `vc.marchSpread` chooses destinations that keep guerrillas Underground.
- `vc-attack-only-with-ambush.test.ts` — `vc.attackAmbush` preferred over conventional Attack (existing `vc.avoidConventionalAttackWithoutAmbush` guardrail still fires).
- `vc-agitation-prep-before-coup.test.ts` — when `condition.coupImminent.satisfied`, plan selects `vc.agitationPrep` / `vc.rallyTax` / `vc.marchSpread` over speculative setup.
- `vc-blocks-nva-near-win.test.ts` — when `condition.nvaNearWin.satisfied`, plan selects NVA-Control-denial or VC-Base-protection (`vc.nvaRivalRisk` suppresses Infiltrate-vulnerable Base templates).
- `vc-tax-on-populated-support-vetoed.test.ts` — `vc.avoidTaxWhenSupportShiftIsTooCostly` fires on Tax+populated-Support unless `resourcesLow`.

All witnesses use `@test-class: architectural-invariant` per the `.claude/rules/testing.md` default.

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 (Engine Agnosticism) | YAML-only; no engine code touched (two new candidateFeatures are YAML-authored, not kernel code) |
| #2 (Evolution-First) | All doctrine encoded in `92-agents.md` GameSpecDoc YAML — evolvable |
| #15 (Architectural Completeness) | Closes the VC competence gap end-to-end; reauthors against the verified surface (no fictional schema) |
| #16 (Testing as Proof) | 8 new profile-quality witnesses cover competence report §4; 2 existing witnesses preserved + reattested |
| #19 (Decision-Granularity Uniformity) | Terror+Tax, Terror+Subvert, Attack+Ambush, Rally+Tax compounds emerge from `root.compound` + `steps` over the `targetSpaces` microturn surface |
| #20 (Preview Signal Integrity) | All preview-derived `prefer` terms declare `fallback: { contribution: 0 }` per the verified posture-evaluator surface (NOT `previewFallback.onUnavailable: noContribution` — that is the trigger report's fictional shape) |

## 9. Reassessment of source proposal

**Adopted:**
- §5 VC recommendations → §§4.1–4.6.
- §6.8 VC plan-template list → §4.1.
- §6.10 VC guardrails (`vc.avoidTaxWhenSupportShiftIsTooCostlyUnlessResourcesCritical`, `vc.protectBaseFromNvaInfiltrate`) → §4.5.

**Adopted with adjustment:**
- Proposal lists `vc.marchAmbushFromLoc` as preserve-and-strengthen; it already exists at `@2007`. This spec preserves it; `vc.attackAmbush` and the existing `vc.marchAmbushFromLoc` cover the Attack+Ambush and March+Ambush patterns separately.
- Proposal lists `vc.terrorTax` and `vc.terrorSubvert` as if new; they already exist fully authored at `@1995` and `@1983`. This spec rebinds their selectors (§4.1 diffs).

**Corrected:**
- **The proposal's template/module/posture/guardrail YAML used field names (`matchActionTag`, `microturnSteps`/`bindTo`, `compoundSpecial`, `posture:`, `trigger:`/`effect:`, `previewFallback`) that do not match the real authoring surface; §4 now uses the verified surface (`root`/`steps`/`postureHook`/`compound`, `selectors`/`scoreGroups`, `must`/`prefer` with `fallback: { contribution: 0 }`, `severity`/`penalty`) per the existing `vc.terrorTax@1995`, `vc.protectOppositionAndBases@2141`, and `vc.avoidConventionalAttackWithoutAmbush@3118`.** This mirrors the same correction Specs 202 (`archive/specs/202-fitl-us-completion.md:444`) and 203 (`archive/specs/203-fitl-nva-completion.md`) applied to the same trigger-report's US and NVA slices.
- The proposal lists 5 `postState` predicates (`notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`); these are role-constraint kinds added by Spec 196, NOT literal `postState` predicate kinds. The §4.1 templates use them as role constraints in the authored inline-key form (`{KIND: {...}}`).
- The proposal uses `effect: veto` for the populated-Support Tax guardrail; `veto` is not a valid `GuardrailSeverity` (the enum is `prune`/`demote`/`warn`/`auditOnly`; `prune` is reserved for the pass-drop guardrail). §4.5 uses `severity: demote, penalty: 400` as the FITL idiom for "veto" intent (matching Spec 202 §11).
- The proposal uses `roleTarget.<role>.*` refs (e.g., `roleTarget.taxSpace.isPopulated`); these refs do not exist (see Spec 202 §9 Corrected, line 444). §4.5 re-expresses populated-Support exclusion via `feature.projectedSelfMarginDelta` proxy + `condition.resourcesLow`.
- The proposal does not address VC Agitation tag uncertainty; §5 records it as P0b deliverable, since VC Agitation is a Coup-phase action rather than an Operation tag.

**Deferred:**
- Card-by-card event valuation taxonomy — proposal's §4 Event row already deferred this; this spec routes event handling through the already-bound `shared.eventDirectSwing` strategy module (no dedicated VC event plan template, matching Spec 202's `us.eventDirectSwing` §11 resolution that FITL events expose no uniform bindable `decisionPath`).
- `vc.eventOppositionOrResourceSwing` as a dedicated plan template — uncommitted; reversible via follow-up ticket post-204 if a witness shows `shared.eventDirectSwing` does not differentiate VC Opposition/Resource event swings.

## 10. Out of scope (named follow-on / sibling)

- **Spec 201** — shared doctrine + lifecycle awareness (soft prerequisite, COMPLETED).
- **Spec 202** — US completion (COMPLETED; shares the `roleTarget.*` re-expression resolution and verified-surface correction this spec mirrors).
- **Spec 203** — NVA completion (COMPLETED; shares the verified-surface pattern).
- **Spec 205** — ARVN selector cleanup (sibling).
- VC Cadre / specialist-card-specific templates — uncommitted.

## 11. Open questions

- **P0a capability/vocabulary audit** — **RESOLVED by 204FITLVCCOM-001 (2026-06-01). No engine-prerequisite entries remain; P1 can author entirely in `data/games/fire-in-the-lake/92-agents.md`.** Audit evidence: item-local static zone reads use the existing `zoneProp: { zone: { ref: selector.item.key }, prop: <name> }` form seen in `vc.terrorAgitationSpace` / `vc.taxFundingSpace`; dynamic Support/Opposition reads use `lookup` at `path: [markers, supportOpposition]`; `globalTokenAgg.tokenFilter.props` accepts arbitrary scalar token properties and the evaluator matches them against `token.props`; FITL guerrilla tokens use `activity: underground`; `feature.projectedNvaMargin` and `feature.nvaMargin` already exist beside the ARVN/VC projected-margin delta siblings. Classification:

  | Spec signal | Real expression for P1 authoring | Class |
  |---|---|---|
  | `vc.subvertHighValueTarget` ARVN-Patronage proxy | Selector score over item-local `zoneProp.population` + `lookup supportOpposition` favoring `activeSupport` / `passiveSupport` + `feature.projectedArvnMarginDelta` as the candidate-level sign signal; this mirrors the Spec 202 proxy pattern for faction-specific target value where per-zone patronage/control is not item-locally readable. | (b) authorable via proxy |
  | `feature.vcUndergroundGuerrillaCount` | New candidate/state feature using `globalTokenAgg: { aggOp: count, tokenFilter: { props: { faction: { eq: VC }, type: { eq: guerrilla }, activity: { eq: underground } } } }`; `globalTokenAgg.tokenFilter.props` is validated as scalar `{ eq: ... }`, and runtime matching is case-insensitive for string token props. | (a) authorable |
  | `feature.projectedNvaMarginDelta` | New candidateFeature sibling of `projectedUsMarginDelta`, `projectedArvnMarginDelta`, and `projectedVcMarginDelta`: `sub(feature.projectedNvaMargin, feature.nvaMargin)`. Both operands already exist. | (a) authorable |
  | Item-local `population`, `econ`, `category` | `zoneProp` static attrs. `population` / `econ` are zone attributes; `category` is resolved as a synthetic static zone property. `loc` is an existing category value in the FITL content. | (a) authorable |
  | `terrain` / Highland / Jungle targeting | No static `terrain` property is needed for P1; use existing zone categories/static attrs and legal-move enumeration. If a future selector needs Highland/Jungle-specific ranking, it should first verify the exact authored static property in `40-content-data-assets.md` instead of inventing `terrain`. | (b) re-expressed by avoiding unverified prop |
  | Dynamic `supportOpposition` marker | `lookup: { surface: policyState, collection: zones, keyType: ZoneId, key: { ref: selector.item.key }, path: [markers, supportOpposition], onMissing: { kind: constant, value: neutral } }`, already used by existing FITL selectors. | (a) authorable |
  | Per-zone faction-token needs such as `hasVcPiece`, `hasCoinPiece`, NVA-Infiltrate vulnerability, or COIN-control filters | Keep the Spec 202 correction: `zoneTokenAgg.owner` resolves owner-relative zones and does not filter token faction for an item-local zone. P1 selectors use legal-move enumeration plus proxies (`population`, `supportOpposition`, and global projected margin deltas) rather than hypothetical per-zone faction-token filters. | (b) authorable via proxy |
- **Agitation action tag** — **RESOLVED by 204FITLVCCOM-002 (2026-06-01), refined by 204FITLVCCOM-004: use `agitate` with `chooseOne` / `targetSpace`.** Grep evidence found the authored Coup-support action `coupAgitateVC` in `data/games/fire-in-the-lake/30-rules-actions.md` with `tags: [agitate]`, `actor: active`, `phase: [coupSupport]`, and singular `targetSpace` / `action` parameters for VC Agitation. No engine hardcoding was found under `packages/engine/src/`; the tag is GameSpecDoc-authored. Ticket 004 authored `vc.agitationPrep` with `root.actionTags: [agitate]` and a matching step `decisionKind: chooseOne`, `decisionPath: targetSpace`, `actionTag: agitate`. Caveat: this is a Coup-support-phase tag, not a card-phase Operation tag, so the template represents direct Agitation selection when the Coup-support microturn is published; card-phase preparation remains encoded through `vc.rallyTax`, `vc.marchSpread`, and `vc.terrorTax` under the future `vc.agitationReadiness` doctrine.
- **Threshold calibration** — **P4.** Draft thresholds (`totalOpposition < 20`, `vcBaseCount < 5`, `resources < 5`) calibrated against the four-profile convergence canary, mirroring Spec 202 P6's `totalSupport < 30` / `availableUsTroops < 4` / `aid < 15` resolution.
- **`vc.avoidNvaKingmaking` attachment surface** — **P2b.** Author as a standalone posture wired via the `vc.nvaRivalRisk` strategy module's reference (consistent with Spec 202's `us.avoidArvnKingmaking` as a guardrail), or extend `vc.protectOppositionAndBases@2141` with a second `prefer` term. Decide during posture authoring.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-06-01. First wave covered P0a/P0b/P1 only so P2a/P2b/P3/P4/P5 could author against the actual audit results rather than hypothetical refs. Remaining phases were decomposed after 001-004 closed.

- [`archive/tickets/204FITLVCCOM-001.md`](../archive/tickets/204FITLVCCOM-001.md) — P0a Capability / vocabulary re-expression audit (covers §6 P0a)
- [`archive/tickets/204FITLVCCOM-002.md`](../archive/tickets/204FITLVCCOM-002.md) — P0b Agitation action-tag investigation (covers §6 P0b)
- [`archive/tickets/204FITLVCCOM-003.md`](../archive/tickets/204FITLVCCOM-003.md) — P1 VC candidateFeatures and new selectors (covers §6 P1, §4.2)
- [`archive/tickets/204FITLVCCOM-004.md`](../archive/tickets/204FITLVCCOM-004.md) — P1 VC plan templates and terrorTax / terrorSubvert selector rebinding (covers §6 P1, §4.1)
- [`archive/tickets/204FITLVCCOM-005.md`](../archive/tickets/204FITLVCCOM-005.md) — P2a VC strategy modules (covers §6 P2a, §4.3)
- [`tickets/204FITLVCCOM-006.md`](../tickets/204FITLVCCOM-006.md) — P2b VC posture evaluators and guardrails (covers §6 P2b, §4.4, §4.5)
- [`tickets/204FITLVCCOM-007.md`](../tickets/204FITLVCCOM-007.md) — P3 `vc-baseline` bindings update (covers §6 P3, §4.6)
- [`tickets/204FITLVCCOM-008.md`](../tickets/204FITLVCCOM-008.md) — P4-P5 witness suite and final reattestation (covers §6 P4/P5, §7)

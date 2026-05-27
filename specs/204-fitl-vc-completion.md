# Spec 204 — FITL VC Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `vc-baseline` has 5 plan templates, 4 strategy modules, 3 guardrails, and 2 profile-quality witnesses, vs. ARVN's 6/8/7/10. The competence report (`reports/fitl-competent-agent-ai.md` §4) requires VC to be encoded as a clandestine political-insurgent network that builds Opposition + VC Bases, stays Underground, uses Terror/Tax/Subvert/Agitation intelligently, Taxes LoCs preferentially over populated spaces, protects VC Bases from NVA Infiltrate, and prepares Agitation before each Coup. The most under-encoded competence area today is **Coup-support-phase Agitation preparation** — VC's Terror turn is half the story, the agent must also value Tax/March/Rally that create Agitation-ready spaces.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. No engine work. Consumes shared scaffolding from Spec 201.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `adjacent` for Ambush-from-LoC
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — eligibility gating
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — compound probe for Terror+Tax, Terror+Subvert, etc.
- **Soft**: `specs/201-fitl-shared-doctrine-and-lifecycle.md` (PROPOSED)

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27).

**Ticket namespace**: `204FITLVCCOMP`

---

## 1. Goal

Complete `vc-baseline` to ARVN-parity by authoring plan templates, strategy modules, posture, and witnesses for the VC competence requirements (`reports/fitl-competent-agent-ai.md` §4). Concretely:

1. **New VC plan templates**:
   - `vc.rallyBaseNetwork` — Rally for Base / Underground guerrilla placement in Highland/Jungle and non-Support spaces.
   - `vc.rallyTax` — Rally + Tax compound where Tax funds future Terror/Rally.
   - `vc.terrorTax` — Terror + Tax compound; Tax on LoC where the Support shift is harmless.
   - `vc.terrorSubvert` — Terror + Subvert compound to break ARVN Control and Patronage simultaneously.
   - `vc.marchSpread` — March to spread Underground network into Opposition / Neutral spaces.
   - `vc.attackAmbush` — Attack with Ambush selector for surgical removal.
   - `vc.agitationPrep` — pre-Coup template that consolidates VC pieces and Resources in non-COIN-Controlled spaces.
   - `vc.eventOppositionOrResourceSwing` — Event template.

2. **New VC strategy modules**:
   - `vc.oppositionEngine` — gates Terror/Rally templates when total Opposition trails; promotes high-pop Support→Opposition shift targets.
   - `vc.baseNetwork` — gates Rally for VC Base placement when VC base count is low.
   - `vc.subvertPatronage` — when ARVN near win, promote Subvert targets that drop Patronage.
   - `vc.agitationReadiness` — when Coup imminent, promote Tax/Rally/March that create Agitation-ready spaces (VC pieces in non-COIN-Controlled, Resources ≥ Agitation cost).
   - `vc.nvaRivalRisk` — when NVA near win, demote any template whose Infiltrate-vulnerable Base position would help NVA, and promote Base-protection or Opposition-denial targets.

3. **New VC posture evaluators**:
   - `vc.preserveUndergroundAndBases` — explicit `prefer` for projected Underground-guerrilla preservation; demote candidates that activate guerrillas without payoff.
   - `vc.preserveAgitationResources` — demote candidates that drop Resources below per-faction Agitation floor when Coup imminent.
   - `vc.avoidNvaKingmaking` — demote candidates that improve NVA margin when NVA near win.

4. **New VC guardrails**:
   - `vc.avoidTaxWhenSupportShiftIsTooCostly` — vetoes Tax on populated Support spaces unless Resources are critically low.
   - Strengthen existing `vc.protectBasesFromNvaInfiltrate` with relationship-driven posture.

5. **Profile-quality witnesses** (full list in §7) covering competence report §4 requirements.

## 2. Non-Goals

- **No engine changes.**
- **No US / ARVN / NVA scope.**
- **No new cap classes.**
- **No expansion / Trưng / solitaire bot content.**
- **No removal of existing VC witnesses.** `vc-avoids-conventional-attack-without-ambush.test.ts` and `vc-protects-bases-from-nva-infiltrate.test.ts` preserved.

## 3. Context (verified against codebase, 2026-05-27)

- **Current VC library inventory** (`92-agents.md`):
  - Templates (5): `vc.rallySubvert`, `vc.marchSubvert`, `vc.terrorSubvert` (partial), `vc.terrorTax` (partial), `vc.marchAmbushFromLoc`.
  - Modules (4): `vc.buildPoliticalNetwork`, `vc.subvertRegimeSecurity`, `vc.fundAndAmbushCarefully`, `vc.denyNvaIfNearWin`.
  - Posture: 1 (`vc.protectOppositionAndBases`).
  - Guardrails (3): `vc.avoidConventionalAttackWithoutAmbush`, `vc.protectBasesFromNvaInfiltrate`, `vc.avoidHighPopTaxWithoutPoliticalPlan`, plus shared `dropPassWhenOtherMovesExist`.
- **Current VC witnesses**: 2 (`vc-avoids-conventional-attack-without-ambush.test.ts`, `vc-protects-bases-from-nva-infiltrate.test.ts`).
- **Agitation-readiness gap**: no module promotes Tax/March/Rally as Agitation-preparing actions when Coup imminent. The existing `vc.buildPoliticalNetwork` covers Opposition generation but not Coup-phase resource/piece consolidation.
- **Tax intelligence gap**: `vc.terrorTax` template exists but the Tax-LoC vs Tax-populated decision is not encoded as an item-local selector; the proposal calls for distinct `vc.terrorTax` (LoC) and `vc.rallyTax` (resource-funding) shapes.
- **Relationships**: `vc.nvaNominalAlly` and `vc.nvaNearWin` exist (`92-agents.md:1379-1431`).

## 4. Architecture

### 4.1 Plan templates (additions)

```yaml
vc.rallyBaseNetwork:
  matchActionTag: rally
  roles:
    rallySpace:
      selector: vc.rallyBaseTarget
      constraints:
        - kind: postState
          predicate: spaceAllowsVcBase
  microturnSteps:
    - bindTo: rallySpace
  posture: vc.preserveUndergroundAndBases

vc.rallyTax:
  matchActionTag: rally
  roles:
    rallySpace:
      selector: vc.rallySpaceForFutureOps
    taxSpace:
      selector: vc.taxLocTarget
      constraints:
        - kind: notEqual
          a: rallySpace
          b: taxSpace
  microturnSteps:
    - bindTo: rallySpace
    - bindTo: taxSpace
  compoundSpecial:
    tag: tax
    timing: during

vc.terrorTax:
  matchActionTag: terror
  roles:
    terrorSpace:
      selector: vc.terrorHighPopTarget
    taxSpace:
      selector: vc.taxLocTarget
      constraints:
        - kind: notEqual
          a: terrorSpace
          b: taxSpace
  microturnSteps:
    - bindTo: terrorSpace
    - bindTo: taxSpace
  compoundSpecial:
    tag: tax
    timing: during

vc.terrorSubvert:
  matchActionTag: terror
  roles:
    terrorSpace:
      selector: vc.terrorHighPopTarget
    subvertSpace:
      selector: vc.subvertHighValueTarget
  microturnSteps:
    - bindTo: terrorSpace
    - bindTo: subvertSpace
  compoundSpecial:
    tag: subvert
    timing: during

vc.marchSpread:
  matchActionTag: march
  roles:
    marchOrigin:
      selector: vc.marchSpreadOrigin
    marchDestination:
      selector: vc.marchSpreadDestination
      constraints:
        - kind: reachable
          from: marchOrigin
          to: marchDestination
        - kind: distinctOriginDestination
          a: marchOrigin
          b: marchDestination
  microturnSteps:
    - bindTo: marchOrigin
    - bindTo: marchDestination

vc.attackAmbush:
  matchActionTag: attack
  roles:
    attackSpace:
      selector: vc.attackAmbushTarget
  microturnSteps:
    - bindTo: attackSpace
  compoundSpecial:
    tag: ambush
    timing: during
  posture: vc.preserveUndergroundAndBases

vc.agitationPrep:
  matchActionTag: tax     # placeholder — see §11 Open Q on Agitation Operation tag
  roles:
    prepSpace:
      selector: vc.agitationReadinessTarget
      constraints:
        - kind: postState
          predicate: spaceIsNonCoinControlledAndHasVcPiece
  microturnSteps:
    - bindTo: prepSpace
```

`vc.eventOppositionOrResourceSwing` — shaped analogously to `shared.eventDirectSwing` but profile-bound with VC-specific `gainValue` reading Opposition / Base count deltas.

### 4.2 Selectors (additions — item-local features)

```yaml
vc.terrorHighPopTarget:
  scope: zones
  filters:
    - { ref: zoneProp.hasUndergroundVc }
    - not: { ref: zoneProp.hasTerrorMarker }
    - gt:
        - { ref: zoneProp.population }
        - 0
  score:
    add:
      - mul:
          - { weight: 5 }
          - { ref: zoneProp.population }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: zoneProp.hasSupport }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.isHighPopNonCoinControlled }

vc.taxLocTarget:
  scope: zones
  filters:
    - { ref: zoneProp.isLoc }
    - { ref: zoneProp.hasUndergroundVc }
  score:
    add:
      - mul:
          - { weight: 5 }
          - { ref: zoneProp.econValue }
      - mul:
          - { weight: 2 }
          - boolToNumber: { ref: zoneProp.isSabotaged }

vc.agitationReadinessTarget:
  scope: zones
  filters:
    - not: { ref: zoneProp.coinControl }
    - { ref: zoneProp.hasVcPiece }
  score:
    add:
      - mul:
          - { weight: 6 }
          - { ref: zoneProp.population }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: zoneProp.opposition }
```

### 4.3 Strategy modules (additions)

```yaml
vc.oppositionEngine:
  traceLabel: "build opposition engine"
  when:
    lt:
      - { ref: feature.totalOpposition }
      - 20
  applies:
    scopes: [move]
    actionTags: [terror, rally]
  priority: { tier: 45 }
  enablesPlanTemplates:
    - vc.terrorTax
    - vc.terrorSubvert
    - vc.rallyBaseNetwork

vc.baseNetwork:
  traceLabel: "build vc base network"
  when:
    lt:
      - { ref: feature.vcBaseCount }
      - 5
  applies:
    scopes: [move]
    actionTags: [rally]
  priority: { tier: 40 }
  enablesPlanTemplates:
    - vc.rallyBaseNetwork

vc.subvertPatronage:
  traceLabel: "subvert arvn patronage"
  when:
    ref: condition.arvnNearWin.satisfied
  applies:
    scopes: [move]
    actionTags: [rally, march, terror]
  priority: { tier: 55 }
  enablesPlanTemplates:
    - vc.rallySubvert
    - vc.marchSubvert
    - vc.terrorSubvert
  scoreGroups:
    - prefer:
        - weight: 5
          value:
            sub:
              - 0
              - { ref: feature.projectedArvnMarginDelta }

vc.agitationReadiness:
  traceLabel: "prepare agitation"
  when:
    ref: condition.coupImminent.satisfied
  applies:
    scopes: [move]
  priority: { tier: 65 }
  enablesPlanTemplates:
    - vc.agitationPrep
    - vc.rallyTax
    - vc.marchSpread

vc.nvaRivalRisk:
  traceLabel: "deny nva when near win"
  when:
    ref: condition.nvaNearWin.satisfied
  applies:
    scopes: [move]
  priority: { tier: 60 }
  scoreGroups:
    - prefer:
        - weight: -5
          value: { ref: feature.projectedNvaMarginDelta }
```

### 4.4 Posture and guardrails (additions / strengthening)

```yaml
vc.preserveUndergroundAndBases:
  applies:
    scopes: [move]
  prefer:
    - weight: 5
      value:
        coalesce:
          - { ref: preview.feature.vcUndergroundGuerrillaCount }
          - { ref: feature.vcUndergroundGuerrillaCount }
      previewFallback:
        onUnavailable: noContribution
    - weight: 4
      value:
        coalesce:
          - { ref: preview.feature.vcBaseCount }
          - { ref: feature.vcBaseCount }
      previewFallback:
        onUnavailable: noContribution

vc.preserveAgitationResources:
  applies:
    scopes: [move]
  prefer:
    - weight: -4
      value:
        boolToNumber:
          and:
            - { ref: condition.coupImminent.satisfied }
            - lt:
                - coalesce:
                    - { ref: preview.var.player.self.resources }
                    - { ref: var.player.self.resources }
                - 5
      previewFallback:
        onUnavailable: noContribution

vc.avoidNvaKingmaking:
  applies:
    scopes: [move]
  prefer:
    - weight: -5
      value:
        boolToNumber:
          and:
            - { ref: condition.nvaNearWin.satisfied }
            - gt:
                - coalesce:
                    - { ref: preview.feature.projectedNvaMarginDelta }
                    - 0
                - 0
      previewFallback:
        onUnavailable: noContribution

vc.avoidTaxWhenSupportShiftIsTooCostly:
  trigger:
    and:
      - { ref: candidate.tag.tax }
      - { ref: roleTarget.taxSpace.isPopulated }
      - { ref: roleTarget.taxSpace.hasSupport }
      - not: { ref: condition.resourcesLow.satisfied }
  effect: veto
```

### 4.5 Bindings

`vc-baseline.bindings.strategyModules` adds `vc.oppositionEngine`, `vc.baseNetwork`, `vc.subvertPatronage`, `vc.agitationReadiness`, `vc.nvaRivalRisk`. `vc-baseline.bindings.planTemplates` adds the new templates from §4.1.

## 5. Edge cases

- **`vc.agitationPrep` action tag**: VC Agitation is a Coup-phase action, not a card-phase Operation. The template's `matchActionTag` is contingent on what tag the engine publishes for Agitation-readiness actions during card-phase preparation. If no such tag exists, the spec falls back to encoding the preparation via `vc.rallyTax`, `vc.marchSpread`, and `vc.terrorTax` with the `vc.agitationReadiness` doctrine promoting them when `coupImminent`. P0 verifies.
- **`zoneProp.isLoc` / `zoneProp.econValue`** must exist in the FITL zone-prop vocabulary; P0 surveys.
- **`feature.vcUndergroundGuerrillaCount`** requires a `globalTokenAgg` with prop filtering — author in P1 if absent from `92-agents.md`.
- **Replay-identity preservation** — existing VC witnesses pass under expanded set.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector / feature vocabulary survey; Agitation action-tag verification | Inventory + Open Questions; Agitation tag decision recorded | S |
| **P1** | New VC plan templates (§4.1) | All compile; agitation-prep template authored per P0 resolution | M |
| **P2** | VC strategy modules + posture + guardrails (§§4.3–4.4) | All compile | M |
| **P3** | `vc-baseline` bindings (§4.5) | Profile compiles; existing VC witnesses pass | S |
| **P4** | VC profile-quality witness suite (§7) | All witnesses pass; build byte-identical | M |
| **P5** | Replay-identity reattestation against Spec 201 | All FITL canaries byte-identical with VC changes folded in | S |

## 7. Test plan

- `vc-avoids-conventional-attack-without-ambush.test.ts` (existing; preserved).
- `vc-protects-bases-from-nva-infiltrate.test.ts` (existing; preserved — strengthened with relationship-driven posture).
- `vc-terror-high-pop-non-coin-controlled.test.ts` — selector picks the highest-population non-COIN-Controlled Support space.
- `vc-tax-funds-future-terror-rally.test.ts` — `vc.rallyTax` chosen when Resources are low AND a LoC Tax target exists.
- `vc-subvert-drops-arvn-patronage.test.ts` — when ARVN near win, `vc.terrorSubvert` or `vc.rallySubvert` chosen over plain Terror/Rally.
- `vc-march-spreads-underground.test.ts` — `vc.marchSpread` chooses destinations that keep guerrillas Underground.
- `vc-attack-only-with-ambush.test.ts` — `vc.attackAmbush` preferred; conventional Attack vetoed (existing guardrail).
- `vc-agitation-prep-before-coup.test.ts` — when `coupImminent`, plan selects `vc.agitationPrep` / `vc.rallyTax` over speculative setup.
- `vc-blocks-nva-near-win.test.ts` — when NVA at -1, plan selects NVA-Control-denial or VC-Base-protection.
- `vc-tax-on-populated-support-vetoed.test.ts` — guardrail fires on Tax+populated-Support unless `resourcesLow`.

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only |
| #2 | Evolvable doctrine |
| #15 | Closes VC parity gap |
| #16 | 10 witnesses cover competence report §4 |
| #19 | Terror+Tax, Terror+Subvert compounds emerge from microturn steps |
| #20 | All preview-derived features declare `previewFallback.onUnavailable: noContribution` |

## 9. Reassessment of source proposal

**Adopted:**
- §5 VC recommendations → §§4.1–4.5.
- §6.8 VC plan-template list → §4.1.
- §6.10 VC guardrails (`vc.avoidTaxWhenSupportShiftIsTooCostlyUnlessResourcesCritical`, `vc.protectBaseFromNvaInfiltrate`) → §4.4.

**Adopted with adjustment:**
- Proposal lists `vc.marchAmbushFromLoc` as preserve-and-strengthen; it already exists. This spec preserves it without adding a separate LoC-adjacency variant template; instead `vc.attackAmbush` and the existing `vc.marchAmbushFromLoc` cover the Attack+Ambush and March+Ambush patterns.

**Corrected:**
- The proposal does not address VC Agitation tag uncertainty; this spec explicitly records it as Open Question P0 deliverable, since Agitation is a Coup-phase action rather than an Operation tag.

**Deferred:**
- Card-by-card event valuation taxonomy — proposal's §4 Event row already deferred this; spec adopts `vc.eventOppositionOrResourceSwing` as generic event-handling module reading `activeCard.hasTag.*` + active-card annotations.

## 10. Out of scope (named follow-on / sibling)

- **Specs 201, 202, 203, 205** (sibling).
- VC Cadre / specialist-card-specific templates — uncommitted.

## 11. Open questions

- **Agitation action tag**: does the engine publish a tag for Agitation-readiness Operations during card-phase, or is Agitation purely Coup-phase resolution? P0 deliverable; informs `vc.agitationPrep` template feasibility.
- **`vc.subvertHighValueTarget`** selector: zone-prop vocabulary survey (which `zoneProp.*` features for ARVN-Patronage-priority spaces exist).
- **Threshold calibration** for `totalOpposition < 20`, `vcBaseCount < 5`, `resources < 5` — P4.

# Spec 201 — FITL Shared Doctrine Library and Lifecycle Awareness

**Status**: PROPOSED
**Priority**: High — foundational for four-faction parity. Today three FITL profiles reimplement `blockImmediateWin` (ARVN, US, NVA modules with that exact `id` exist as three independent copies in `data/games/fire-in-the-lake/92-agents.md`; VC handles immediate-win via `vc.denyNvaIfNearWin`, a faction-specific variant preserved per §2 Non-Goals), and lifecycle awareness is limited to a single ARVN guardrail (`arvn.doNotOvercommitTroopsPreCoupWithoutBase` referencing `schedule.distance.toBoundary.coupEntry.cards`). Events surface only as a binary `preferEvent` weight in `considerations`, not as first-class doctrine. The competence report (`reports/fitl-competent-agent-ai.md`) requires monsoon awareness, coup awareness, and event-as-first-class decision across all four factions — none of these has a shared module today, so per-faction completions (Specs 202–204) would repeat the same scaffolding four times if this spec did not land first.
**Complexity**: M — one generic engine prerequisite for candidate-feature preview fallback and preview relationship refs, followed by YAML authoring inside `data/games/fire-in-the-lake/92-agents.md` plus new policy-profile-quality tests. The remaining DSL primitives (`activeCard.hasTag.<tag>`, schedule refs, strategic conditions, strategy modules with `enablesPlanTemplates`/`suppressesPlanTemplates`, relationships) are already supported by the post-Spec-197/199 engine surface.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED) — plan-template IR, strategy module activation
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED) — posture evaluators, relationship metadata
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED) — plan root authority
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED) — role-semantic foundations
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `reachable`/`adjacent`/`distinctOriginDestination`/`locatedIn` role constraints
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates`
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration of FITL AI encoding, 2026-05-27). This spec adopts the proposal's §§4 (universal stack rows), 5 (lifecycle awareness paragraphs), 6.3–6.7 (shared features/conditions/modules/relationships slice) into a single shared-scaffolding deliverable that Specs 202–204 build on. Initial reassessment treated engine architecture concerns (§7 of the proposal) as out of scope; ticket 002 reassessment found one generic Foundation #20 prerequisite, now owned by `201FITLSHADOC-001B`.

**Ticket namespace**: `201FITLSHADOCLIF`

---

## 1. Goal

Make four-faction competence completion possible by authoring the shared scaffolding the per-faction specs (202 US, 203 NVA, 204 VC) reference. Concretely:

1. **Shared strategy modules** consumed by all four profiles:
   - `shared.immediateWin` — when the projected self margin crosses the win threshold, gate the candidate set toward win-completing templates and suppress speculative setup.
   - `shared.blockCurrentLeader` — when an enemy is within near-win range, gate the candidate set toward denial templates against that specific seat.
   - `shared.nearCoupConcreteSwing` — when a Coup is imminent (`distanceToCoup ≤ 1`), suppress speculative setup templates in favor of concrete margin/resource/control swing templates.
   - `shared.resourceLogistics` — when `selfResources < 2` or per-faction logistics conditions hold, prioritize resource-restoring plan families.
   - `shared.eventDirectSwing` — when an active event card offers direct margin/resource/denial/eligibility value, gate eligibility toward an event-handling template; uses `activeCard.hasTag.*` and active-card annotation refs.
   - `shared.allyRivalThrottle` — when a nominal ally is near win and that ally's gain would mean rival victory, demote plan templates whose `gainValue` contributes to the ally's margin.

2. **Lifecycle features and strategic conditions** consumed across the library:
   - State features: `distanceToCoup` (via `schedule.distance.toBoundary.coupEntry.cards`), `monsoonNow` (via `activeCard.hasTag.monsoon`), `aid`, `trail`, `selfResources`, `totalSupport`, `totalOpposition`, `vcBaseCount`, `nvaBaseCount`, `availableUsTroops`, `availableUsBases`.
   - Candidate features: `projectedSelfMarginDelta` (already present), plus `projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedSupportDelta`, `projectedOppositionDelta`.
   - Strategic conditions: `selfCanWinNow`, `currentLeaderNearWin`, `coupImminent`, `monsoonNow`, `resourcesLow`, plus the ally-rival flips `allyNearWin` and `nominalAllyHasBecomeRival`.

3. **Per-profile bindings**: each of `us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline` references the six shared modules with profile-appropriate priority tiers and conditions; the three pre-existing per-faction `blockImmediateWin` modules (ARVN, US, NVA) are replaced by their `shared.*` analogues. VC's `vc.denyNvaIfNearWin` is preserved as faction-specific nuance (it carries VC-specific scoring beyond the generic block-leader doctrine; no `vc.blockImmediateWin` exists today).

4. **Relationship use** is generalized: the existing four ally/rival pairs (`92-agents.md:1379-1431`) gain explicit consumption via `shared.allyRivalThrottle`'s suppression list, not new relationship records.

5. **Per-profile event handling**: each profile binds `shared.eventDirectSwing` with profile-specific `gainValue` references (US ↦ Support delta; ARVN ↦ Patronage/control delta; NVA ↦ Control/Trail delta; VC ↦ Opposition/Base delta). Existing `preferEvent` consideration weights are demoted to fallback rather than primary.

## 2. Non-Goals

- **No per-faction plan templates.** Spec 202/203/204 own those; Spec 201 only defines the shared modules and the bindings that gate eligibility.
- **No placeholder-selector replacement.** Spec 205 owns that hygiene work; this spec preserves the existing ARVN selectors as-is and lets 205 land independently.
- **No FITL-specific engine changes.** Reassessment during ticket 002 found a real generic engine gap: candidate-feature-level `previewFallback` and `preview.relationship.<role>.*` refs are required for Foundation #20-compliant shared ally-rival doctrine. Ticket `201FITLSHADOC-001B` owns that generic prerequisite; the remaining Spec 201 tickets stay YAML/test focused.
- **No new cap classes.** `grantFlow16` remains the FITL default; `grantFlow32` is not added until a witness proves a required plan family cannot differentiate within 16-deep grant-flow continuation.
- **No removal of per-faction modules where the per-faction nuance is real.** Faction-specific doctrine modules (e.g., `arvn.harvestPatronage`, `vc.fundAndAmbushCarefully`) remain — `shared.*` modules are *additional* scaffolding, not replacements for everything.
- **No new metric synthesis kinds.** Aggregate metrics (total Support, total Opposition, NVA base count) MUST be expressed via the existing `globalTokenAgg` and `metric.auto:*` synthesis surfaces (`packages/engine/src/cnl/synthesize-derived-metrics.ts`); if a needed metric cannot be expressed, the faction-spec that needs it surfaces it as an Open Question rather than this spec proposing a new synthesis kind.

## 3. Context (verified against codebase, 2026-05-27)

- **No `shared.*` modules exist today.** `data/games/fire-in-the-lake/92-agents.md` defines twenty-one strategy modules, all faction-scoped (`arvn.*`, `us.*`, `nva.*`, `vc.*`). Three `blockImmediateWin` modules (`arvn.blockImmediateWin` @ line 1498, `us.blockImmediateWin` @ line 1629, `nva.blockImmediateWin` @ line 1705) are duplicates of an identical doctrine pattern; VC's analogous functionality lives in `vc.denyNvaIfNearWin`, which has faction-specific scoring nuance and is preserved per §2 Non-Goals.
- **Lifecycle features are minimal.** Only one schedule ref appears in the entire file: `schedule.distance.toBoundary.coupEntry.cards` (within `arvn.doNotOvercommitTroopsPreCoupWithoutBase`). No `monsoonNow`, no `distanceToCoup` named feature, no `coupImminent` strategic condition.
- **Event handling is binary.** `eventWeight` parameter (default 100) exists; `preferEvent` consideration (`92-agents.md:~2091`) gates on `candidate.tag.event-play` only; no `eventDirectSwing` module, no active-card-annotation routing.
- **Relationships are fully defined.** All four ally/rival pairs exist with `nominalAlly` + `nearWin` (kingmaker) shapes (`92-agents.md:1379-1431`). The gap is that no module references relationship `gainValue` for module-side suppression — relationships are declared but not used in `shared.*` doctrine.
- **DSL surface confirmed.** `activeCard.hasTag.<tag>` is supported (`packages/engine/src/agents/policy-surface.ts`, cookbook line 588); `schedule.distance.toBoundary.<id>.<unit>` and `schedule.distance.toPhase.<id>.<unit>` are supported in move/microturn policy scopes (cookbook 594-596, 806-811). Reassessment on 2026-05-27 found state-feature scope was still rejected by live compiler tests, so ticket `201FITLSHADOC-001D` adds generic state-feature support before ticket 002 authors `distanceToCoup`. `enablesPlanTemplates`/`suppressesPlanTemplates` shipped in Spec 197; preview-fallback `onUnavailable: noContribution` shipped in Spec 162/180 (cookbook 1401-1406).
- **Foundation #20 compliance is required.** Any preview-derived candidate feature must declare explicit `previewFallback.onUnavailable` (typically `noContribution` for delta features, `coalesce-to-current` for level features); silent coercion would violate the integrity contract. Ticket `201FITLSHADOC-001B` makes this a compiled engine contract before the YAML feature authoring lands.

## 4. Architecture

### 4.1 New state features

Add to `agents.library.stateFeatures`:

```yaml
distanceToCoup:
  type: number
  expr:
    coalesce:
      - { ref: schedule.distance.toBoundary.coupEntry.cards }
      - 999

monsoonNow:
  type: boolean
  expr:
    ref: activeCard.hasTag.monsoon

aid:
  type: number
  expr: { ref: var.global.aid }

trail:
  type: number
  expr: { ref: var.global.trail }

totalSupport:
  type: number
  expr:
    ref: metric.auto:victory:totalSupport
  # Materializes if victory-standings declares the matching formula;
  # P0 deliverable verifies the metric is synthesized before profiles consume it.

totalOpposition:
  type: number
  expr:
    ref: metric.auto:victory:totalOpposition

nvaBaseCount:
  type: number
  expr:
    globalTokenAgg:
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: NVA }
          type: { eq: base }

availableUsTroops:
  type: number
  expr:
    globalTokenAgg:
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: US }
          type: { eq: troops }
          # location filter via standing pool; see P0 metric-survey deliverable

availableUsBases:
  type: number
  expr:
    globalTokenAgg:
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: US }
          type: { eq: base }
```

The P0 deliverable surveys which of these can be expressed via existing `globalTokenAgg` filtering (faction + type + token props), and which require either victory-standings derived metrics or new token-prop authorings in `40-content-data-assets.md` (the FITL token / data-asset file where existing global vars `aid`, `patronage`, `trail` are declared at lines 776–786). Any feature that cannot ship in P0 is recorded as an Open Question and consumed by faction specs only after it lands.

### 4.2 New candidate features

Add to `agents.library.candidateFeatures`:

```yaml
projectedLeaderMarginDelta:
  type: number
  expr:
    coalesce:
      - sub:
          - { ref: feature.projectedCurrentLeaderMargin }
          - seatAgg:
              over: { role: currentLeader }
              expr: { ref: victory.currentMargin.$seat }
              aggOp: sum
              availability: selfAndTargetReady
      - 0
  previewFallback:
    onUnavailable: noContribution

projectedAllyMarginDelta:
  # Derived per-profile via the relationship gainValue; this is the shared
  # scaffold candidate-feature that each profile parameterizes through its
  # nominalAlly relationship.
  type: number
  expr:
    coalesce:
      - { ref: preview.relationship.nominalAlly.gainValueDelta }
      - 0
  previewFallback:
    onUnavailable: noContribution

projectedAidDelta:
  type: number
  expr:
    coalesce:
      - sub:
          - { ref: preview.var.global.aid }
          - { ref: var.global.aid }
      - 0
  previewFallback:
    onUnavailable: noContribution

projectedTrailDelta:
  type: number
  expr:
    coalesce:
      - sub:
          - { ref: preview.var.global.trail }
          - { ref: var.global.trail }
      - 0
  previewFallback:
    onUnavailable: noContribution

projectedSupportDelta:
  type: number
  expr:
    coalesce:
      - sub:
          - { ref: preview.feature.totalSupport }
          - { ref: feature.totalSupport }
      - 0
  previewFallback:
    onUnavailable: noContribution

projectedOppositionDelta:
  type: number
  expr:
    coalesce:
      - sub:
          - { ref: preview.feature.totalOpposition }
          - { ref: feature.totalOpposition }
      - 0
  previewFallback:
    onUnavailable: noContribution
```

The `preview.relationship.nominalAlly.gainValueDelta` ref surface is provided by prerequisite ticket `201FITLSHADOC-001B`. Spec 187 landed current-state relationship metadata, and ticket 001 proved preview relationship refs were missing. The prerequisite adds the generic preview relationship seam so shared ally-rival doctrine does not devolve into four per-profile fallback expressions.

### 4.3 New strategic conditions

Add to `agents.library.strategicConditions`:

```yaml
selfCanWinNow:
  description: "Self projected margin crosses the win threshold under the current plan."
  target:
    gte:
      - { ref: feature.projectedSelfMargin }
      - 0

currentLeaderNearWin:
  description: "Current leader is within near-win threshold; denial overrides ordinary efficiency."
  target:
    gte:
      - { ref: feature.projectedCurrentLeaderMargin }
      - -2

coupImminent:
  description: "Coup is one card away or sooner; speculative setup is dominated by concrete swing."
  target:
    lte:
      - { ref: feature.distanceToCoup }
      - 1

monsoonNow:
  description: "Monsoon is in effect; Sweep/March unavailable, Air Strike/Air Lift restricted."
  target:
    eq:
      - { ref: feature.monsoonNow }
      - true

resourcesLow:
  description: "Self resources are below the operating floor."
  target:
    lt:
      - { ref: feature.selfResources }
      - 2

allyNearWin:
  description: "Self's nominal ally is near win; their gains are rival gains."
  target:
    gte:
      - { ref: preview.relationship.nominalAlly.victoryMargin }
      - -1
```

### 4.4 Shared strategy modules

Add to `agents.library.strategyModules`:

```yaml
shared.immediateWin:
  traceLabel: "complete immediate win"
  when:
    ref: condition.selfCanWinNow.satisfied
  applies:
    scopes: [move]
  priority: { tier: 90 }
  scoreGroups:
    - prefer:
        - { weight: 10, value: { ref: feature.projectedSelfMargin } }
  # No plan-template gating — eligibility is preserved; this module elevates
  # the scoring tier of any candidate that completes the win.

shared.blockCurrentLeader:
  traceLabel: "block current leader"
  when:
    ref: condition.currentLeaderNearWin.satisfied
  applies:
    scopes: [move]
  priority: { tier: 80 }
  scoreGroups:
    - prefer:
        - weight: 10
          value:
            sub:
              - 0
              - { ref: feature.projectedLeaderMarginDelta }

shared.nearCoupConcreteSwing:
  traceLabel: "concrete coup swing"
  when:
    ref: condition.coupImminent.satisfied
  applies:
    scopes: [move]
  priority: { tier: 70 }
  scoreGroups:
    - prefer:
        - weight: 5
          value:
            add:
              - { ref: feature.projectedSelfMarginDelta }
              - { ref: feature.projectedAidDelta }

shared.resourceLogistics:
  traceLabel: "preserve resources and logistics"
  when:
    ref: condition.resourcesLow.satisfied
  applies:
    scopes: [move]
  priority: { tier: 60 }
  scoreGroups:
    - prefer:
        - weight: 4
          value:
            coalesce:
              - { ref: preview.var.player.self.resources }
              - { ref: var.player.self.resources }

shared.eventDirectSwing:
  traceLabel: "play event for direct swing"
  when:
    or:
      - { ref: candidate.tag.event-play }
      - { ref: activeCard.hasAnnotation.directVictorySwing }
  applies:
    scopes: [move]
  priority: { tier: 50 }
  scoreGroups:
    - prefer:
        - weight: 8
          value:
            coalesce:
              - { ref: preview.victory.currentMargin.self }
              - { ref: feature.selfMargin }

shared.allyRivalThrottle:
  traceLabel: "throttle ally gains when ally near win"
  when:
    ref: condition.allyNearWin.satisfied
  applies:
    scopes: [move]
  priority: { tier: 65 }
  scoreGroups:
    - prefer:
        - weight: -6
          value: { ref: feature.projectedAllyMarginDelta }
```

The exact priority tiers in this draft are illustrative; P3 calibrates them against the four-profile convergence canary so existing FITL witnesses continue to pass.

### 4.5 Per-profile bindings

Each profile's `bindings` section consumes the six shared modules. The existing per-faction `blockImmediateWin` modules are removed; their semantic is now carried by `shared.immediateWin` + `shared.blockCurrentLeader`.

Example pattern for `arvn-baseline`:

```yaml
arvn-baseline:
  bindings:
    strategyModules:
      - shared.immediateWin
      - shared.blockCurrentLeader
      - shared.nearCoupConcreteSwing
      - shared.resourceLogistics
      - shared.eventDirectSwing
      - shared.allyRivalThrottle      # ally = US via relationship arvn.usNominalAlly
      - arvn.harvestPatronage
      - arvn.holdHighPopControl
      - arvn.protectAidEcon
      - arvn.selectiveViolence
      - arvn.denyUSIfNearWin           # preserved alongside shared.blockCurrentLeader: ARVN-specific scoring of US near-win throttle, distinct from generic leader-block (§2 Non-Goals)
      - arvn.preCoupRedeployDiscipline
      - arvn.buildPoliticalEngine
      - arvnPursueProjectedMargin
```

The same pattern applies to the other three profiles (one-line stubs for the Spec-201 surface; faction-specific module sets are owned by Specs 202–204):

- `us-baseline.bindings.strategyModules`: binds all six `shared.*` modules + `us.createAndDefendSupport` + `us.forceMultiplier` + `us.preserveAvailability`. `us.blockImmediateWin` is removed in P3.
- `nva-baseline.bindings.strategyModules`: binds all six `shared.*` modules + `nva.logisticsAndTrail` + `nva.controlAndBases` + `nva.vcRivalLeverage`. `nva.blockImmediateWin` is removed in P3.
- `vc-baseline.bindings.strategyModules`: binds all six `shared.*` modules + `vc.buildPoliticalNetwork` + `vc.subvertRegimeSecurity` + `vc.fundAndAmbushCarefully` + `vc.denyNvaIfNearWin`. No `vc.blockImmediateWin` removal — none exists today; `vc.denyNvaIfNearWin` is preserved as faction-specific nuance.

`shared.allyRivalThrottle` reads ally identity from the profile's existing relationship (`arvn.usNominalAlly`, `us.arvnNominalAlly`, `nva.vcNominalAlly`, `vc.nvaNominalAlly`); no relationship records are added or modified by this spec.

### 4.6 Determinism preservation

After the generic prerequisite lands, the remaining additions are pure data. The shared modules use existing DSL primitives (`when`/`applies`/`priority`/`scoreGroups`/relationships). `pnpm turbo build` must produce byte-identical GameDef across consecutive runs. `pnpm turbo schema:artifacts` regenerates cleanly with no diff outside the additive surface.

## 5. Edge cases

- **No nominal ally exists** — `shared.allyRivalThrottle` is profile-bound only when the profile declares a `nominalAlly` relationship; in profiles without one (none in FITL, but a forward-compatibility consideration), the module is omitted from `bindings.strategyModules` rather than referencing a missing relationship.
- **Coup never reached in a curated seed** — `feature.distanceToCoup` falls back to `999` (`coalesce`); `coupImminent` evaluates false; the module is inactive. Existing FITL convergence witnesses must not regress.
- **Active card has no Monsoon tag** — `feature.monsoonNow` evaluates false; modules gated on it inactive. The four existing `*-baseline` profiles must compile and run identically to today on seeds that never reach Monsoon.
- **Preview relationship refs unavailable before prerequisite** — ticket `201FITLSHADOC-001B` must land before YAML authoring consumes `preview.relationship.nominalAlly.gainValueDelta` or `preview.relationship.nominalAlly.victoryMargin`; candidate-feature `previewFallback.onUnavailable: noContribution` then ensures no silent coercion.
- **Existing per-faction `blockImmediateWin` modules removed** — convergence witnesses that reference them by id (verified absence: no FITL witness depends on `*.blockImmediateWin` by name; they reference `arvn.trainGovern`, `us.trainAdvise`, etc.) continue to pass. The P3 acceptance criterion is replay-identity preservation.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0a** | Generic engine prerequisite for candidate-feature preview fallback and preview relationship refs | Candidate-feature `previewFallback` is validated/compiled; `preview.relationship.<role>.victoryMargin` and `preview.relationship.<role>.gainValueDelta` compile and evaluate generically; no FITL-specific engine ids | M |
| **P0b** | State/candidate feature additions (§4.1, §4.2) and metric-availability survey | All new features compile; metric survey records which `metric.auto:*` ids materialize from current victory-standings vs. which need derived-metric authoring; Open Questions list any feature that cannot ship in this spec | S–M |
| **P1** | Strategic conditions (§4.3) | All six conditions compile; standalone witness asserts each condition evaluates correctly on a curated scenario | S |
| **P2** | Shared strategy modules (§4.4) | Six `shared.*` modules compile; each carries explicit `when`/`applies`/`priority`/`scoreGroups`; no plan-template gating beyond what the module's doctrine requires | M |
| **P3** | Per-profile bindings (§4.5) + removal of three `*.blockImmediateWin` duplicates (ARVN, US, NVA — VC has no such module) | All four `*-baseline` profiles compile and bind the new modules; existing convergence witnesses (ARVN seed 1000, FITL seed 2057, march dead-end, spec-143 boundedness, four-profile convergence, guardrail uniformity, preview opponent-margin, plan selected-root authority, compound availability correspondence) replay byte-identically; priority tiers calibrated to preserve replay identity | M |
| **P4** | Profile-quality witnesses (§7) | One witness per `shared.*` module per profile (24 witnesses) PLUS one cross-profile assertion that the three pre-existing `*.blockImmediateWin` modules no longer appear in any compiled profile; `pnpm turbo build` byte-identical; `pnpm turbo schema:artifacts` regen idempotent | M |

## 7. Test plan

**Profile-quality witnesses (added under `packages/engine/test/policy-profile-quality/`):**

- `shared-immediate-win-{us,arvn,nva,vc}.test.ts` — scenario where `selfCanWinNow` is true; module fires; candidate set ranked toward win-completing template; selected root completes the win.
- `shared-block-current-leader-{us,arvn,nva,vc}.test.ts` — scenario where an enemy is within near-win range; module fires; candidate set ranked toward denial template against that specific seat.
- `shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts` — scenario where `coupImminent`; module fires; speculative-setup template is demoted vs. concrete-swing template.
- `shared-resource-logistics-{us,arvn,nva,vc}.test.ts` — scenario where `selfResources < 2`; module fires; resource-restoring template chosen over alternative.
- `shared-event-direct-swing-{us,arvn,nva,vc}.test.ts` — scenario where active card offers direct margin swing; module fires; event-play template selected over plain-op.
- `shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` — scenario where nominal ally near win; module fires; candidate that contributes to ally margin demoted.
- `shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` — when `monsoonNow`, plans gated on Sweep/March are excluded from the candidate set (Spec 197 eligibility gating); profile chooses Assault/Patrol/etc. fallback.

**Architectural invariants:**

- `shared-modules-bound-by-all-profiles.test.ts` — compile-time assertion that every `*-baseline` profile binds at minimum `shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.resourceLogistics`, `shared.eventDirectSwing`.
- `no-per-faction-block-immediate-win.test.ts` — compile-time assertion that no profile references `arvn.blockImmediateWin`, `us.blockImmediateWin`, or `nva.blockImmediateWin` (these three are removed by P3; no `vc.blockImmediateWin` exists today, so the assertion does not name it).

**Determinism / replay:**

- `pnpm turbo build` twice → byte-identical GameDef.
- Existing policy-profile-quality canaries (ARVN seed 1000, FITL seed 2057, four-profile convergence, etc.) → replay byte-identical.
- `pnpm turbo schema:artifacts` → idempotent regen.

**Preview-integrity:**

- For every new preview-derived candidate feature (`projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedSupportDelta`, `projectedOppositionDelta`), assert that `previewFallback.onUnavailable: noContribution` is set; trace records `unavailable` outcomes without silent coercion (Foundation #20).

## 8. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | The prerequisite engine change is generic agent policy infrastructure; FITL-specific behavior remains YAML data |
| #2 Evolution-First | All new modules/features/conditions are GameSpecDoc YAML primitives; evolution may mutate them via existing tunable-parameter surfaces |
| #5 One Rules Protocol | Plan-template gating uses the same eligibility filter shipped in Spec 197; no kernel changes |
| #8 Determinism | All new content is pure data; replay byte-identical |
| #10 Bounded Computation | No new cap classes; no new iteration; existing bounded compounds unchanged |
| #14 No Backwards Compatibility | The three `*.blockImmediateWin` modules are removed in P3 in the same change as their `shared.*` replacements bind into the four `*-baseline` profiles — no transitional period, no compatibility shim. |
| #15 Architectural Completeness | Closes the four-faction-parity scaffolding gap before the per-faction completions (202–204) attempt to consume shared modules |
| #16 Testing as Proof | 24 profile-quality witnesses + 2 architectural invariants + determinism re-attestation |
| #20 Preview Signal Integrity | All new preview-derived features declare explicit compiled `previewFallback`; no silent coercion |

## 9. Reassessment of source proposal (`reports/fitl-ai-encoding-first-iteration.md`)

**Adopted (this spec's slice):**

- §4 universal stack rows (immediate win, block leader, near-Coup, resource logistics, ally-rival, event-as-first-class, Monsoon awareness) → §4.4 shared modules + §4.3 strategic conditions.
- §5 lifecycle-awareness paragraphs (Monsoon/Coup/Event-as-first-class) → §4.1 features + §4.3 conditions + `shared.eventDirectSwing`.
- §6.3 shared state features → §4.1.
- §6.4 candidate features → §4.2 (with explicit `previewFallback.onUnavailable: noContribution`).
- §6.5 strategic conditions → §4.3.
- §6.7 shared strategy modules → §4.4.
- §6.11 preview/profile settings → preserved (no cap-class changes; `grantFlow16` retained).

**Adopted with adjustment:**

- §4 Coup-awareness universal row: proposal recommends "near-Coup posture modules: concrete scoring over speculative setup; resources/redeploy/agitation/pacification readiness." Adopted as `shared.nearCoupConcreteSwing` (§4.4) plus per-faction near-Coup posture deferred to faction specs (the readiness modules are faction-specific — ARVN redeploy, US Pacification, NVA Trail, VC Agitation — and belong with the respective faction completions).
- §6.5 `monsoonNow` syntax: proposal uses `activeCard.tag.monsoon`; corrected to `activeCard.hasTag.monsoon` per verified DSL surface (`packages/engine/src/agents/policy-surface.ts`, cookbook line 588).

**Corrected:**

- §4 Ally-rival universal row: proposal characterizes relationships as "partial" with bindings to add for "full relationship: US↔ARVN and NVA↔VC nominal ally plus kingmaker-risk flip." Verification finds relationships already complete (`92-agents.md:1379-1431`); the actual gap is *consumption* by shared doctrine, addressed by `shared.allyRivalThrottle` (§4.4). No relationship records are added or modified.
- §6.3 metric availability framing: proposal labels several metrics as "supported now"; verification (per agent dispatch) finds `metric.auto:*` ids materialize only from declared victory-standings formulas. The P0 metric-availability survey makes this explicit and records any feature that requires a derived-metric authoring as an Open Question.

**Deferred (named follow-ups, not in this spec):**

- Per-faction near-Coup posture (US Pacification readiness, ARVN redeploy discipline, NVA Trail readiness, VC Agitation readiness) → owned by Specs 202, 203, 204 (ARVN redeploy already exists as `arvn.preCoupRedeployDiscipline` — preserved by Spec 205 selector cleanup).
- `grantFlow32` cap class adoption → deferred until a witness proves `grantFlow16` cannot differentiate a required plan family.
- `us.airLiftTrain` enablement decision → Spec 202 (US completion).

**Rejected (with rationale):**

- §7 architectural changes — confirmed none needed; the four "concrete failure modes" the proposal enumerates as the only justification for engine work have not been observed. Adopted verbatim.
- "Cap class adoption now" — the proposal itself recommends *not* adopting `grantFlow32`; this spec preserves that recommendation.

## 10. Out of scope (named follow-on / sibling)

- **Spec 202** — US baseline completion to ARVN-parity.
- **Spec 203** — NVA baseline completion to ARVN-parity.
- **Spec 204** — VC baseline completion to ARVN-parity.
- **Spec 205** — ARVN selector cleanup and placeholder replacement.
- Multi-game shared-doctrine generalization (e.g., shared doctrine for Texas Hold'em) — uncommitted; FITL is the proving ground.
- Evolution-pipeline integration of the new tunable surfaces — owned by future evolution specs.

## 11. Open questions

- **Metric availability**: answered by `reports/201-fitl-metric-availability-survey.md` (ticket `201FITLSHADOC-001`).
  - `totalSupport`: **available with adjustment** — use `metric.auto:victory:markerTotal:supportOpposition:activeSupport:passiveSupport`, not the draft `metric.auto:victory:totalSupport` id.
  - `totalOpposition`: **available with adjustment** — use `metric.auto:victory:markerTotal:supportOpposition:activeOpposition:passiveOpposition`, not the draft `metric.auto:victory:totalOpposition` id.
  - `nvaBaseCount`: **available** via `globalTokenAgg` filtering on `runtimeProps.faction: NVA` and `runtimeProps.type: base`.
  - `availableUsTroops` / `availableUsBases`: **available with adjustment after prerequisite** if authored with `globalTokenAgg` plus `zoneFilter.zoneIds: [available-US:none]`; token props alone distinguish US troop/base type but not Available-pool location. User-approved reassessment on 2026-05-27 found the live engine lacks `zoneFilter.zoneIds`, so ticket `201FITLSHADOC-001C` adds that generic filter before ticket 002 authors these features.
  - `sabotagedEcon`: **unavailable — defer** until a faction spec proves the need and authors a concrete derived metric or state feature.
  - `terrorMarkerCount`: **unavailable — defer**; the current global var is `terrorSabotageMarkersPlaced`, not a separate terror-marker-count derived metric.
- **`preview.relationship.nominalAlly.gainValueDelta` ref**: answered by `reports/201-fitl-metric-availability-survey.md` (ticket `201FITLSHADOC-001`) as **unavailable in the pre-prerequisite engine**. The current compiler/runtime relationship surface exposes current-state `relationship.<role>.seat` and `relationship.<role>.gainValue`; preview relationship deltas are not a supported ref family. User-approved reassessment on 2026-05-27 chose the Foundation-aligned engine prerequisite path: ticket `201FITLSHADOC-001B` adds generic preview relationship refs before ticket 002 authors `projectedAllyMarginDelta`.
- **Priority tier calibration**: do the illustrative tiers in §4.4 (90/80/70/65/60/50) preserve replay-identity for existing convergence canaries? Answered in P3 by iteration; the spec ships with whatever tiers preserve the canaries.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-27 (namespace `201FITLSHADOC` per user invocation; the spec's `Ticket namespace` metadata field lists `201FITLSHADOCLIF`, but the user argument is authoritative):

- [`archive/tickets/201FITLSHADOC-001.md`](../archive/tickets/201FITLSHADOC-001.md) — Metric availability survey + preview ref probe (covers §4.1 / §4.2 P0 survey) — COMPLETED
- [`archive/tickets/201FITLSHADOC-001B.md`](../archive/tickets/201FITLSHADOC-001B.md) — Generic preview relationship refs and candidate-feature fallback (Foundation #20 prerequisite for §4.2 / §4.3) — COMPLETED
- [`archive/tickets/201FITLSHADOC-001C.md`](../archive/tickets/201FITLSHADOC-001C.md) — Exact zone-id filters for policy token aggregates (Foundation #2/#15 prerequisite for Available-pool features) — COMPLETED
- [`archive/tickets/201FITLSHADOC-001D.md`](../archive/tickets/201FITLSHADOC-001D.md) — Schedule-distance refs in state features (Foundation #2/#15 prerequisite for `distanceToCoup`) — COMPLETED
- [`tickets/201FITLSHADOC-002.md`](../tickets/201FITLSHADOC-002.md) — State features and candidate features (covers §4.1 / §4.2 P0 features)
- [`tickets/201FITLSHADOC-003.md`](../tickets/201FITLSHADOC-003.md) — Strategic conditions (covers §4.3 / P1)
- [`tickets/201FITLSHADOC-004.md`](../tickets/201FITLSHADOC-004.md) — Shared strategy modules (covers §4.4 / P2)
- [`tickets/201FITLSHADOC-005.md`](../tickets/201FITLSHADOC-005.md) — Per-profile bindings + atomic blockImmediateWin removal (covers §4.5 / P3 — Foundation #14 atomic cut)
- [`tickets/201FITLSHADOC-006.md`](../tickets/201FITLSHADOC-006.md) — Profile-quality witness suite (covers §7 / P4 — 31 tests)

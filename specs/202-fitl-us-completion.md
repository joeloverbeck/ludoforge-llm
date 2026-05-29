# Spec 202 — FITL US Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `us-baseline` has 4 plan templates, 3 faction-specific strategy modules (post-Spec-201, after `us.blockImmediateWin` removal; 10 modules bound including the 7 `shared.*`), 2 bound guardrails, and 2 profile-quality witnesses, vs. ARVN's 6 plan templates / 7 faction-specific modules (14 bound) / 7 bound guardrails / 10 witnesses. The competence report (`reports/fitl-competent-agent-ai.md` §1) requires the US to be encoded as an expeditionary stabilizer balancing Support with Available US pieces — concretely: a Support engine that weighs Pacification by space-local features (not generic projected margin), an availability/overcommitment posture, Air Lift as force projection AND withdrawal, Aid/Econ protection as a US concern, and an ARVN-kingmaker throttle. None of these is fully encoded today.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. P0 audits each required DSL surface for capability gaps; the work is YAML-only unless P0 surfaces a genuine engine gap (see §2). Consumes the shared scaffolding from Spec 201.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `reachable`/`adjacent`/etc. for Air Lift route binding
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates`
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe for Air Lift compound availability
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — `shared.*` modules and lifecycle conditions referenced by the new US bindings. 201 has landed and `us-baseline` already binds all 7 `shared.*` modules; conditional "until 201 lands" framing has been removed throughout.

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27). This spec adopts the proposal's §5 (US faction-by-faction analysis) + §6.8 US plan-template slice + §§6.9–6.10 US posture and guardrail slices. Engine architecture concerns are confirmed out of scope except where P0 surfaces a genuine capability gap (§2).

**Ticket namespace**: `202FITLUSCOMP`

---

## 1. Goal

Complete `us-baseline` to ARVN-parity by authoring the plan templates, strategy modules, posture evaluators, and witnesses that encode the US competence requirements from `reports/fitl-competent-agent-ai.md` §1. Concretely:

1. **New US plan templates** (`92-agents.md` `planTemplates`):
   - `us.trainPacify` — Train as Pacification carrier; selects high-pop COIN-Controlled spaces with Support-loss / Terror-removal opportunity.
   - `us.patrolAdvise` — Patrol as economy/security carrier with Advise free-Aid / indigenous-removal.
   - `us.airLiftAssault` — Air Lift before Assault to mass Troops; uses `reachable` role constraint from Spec 196.
   - `us.airLiftControlOrWithdrawal` — Air Lift to preserve Control or withdraw to Available.
   - `us.assaultHighValueInfrastructure` — Assault as Base/NVA-Control removal, not body count.
   - `us.eventDirectSwing` — Event template that binds when active card offers direct Support / Available-US / VC-Base / NVA-Control swing.
   - **`us.airLiftTrain`**: explicit decision per §4.5 — keep disabled with documented rationale (preserve the current witness assertion) UNLESS the P3 authoring experiment demonstrates safe construction. The default this spec ships with is *disabled* + rationale.

2. **New US strategy modules**:
   - `us.buildSupport` — gates `us.trainPacify` / `us.patrolAdvise` when total Support is below the per-profile threshold.
   - `us.preserveAvailability` — demotes plan templates whose net effect is increased US-on-map commitment without Support yield.
   - `us.protectAidEcon` — promotes Patrol-on-LoC and Train-Advise when Aid is low / Econ-LoCs sabotaged.
   - `us.avoidArvnKingmaking` — binds the existing `arvn.usNominalAlly`/`us.arvnNominalAlly` relationship pair via `shared.allyRivalThrottle` consumption AND adds US-side suppression of `us.trainPacify` when ARVN is at or above near-win threshold (rivalry overrides the default cooperative state). `shared.allyRivalThrottle` is available (Spec 201 landed and `us-baseline` binds it), so the throttle is active from P4.

3. **New US posture evaluators**:
   - `us.preserveSupportAndAvailability` — existing skeleton (`92-agents.md:1477-1504`, already carries `must` + `prefer` terms); this spec strengthens it with explicit `prefer` terms for projected Support delta AND projected Available-US delta.
   - `us.airStrikePoliticalCost` — explicit `prefer` term demoting Air Strike candidates whose projected Support delta is negative (see §4.4 — overlaps the existing `us.avoidPoliticalAirStrike` guardrail; dedupe decision deferred to P2).
   - `us.aidEconFloor` — demotes candidates that reduce Aid below a floor or that leave Sabotage on key Econ LoCs.

4. **New US guardrails**:
   - `us.avoidOvercommitment` — vetoes Air Lift / Train templates that increase US-on-map without Support yield.
   - `us.avoidArvnKingmaking` — vetoes Train+Advise / Pacify templates that improve ARVN margin when ARVN is near win and US is not.

5. **Profile-quality witnesses** (full list in §7) covering the competence requirements one-to-one with `reports/fitl-competent-agent-ai.md` §1.

## 2. Non-Goals

- **Engine changes not assumed.** P0 audits each required DSL surface (refs, role constraints, zone props); any *genuine* capability gap is surfaced as an explicit engine prerequisite rather than silently assumed shipped. (The original "no engine changes" claim was inherited unverified from the source proposal; reassessment confirmed the cited surfaces from Specs 196/197/199/201 are shipped, and re-expressed the one gap it found — `roleTarget.target.*`, which does not exist — via the shipped `preview.feature.projectedSupportDelta` proxy, see §4.4.)
- **No NVA / ARVN / VC scope.** Spec 203 owns NVA; Spec 204 owns VC; Spec 205 owns ARVN selector cleanup. (Specs 203/204 share the same nonexistent `roleTarget.*` ref; the §4.4 re-expression resolution carries to them.)
- **No new cap classes.** `grantFlow16` remains the default; Air Lift compound is bounded by Spec 199's existing budget.
- **No solitaire bot reproduction or expansion content** (per the competence report's explicit non-requirements).
- **No new tunable parameters.** The existing `eventWeight`, `trainWeight`, etc., remain; new modules score via explicit `prefer` terms, not new parameters.
- **No removal of existing US witnesses.** `us-advise-airlift-force-multiplier.test.ts` and `us-avoids-airstrike-populated-support.test.ts` are preserved (they continue to pass under the expanded template set).

## 3. Context (verified against codebase, 2026-05-27; line citations re-verified 2026-05-29)

- **Current US library inventory** (`92-agents.md`):
  - Templates (4): `us.trainAdvise`, `us.patrolAdvise`, `us.sweepAirStrike`, `us.assaultAirLiftAssault`.
  - Modules: 3 faction-specific — `us.createAndDefendSupport`, `us.forceMultiplier`, `us.preserveAvailability` (`us.blockImmediateWin` was removed by Spec 201). `us-baseline` also binds all 7 `shared.*` modules from Spec 201, for 10 bound modules total.
  - Posture: 1 (`us.preserveSupportAndAvailability`, already carries `must` + `prefer` terms).
  - Guardrails (2): `us.avoidPoliticalAirStrike`, plus the shared `dropPassWhenOtherMovesExist`.
- **Current US witnesses**: 2 (`us-advise-airlift-force-multiplier.test.ts`, `us-avoids-airstrike-populated-support.test.ts`).
- **`us.airLiftTrain` exclusion**: `packages/engine/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.ts:26,41` explicitly asserts `us.airLiftTrain` is NOT included in the US baseline templates. This spec's P3 decides whether that exclusion stands.
- **Available `reachable` role constraint**: Spec 196 added `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn`, `notEqual` to `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS`; Air Lift origin/destination role binding uses these. Authoring form is the inline-map shorthand (`{ reachable: { from: role.X, to: role.Y, via: routeClass.land } }`, `{ distinctOriginDestination: { origin: role.X, destination: role.Y } }`, `{ notEqual: role.X }`), per the existing `us.assaultAirLiftAssault`/`arvn.assaultTransportAssault` templates — NOT the `{ kind, a, b }` list form.
- **Compound availability**: Spec 199 added the proposer-time compound-availability probe; Air Lift compound templates (Assault + Air Lift + Assault) consult it.
- **Relationships**: `us.arvnNominalAlly` and `us.arvnNearWin` already exist (`92-agents.md:1559-1585`); the gap is module-side consumption.

## 4. Architecture

> **Authoring-surface note (verified 2026-05-29).** The YAML below uses the real plan-template authoring surface as exercised by the existing `us.trainAdvise` template (`92-agents.md:1281`): `root: { actionTags, compound }`, `postureHook`, `roles` with inline `constraints`, `steps` with `{ label, role, match: { decisionKind, targetKind, decisionPath, actionTag } }`, `caps`, and `fallback`. The compiler lowers these to the `Compiled*` types; do not author the lowered key names (`steps`/`postureHook`/`compound` are authored as shown). Selector names and `match` `decisionPath`/`actionTag` details are illustrative and finalized in P1/P2 against the existing templates and the P0 vocabulary audit.

### 4.1 Plan templates (additions)

`us.trainPacify` — Train operation, Pacification space target. The COIN-control + population requirement is carried by the `us.pacifyTargetSpace` selector's filters (§4.2), per the established pattern that selectors carry item-local filters while role `constraints` handle cross-role relations:

```yaml
us.trainPacify:
  traceLabel: "US Train as Pacification carrier"
  root: { actionTags: [train] }
  postureHook: us.preserveSupportAndAvailability
  roles:
    pacifySpace: { selector: us.pacifyTargetSpace, required: true }
  steps:
    - { label: pacify-space, role: pacifySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

`us.patrolAdvise` — Patrol carrier with Advise free-Aid (strengthens the existing partial `us.patrolAdvise`):

```yaml
us.patrolAdvise:
  traceLabel: "US Patrol then Advise"
  root: { actionTags: [patrol], compound: { specialTags: [advise], timing: after } }
  postureHook: us.preserveSupportAndAvailability
  roles:
    patrolLoc: { selector: us.patrolLocTarget, required: true }
    adviseSpace: { selector: us.adviseTargetSpace, required: true, constraints: [{ notEqual: role.patrolLoc }] }
  steps:
    - { label: patrol-loc, role: patrolLoc, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetLoCs, actionTag: patrol } }
    - { label: advise-space, role: adviseSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: advise } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

`us.airLiftAssault` — Air Lift route binding using `reachable`:

```yaml
us.airLiftAssault:
  traceLabel: "US Assault, Air Lift, Assault (mass Troops)"
  root: { actionTags: [assault], compound: { specialTags: [air-lift], timing: during, interruptAfterStage: 1 } }
  postureHook: us.preserveSupportAndAvailability
  roles:
    assaultOrigin: { selector: us.airLiftAssaultOrigin, required: true }
    airLiftDestination:
      selector: us.airLiftRouteDestination
      required: true
      constraints:
        - { reachable: { from: role.assaultOrigin, to: role.airLiftDestination, via: routeClass.land } }
        - { distinctOriginDestination: { origin: role.assaultOrigin, destination: role.airLiftDestination } }
  steps:
    - { label: first-assault-space, role: assaultOrigin, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 0 } }
    - { label: air-lift-route, role: airLiftDestination, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-lift } }
  caps: { capClass: standard256, maxSteps: 2 }
  fallback: { ifSpecialUnavailable: primitivePolicy, ifRoleTargetUnavailable: primitivePolicy }
```

`us.airLiftControlOrWithdrawal` — Air Lift to preserve Control or withdraw to Available:

```yaml
us.airLiftControlOrWithdrawal:
  traceLabel: "US Air Lift to preserve Control or withdraw"
  root: { actionTags: [air-lift] }
  postureHook: us.preserveSupportAndAvailability
  roles:
    airLiftOrigin: { selector: us.airLiftControlOrigin, required: true }
    airLiftDestination:
      selector: us.airLiftControlDestination
      required: true
      constraints:
        - { reachable: { from: role.airLiftOrigin, to: role.airLiftDestination, via: routeClass.land } }
  steps:
    - { label: air-lift-route, role: airLiftDestination, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-lift } }
  caps: { capClass: standard256, maxSteps: 1 }
  fallback: { ifRoleTargetUnavailable: primitivePolicy }
```

`us.assaultHighValueInfrastructure`, `us.eventDirectSwing`: shaped analogously (same `root`/`roles`/`steps`/`caps`/`fallback` skeleton); targets and constraints documented in §4.2 selector definitions.

**`us.airLiftTrain` decision**: this spec ships with the template *not authored*. The rationale (recorded in §11 and propagated to `us-advise-airlift-force-multiplier.test.ts`) is that the compound shape "Air Lift before Training to make a Pacification target legal" requires the airLift→train microturn sequencing surface to be verifiable, and no current witness proves the construction is safe. The decision is reversible: a follow-up ticket may author the template if a P3 authoring experiment demonstrates safe construction.

### 4.2 Selectors (additions)

New US selectors with item-local features (not constant `value: 1` placeholders). The selector ref/operator forms below (`zoneProp.*`, `filters`, `score`) are illustrative; the exact authoring shape follows the existing FITL selectors (which author zone-property access as `zoneProp: { zone: <role>, prop: <name> }` with `filters`/`score` expression trees), to be finalized against the P0 vocabulary audit:

```yaml
us.pacifyTargetSpace:
  scope: zones
  filters:
    - { ref: zoneProp.coinControl }
    - gt:
        - { ref: zoneProp.population }
        - 0
  score:
    add:
      - mul:
          - { weight: 4 }
          - { ref: zoneProp.population }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.hasTerrorMarker }
      - mul:
          - { weight: 2 }
          - boolToNumber: { ref: zoneProp.supportShiftAvailable }

us.airLiftAssaultOrigin:
  scope: zones
  filters:
    - { ref: zoneProp.hasUsTroops }
  score:
    sub:
      - mul:
          - { weight: 5 }
          - { ref: zoneProp.usTroopCount }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.usControlCritical }

us.airLiftRouteDestination:
  scope: zones
  filters:
    - { ref: zoneProp.hasRemovableEnemy }
  score:
    add:
      - mul:
          - { weight: 6 }
          - { ref: zoneProp.removableEnemyValue }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: zoneProp.controlSwingPossible }
```

The specific `zoneProp.*` references must resolve against the existing FITL zone-property authoring; the P0 deliverable surveys what zone props exist (`zoneProp.population`, `zoneProp.econ`, `zoneProp.category` are authored today; `coinControl`, `usTroopCount`, `usControlCritical`, `hasTerrorMarker`, `supportShiftAvailable`, `removableEnemyValue`, `controlSwingPossible`, `hasUsTroops`, `hasRemovableEnemy` are NOT yet authored) and classifies each gap per §6 P0. Spec 205 (ARVN selector cleanup) replaces ARVN placeholders with the same vocabulary.

### 4.3 Strategy modules (additions)

> `feature.totalSupport`, `feature.availableUsTroops`, and `feature.projectedSupportDelta` are authored today; `var.global.aid` is the authored Aid ref (there is no `feature.aid`); `feature.projectedArvnMarginDelta` is NOT yet authored — it must be added as a sibling of the existing `feature.projectedUsMarginDelta` synthesis (data-only authoring, surveyed by P0).

```yaml
us.buildSupport:
  traceLabel: "build support engine"
  when:
    lt:
      - { ref: feature.totalSupport }
      - 30   # threshold-calibrated in P4
  applies:
    scopes: [move]
    actionTags: [train, patrol]
  priority: { tier: 40 }
  enablesPlanTemplates:
    - us.trainPacify
    - us.patrolAdvise
    - us.trainAdvise
  scoreGroups:
    - prefer:
        - weight: 5
          value: { ref: feature.projectedSupportDelta }

us.preserveAvailability:
  traceLabel: "preserve us availability"
  when:
    lt:
      - { ref: feature.availableUsTroops }
      - 4   # threshold-calibrated in P4
  applies:
    scopes: [move]
  priority: { tier: 35 }
  suppressesPlanTemplates:
    - us.airLiftAssault   # mobility-aggressive templates demoted when Available is low
  scoreGroups:
    - prefer:
        - weight: -3
          value:
            coalesce:
              - { ref: preview.feature.availableUsTroops }
              - { ref: feature.availableUsTroops }

us.protectAidEcon:
  traceLabel: "protect aid and econ"
  when:
    lt:
      - { ref: var.global.aid }
      - 15
  applies:
    scopes: [move]
    actionTags: [patrol, train]
  priority: { tier: 30 }
  enablesPlanTemplates:
    - us.patrolAdvise
    - us.trainAdvise
  scoreGroups:
    - prefer:
        - weight: 4
          value: { ref: feature.projectedAidDelta }

us.avoidArvnKingmaking:
  traceLabel: "throttle support gains that help arvn near win"
  when:
    ref: condition.arvnNearWin.satisfied
  applies:
    scopes: [move]
  priority: { tier: 60 }
  suppressesPlanTemplates:
    - us.trainPacify
    - us.patrolAdvise
  scoreGroups:
    - prefer:
        - weight: -5
          value: { ref: feature.projectedArvnMarginDelta }   # authored in P0/P2 as sibling of projectedUsMarginDelta
```

### 4.4 Posture evaluators (additions / strengthening)

> `us.airStrikePoliticalCost` is re-expressed via the shipped `preview.feature.projectedSupportDelta` proxy. The original draft used `roleTarget.target.hasPopulation`/`hasSupport`, a ref namespace that does not exist anywhere in the engine, data, or fixtures — FITL has no posture-level mechanism to read a bound role's zone property, and the established pattern routes target-property-aware steering through selectors (§4.2) and effect-aware steering through projected-delta refs (as the existing `us.avoidPoliticalAirStrike` guardrail does via `feature.projectedUsMarginDelta`). This posture overlaps that guardrail; whether both are retained is a P2 dedupe decision. Preview-fallback is authored as the flat `onUnavailable:` key, matching the existing guardrail surface (`onUnavailable: noFire`).

```yaml
us.preserveSupportAndAvailability:
  applies:
    scopes: [move]
  prefer:
    - weight: 4
      value: { ref: feature.projectedSupportDelta }
      onUnavailable: noContribution
    - weight: 3
      value:
        coalesce:
          - { ref: preview.feature.availableUsTroops }
          - { ref: feature.availableUsTroops }
      onUnavailable: noContribution

us.airStrikePoliticalCost:
  applies:
    scopes: [move]
    actionTags: [air-strike]
  prefer:
    - weight: -8
      value:
        coalesce:
          - { ref: preview.feature.projectedSupportDelta }
          - 0
      onUnavailable: noContribution

us.aidEconFloor:
  applies:
    scopes: [move]
  prefer:
    - weight: -5
      value:
        boolToNumber:
          lt:
            - coalesce:
                - { ref: preview.var.global.aid }
                - { ref: var.global.aid }
            - 10
      onUnavailable: noContribution
```

### 4.5 Guardrails (additions)

> Guardrails author `when:` (trigger condition) + `severity:` (`veto`/`demote`/`prune`) + `onUnavailable:`, matching the existing `us.avoidPoliticalAirStrike`. The earlier `trigger:`/`effect: veto` keys are not the authored surface.

```yaml
us.avoidOvercommitment:
  traceLabel: "US avoid overcommitment without Support yield"
  scopes: [move]
  when:
    and:
      - or:
          - { ref: candidate.tag.air-lift }
          - { ref: candidate.tag.assault }
      - lte:
          - { ref: feature.availableUsTroops }
          - 2
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSupportDelta }
              - 0
          - 1
  severity: veto
  onUnavailable: noFire

us.avoidArvnKingmaking:
  traceLabel: "US do not king-make ARVN near win"
  scopes: [move]
  when:
    and:
      - { ref: condition.arvnNearWin.satisfied }
      - not: { ref: condition.usNearWin.satisfied }
      - or:
          - { ref: candidate.tag.train }
          - { ref: candidate.tag.pacify }
      - gt:
          - coalesce:
              - { ref: preview.feature.projectedArvnMarginDelta }
              - 0
          - 0
  severity: veto
  onUnavailable: noFire
```

### 4.6 Bindings

`us-baseline.bindings.strategyModules` adds: `us.buildSupport`, `us.preserveAvailability` (replacing the existing), `us.protectAidEcon`, `us.avoidArvnKingmaking`. `us-baseline.bindings.planTemplates` adds the new templates from §4.1.

## 5. Edge cases

- **Available US count is unknown via metric synthesis** — `feature.availableUsTroops` is authored today; if P0's metric survey records it as unavailable in a needed scope, this spec authors it via `globalTokenAgg` filtering on faction + type + standing-pool location, recording the exact filter in §4.2 selector definitions.
- **`reachable` constraint requires `routeGraph` data asset** — Spec 196 added `routeGraph` reader; FITL's authored `routeGraph` covers Air Lift adjacency. P2 acceptance verifies the route binding compiles and resolves correctly.
- **`us.airLiftTrain` decision later flips** — reversible via a follow-up ticket that authors the template; the existing witness exclusion would be relaxed.
- **`condition.arvnNearWin` and `condition.usNearWin`** already exist in `92-agents.md` (verified at lines 405-428); no new conditions needed for the kingmaking guardrail.
- **Replay-identity preservation** — existing US witnesses (`us-advise-airlift-force-multiplier`, `us-avoids-airstrike-populated-support`) must continue passing under the expanded template set.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Capability-gap audit (selectors + features + role constraints) | Inventory of available `zoneProp.*` / `feature.*` / `var.global.*` refs and role-constraint kinds; each required-but-missing ref classified as (a) YAML-authorable (new selector/feature synthesis) or (b) genuine engine gap → explicit prerequisite. Gaps recorded as Open Questions for §4.2/§4.3 | S |
| **P1** | New US plan templates (§4.1) | All 6 templates compile against the real authoring surface; `us.airLiftTrain` explicitly excluded with documented rationale | M |
| **P2** | US strategy modules (§4.3) + posture (§4.4) + guardrails (§4.5) | All compile; eligibility-gating verified via Spec 197 trace surface; `us.airStrikePoliticalCost`-vs-`us.avoidPoliticalAirStrike` dedupe decided | M |
| **P3** | `us-baseline` bindings (§4.6) | Profile compiles; existing US witnesses pass; replay-identity for FITL canaries preserved | S |
| **P4** | US profile-quality witness suite (§7) | All 10 witnesses pass; `pnpm turbo build` byte-identical | M |
| **P5** | Replay-identity reattestation | Spec 201 has landed; ARVN seed 1000 / FITL seed 2057 / four-profile convergence canaries all byte-identical with US baseline changes folded in | S |

## 7. Test plan

Profile-quality witnesses (under `packages/engine/test/policy-profile-quality/`). Each new file declares a `// @test-class:` marker per `.claude/rules/testing.md`.

> **As-built classification (202FITLUSCOMP-006, 2026-05-29):** 4 witnesses are `convergence-witness` (the Train/Patrol scenarios, which produce proposal alternatives at the initial state and assert seed-pinned role-binding behavior); 7 are `architectural-invariant` (the Assault/Air Lift/Sweep scenarios — which produce **no** proposal alternative at the initial state, a pre-existing trait — plus the exclusion and binding checks; these are proven structurally over the compiled doctrine). This reclassification (vs. the 10-convergence/1-invariant split below) follows the testing rules' "start as architectural-invariant whenever possible / distillation over witness" guidance and avoids the seed-staleness that left 9 older `Spec 188` convergence witnesses failing on this branch. Per the `policy-profile-quality` marker convention, convergence witnesses carry `// @profile-variant: us-baseline` (not `@witness`); architectural-invariant files carry neither. All 11 §7 witnesses below are present, each mapped to its `reports/fitl-competent-agent-ai.md` §1 requirement:

- `us-immediate-win-by-support.test.ts` (convergence-witness) — scenario where Pacification crosses the threshold; selected template = `us.trainPacify`.
- `us-blocks-vc-near-win.test.ts` (convergence-witness) — scenario where VC at -1; selected template prefers VC-Base removal or Opposition reduction.
- `us-blocks-nva-near-win.test.ts` (convergence-witness) — scenario where NVA at -1; selected template prefers NVA-Control/Base removal.
- `us-train-pacify-high-pop-support.test.ts` (convergence-witness) — selector picks the highest-population COIN-Controlled Support-shift-available space.
- `us-train-advise-beats-plain-train.test.ts` (convergence-witness) — when indigenous-removal opportunity exists, `us.trainAdvise` outscores `us.trainPacify`.
- `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` (convergence-witness) — positive-case companion to the preserved `us-avoids-airstrike-populated-support.test.ts`: zero-pop or Trail target preferred.
- `us-airlift-assault-no-control-abandonment.test.ts` (convergence-witness) — `us.airLiftAssault` selector demotes origins whose `usControlCritical` is true.
- `us-patrol-protects-high-econ-loc.test.ts` (convergence-witness) — Patrol target chosen by Econ value, not generic projected margin.
- `us-avoid-arvn-kingmaking.test.ts` (convergence-witness) — when ARVN at -1 and US not near win, `us.trainPacify` is suppressed in favor of `us.assaultHighValueInfrastructure` or `us.sweepAirStrike`.
- `us-airlift-train-not-enabled.test.ts` (convergence-witness) — **new** witness asserting the `us.airLiftTrain` exclusion with the §4.1 rationale comment. Distinct from the preserved `us-advise-airlift-force-multiplier.test.ts:26,41` (which also asserts the exclusion as a side-condition); if P3 finds the two redundant, fold this into the existing witness rather than shipping both.

Architectural invariants:
- `us-templates-bind-shared-modules.test.ts` (architectural-invariant) — verifies `us-baseline` binds `shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.eventDirectSwing` (these are bound today post-Spec-201; the witness guards against regression).

Determinism: `pnpm turbo build` byte-identical; FITL canaries byte-identical.

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only authoring; P0 routes any genuine engine gap to an explicit prerequisite rather than smuggling game logic into the engine |
| #2 | All US doctrine evolvable via tunable parameters and bindings |
| #15 | Closes the US-vs-ARVN parity gap with concrete templates and witnesses; the `roleTarget` re-expression fixes a root cause (nonexistent ref) rather than papering over it |
| #16 | 10 witnesses cover the competence report's §1 requirements |
| #19 | Compound shapes (Air Lift + Assault) emerge from microturn step decisions, not pre-declared compounds |
| #20 | All preview-derived `prefer` terms declare `onUnavailable: noContribution`; guardrails declare `onUnavailable: noFire` |

## 9. Reassessment of source proposal (`reports/fitl-ai-encoding-first-iteration.md`)

**Adopted (US slice):**
- §5 US faction-by-faction recommendations → §§4.1–4.5.
- §6.8 US plan-template list → §4.1 (with `us.airLiftTrain` decision recorded explicitly).
- §6.9 US posture evaluators → §4.4.
- §6.10 US guardrails (`us.avoidOvercommitment`, `us.avoidArvnKingmaking`) → §4.5.

**Adopted with adjustment:**
- §5 "expand `us.adviseTargetSpace`, `us.trainSupportSpace`": adopted as new `us.pacifyTargetSpace` and renamed `us.adviseTargetSpace` with item-local features (per Spec 205's hygiene rule), not the original constant-1 placeholder.
- §5 Air Lift coverage: adopted with `us.airLiftTrain` explicitly *not* enabled by default; rationale documented in §4.1 and propagated to the existing exclusion witness.

**Corrected:**
- The proposal lists 5 `postState` predicates (`notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`); these are role-constraint kinds added by Spec 196, not literal `postState` predicate kinds. The §4.1 templates use them as role constraints in the authored inline-map form (Spec 196's surface), which is the actual supported shape.
- The proposal's template/module/posture/guardrail YAML used field names (`matchActionTag`, `microturnSteps`/`bindTo`, `compoundSpecial`, `posture:`, `trigger:`/`effect:`, `previewFallback`) that do not match the real authoring surface; §4 now uses the verified surface (`root`/`steps`/`postureHook`/`compound`, `when`/`severity`/`onUnavailable`) per the existing `us.trainAdvise`/`us.avoidPoliticalAirStrike`.
- `us.airStrikePoliticalCost` used `roleTarget.target.*`, a nonexistent ref; re-expressed via `preview.feature.projectedSupportDelta` (§4.4). `feature.aid` corrected to `var.global.aid` (§4.3).

**Deferred:**
- US Train+Advise Aid-mode variant — uncommitted until a witness shows the current Aid-mode selector cannot differentiate.
- Pacification "for Aid" vs "for Support" specialization — uncommitted; current `us.trainPacify` covers Support and `us.protectAidEcon` covers Aid posture separately.

**Rejected:**
- "Add `us.airLiftTrain` now" — preserved as explicitly excluded with rationale. Reversible via follow-up ticket.

## 10. Out of scope (named follow-on / sibling)

- **Spec 201** — shared doctrine + lifecycle awareness (soft prerequisite, COMPLETED).
- **Spec 203** — NVA completion (shares the `roleTarget.*` re-expression resolution from §4.4).
- **Spec 204** — VC completion (shares the `roleTarget.*` re-expression resolution from §4.4).
- **Spec 205** — ARVN selector cleanup (the placeholder-replacement pattern this spec uses for US selectors is the same pattern Spec 205 applies to ARVN).
- US Train+Advise Aid-mode specialization — uncommitted.
- US Irregular/Ranger specific removal templates — uncommitted; current selectors treat indigenous removal as a generic option.

## 11. Open questions

- **Selector/feature vocabulary (P0 capability audit)** — **RESOLVED by 202FITLUSCOMP-001 (2026-05-29). No genuine engine gaps; all signals YAML-authorable.** The audit confirmed the spec's `zoneProp.<name>` ref forms are illustrative — the real agent-policy *per-zone (item-local)* read surface (used by existing FITL selectors such as `arvn.governPatronageSpace`, `us.trainSupportSpace`) is:
  - `zoneProp: { zone: { ref: selector.item.key }, prop: <name> }` → **static** zone attributes only (resolver `plan-proposal.ts:729` reads `zone.category` + `zone.attributes[prop]`): `population`, `econ`, `category` exist; dynamic state (control, terror) is **not** a static attribute and is not readable here.
  - `lookup: { surface: policyState, collection: zones, keyType: ZoneId, key: { ref: selector.item.key }, path: [markers, supportOpposition], onMissing: {...} }` → per-zone `supportOpposition` marker state (the only zone marker; control is **not** a marker).
  - `zoneTokenAgg: { zone: { ref: selector.item.key }, owner: ..., prop: <numericTokenProp>, aggOp: count|sum|min|max }` → per-zone token aggregation. **Correction (verified against `policy-evaluation-core.ts:1784-1818` + `2707-2778`):** `owner` selects *which* zone (owner-relative pool resolution, as in Texas Hold'em's `owner: self → self's hand`), it does **not** filter tokens by faction; for a fixed `selector.item.key` the aggregate is faction-agnostic over all tokens carrying the numeric `prop`. So per-zone *faction-specific* counts (US troops, enemy bases) are **not** expressible here.
  - `adjacentTokenAgg`, numeric/boolean ops, `coalesce`, `boolToNumber`, and global `feature.*` / `candidateFeature` refs.

  Per-zone control is the global metric `metric.auto:victory:controlledPopulation:coin` (not per-zone); `terrorCount` is a per-zone `zoneVar` (not readable via `zoneProp`, which only reads static attributes). Classification of each required signal:

  | Spec signal | Real expression | Class |
  |---|---|---|
  | `population` / `econ` / `category` | `zoneProp` (static) | (a) authorable — exists |
  | `supportShiftAvailable` | `lookup` `supportOpposition` ≠ `activeSupport` via `boolToNumber` | (a) authorable |
  | `coinControl` (as **filter**) | not needed — legal-move enumeration already gates Pacify/Assault legality; selectors only **rank** legal candidates | (a) re-expressed: dropped as filter |
  | `hasUsTroops` / `usTroopCount` / `usControlCritical` | per-zone faction-token counts not expressible (see correction above); control-criticality proxied by **`zoneProp population`** (high-pop spaces are control-critical — negative weight in Air Lift origin so the bot avoids stripping troops from valuable spaces). Legal-move enumeration already restricts origins to those with liftable US troops. | (a) authorable via proxy |
  | `hasTerrorMarker` | per-zone `terrorCount` zoneVar **not** item-locally readable; pacify ranking captured by `population` + `supportShiftAvailable` | (a) re-expressed: dropped |
  | `removableEnemyValue` / `hasRemovableEnemy` | per-zone enemy counts not expressible; proxied by **`lookup supportOpposition == activeOpposition/passiveOpposition`** (enemy strongholds carry Opposition) + `population` (high-value targets) | (a) authorable via proxy |
  | `controlSwingPossible` | `population` + Opposition-marker proxy (a high-pop Opposition space is where COIN control most swings on a successful Assault) | (a) authorable via proxy |
  | `feature.projectedArvnMarginDelta` | new `candidateFeature` = `sub(feature.projectedArvnMargin, feature.arvnMargin)` (sibling of `projectedUsMarginDelta`); both operands exist | (a) authorable — authored in 002 |

  Other refs confirmed present: `feature.totalSupport`, `feature.availableUsTroops`, `feature.projectedSupportDelta`, `feature.projectedAidDelta`, `feature.projectedUsMarginDelta`, `var.global.aid`, `preview.feature.totalSupport`, `preview.var.global.aid`, `condition.arvnNearWin`/`condition.usNearWin` (`92-agents.md:405,417`), candidate tags `train`/`assault`/`air-lift` (action tags; `candidate.tag.*` validates kebab-case format only, not existence, so `pacify` compiles and evaluates as a harmless extra signal alongside `train`). **Conclusion: no engine prerequisite spec is required; tickets 002–004 author entirely in `92-agents.md` YAML.**
- **`us.airLiftTrain` enablement**: does a safe authoring exist? Deferred to a follow-up ticket post-202.
- **`us.eventDirectSwing` as a plan template** — **RESOLVED by 202FITLUSCOMP-002 (2026-05-29, user-approved): NOT authored as a plan template; excluded with rationale (like `us.airLiftTrain`).** The engine requires every plan template to declare ≥1 role + ≥1 step bound to a concrete microturn decision (`compile-agent-plan-templates.ts:69`). FITL events all share the single `event` action (tag `event-play`) but each card exposes heterogeneous, card-specific decisions (`$targetHighland`, `$usTroopsToMove`, …) with no uniform bindable `decisionPath`, so a general event plan template cannot be authored. The event direct-swing doctrine is already fully encoded by the bound `shared.eventDirectSwing` strategy module (scores `event-play` candidates by `projectedSelfMargin`), which §7's `us-templates-bind-shared-modules` architectural witness verifies. Reversible via a follow-up ticket. Consequently: 202FITLUSCOMP-005 binds 5 (not 6) new templates and no `us.eventDirectSwing`; 202FITLUSCOMP-006 ships no dedicated `us.eventDirectSwing` witness (the architectural witness already covers `shared.eventDirectSwing`).
- **`us.airStrikePoliticalCost` vs `us.avoidPoliticalAirStrike`** — **RESOLVED by 202FITLUSCOMP-004 (2026-05-29): drop the posture, retain the guardrail.** Two reinforcing reasons: (1) the existing `us.avoidPoliticalAirStrike` guardrail already demotes Air Strike on populated Support (`when` = air-strike tag + `feature.projectedUsMarginDelta < 2`, `severity: demote`, `penalty: 700`) — a posture variant adds nothing; (2) the real `CompiledPostureEvaluator` surface has **no** `applies`/`actionTags`/`scopes`, so a posture cannot tag-filter to air-strike, and posture evaluators only score a plan when referenced as a template's `postureHook` (`plan-proposal.ts:577`) — a standalone unhooked posture is inert. **Also resolved:** `us.aidEconFloor` (spec §4.4 lists it as a posture) is authored as a **guardrail** for the same reason — to actually fire per-candidate (`when` = COIN-op tag + projected `var.global.aid < 10`, `severity: demote`, `penalty: 400`), since an unhooked posture would never apply. The remaining §4.4 posture work — strengthening `us.preserveSupportAndAvailability` — is authored as `prefer` terms (`projected-support-delta` w4, `available-us` w3 coalesce, each `fallback: { contribution: 0 }`), the real posture-`prefer` fallback surface (not `onUnavailable`). The §4.5 guardrails (`us.avoidOvercommitment`, `us.avoidArvnKingmaking`) use `severity: demote` with high penalties (800/600) — the FITL idiom for the spec's "veto" intent (`veto` is not a valid `GuardrailSeverity`; the enum is `prune`/`demote`/`warn`/`auditOnly`, and `prune` is reserved for the pass-drop guardrail to never eliminate the last legal move, cf. `arvn.doNotServeUSWin` penalty 600).
- **Threshold calibration**: the `totalSupport < 30` / `availableUsTroops < 4` / `aid < 15` thresholds in §4.3 are initial drafts; P4 calibrates against the four-profile convergence canary.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-29:

- [`tickets/202FITLUSCOMP-001.md`](../tickets/202FITLUSCOMP-001.md) — P0 US capability-gap audit (covers §6 P0)
- [`tickets/202FITLUSCOMP-002.md`](../tickets/202FITLUSCOMP-002.md) — P1 US selectors + plan templates + vocabulary synthesis (covers §4.1, §4.2, §6 P1)
- [`tickets/202FITLUSCOMP-003.md`](../tickets/202FITLUSCOMP-003.md) — P2a US strategy modules (covers §4.3)
- [`tickets/202FITLUSCOMP-004.md`](../tickets/202FITLUSCOMP-004.md) — P2b US posture evaluators + guardrails (covers §4.4, §4.5)
- [`tickets/202FITLUSCOMP-005.md`](../tickets/202FITLUSCOMP-005.md) — P3 `us-baseline` bindings (covers §4.6)
- [`tickets/202FITLUSCOMP-006.md`](../tickets/202FITLUSCOMP-006.md) — P4 US profile-quality witness suite (covers §7)
- [`tickets/202FITLUSCOMP-007.md`](../tickets/202FITLUSCOMP-007.md) — P5 replay-identity reattestation (covers §6 P5)

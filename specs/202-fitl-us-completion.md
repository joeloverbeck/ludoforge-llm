# Spec 202 — FITL US Baseline Completion to ARVN-Parity

**Status**: PROPOSED
**Priority**: High — `us-baseline` has 4 plan templates, 4 strategy modules, 2 guardrails, and 2 profile-quality witnesses, vs. ARVN's 6/8/7/10. The competence report (`reports/fitl-competent-agent-ai.md` §1) requires the US to be encoded as an expeditionary stabilizer balancing Support with Available US pieces — concretely: a Support engine that weighs Pacification by space-local features (not generic projected margin), an availability/overcommitment posture, Air Lift as force projection AND withdrawal, Aid/Econ protection as a US concern, and an ARVN-kingmaker throttle. None of these is fully encoded today.
**Complexity**: M — YAML authoring in `data/games/fire-in-the-lake/92-agents.md` plus profile-quality witnesses. No engine work. Consumes the shared scaffolding from Spec 201.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `reachable`/`adjacent`/etc. for Air Lift route binding
- `archive/specs/197-doctrine-gated-plan-template-eligibility.md` (COMPLETED) — `enablesPlanTemplates`/`suppressesPlanTemplates`
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED) — bounded compound probe for Air Lift compound availability
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — `shared.*` modules and lifecycle conditions referenced by the new US bindings.

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27). This spec adopts the proposal's §5 (US faction-by-faction analysis) + §6.8 US plan-template slice + §§6.9–6.10 US posture and guardrail slices. Engine architecture concerns are confirmed out of scope.

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
   - `us.avoidArvnKingmaking` — binds the existing `arvn.usNominalAlly`/`us.arvnNominalAlly` relationship pair via `shared.allyRivalThrottle` consumption AND adds US-side suppression of `us.trainPacify` when ARVN is at or above near-win threshold (rivalry overrides the default cooperative state). Note: `shared.allyRivalThrottle` lives in Spec 201; if 201 has not landed when this spec's P4 starts, this module reduces to the suppression behavior alone until 201 lands and the shared throttle activates.

3. **New US posture evaluators**:
   - `us.preserveSupportAndAvailability` — existing skeleton if any; this spec strengthens it with explicit `prefer` terms for projected Support delta AND projected Available-US delta.
   - `us.airStrikePoliticalCost` — explicit `prefer` term demoting candidates that select a populated-Support space for Air Strike target.
   - `us.aidEconFloor` — demotes candidates that reduce Aid below a floor or that leave Sabotage on key Econ LoCs.

4. **New US guardrails**:
   - `us.avoidOvercommitment` — vetoes Air Lift / Train templates that increase US-on-map without Support yield.
   - `us.avoidArvnKingmaking` — vetoes Train+Advise / Pacify templates that improve ARVN margin when ARVN is near win and US is not.

5. **Profile-quality witnesses** (full list in §7) covering the competence requirements one-to-one with `reports/fitl-competent-agent-ai.md` §1.

## 2. Non-Goals

- **No engine changes.** All required DSL surfaces are post-Spec-199 shipped.
- **No NVA / ARVN / VC scope.** Spec 203 owns NVA; Spec 204 owns VC; Spec 205 owns ARVN selector cleanup.
- **No new cap classes.** `grantFlow16` remains the default; Air Lift compound is bounded by Spec 199's existing budget.
- **No solitaire bot reproduction or expansion content** (per the competence report's explicit non-requirements).
- **No new tunable parameters.** The existing `eventWeight`, `trainWeight`, etc., remain; new modules score via explicit `prefer` terms, not new parameters.
- **No removal of existing US witnesses.** `us-advise-airlift-force-multiplier.test.ts` and `us-avoids-airstrike-populated-support.test.ts` are preserved (they continue to pass under the expanded template set).

## 3. Context (verified against codebase, 2026-05-27)

- **Current US library inventory** (`92-agents.md`):
  - Templates (4): `us.trainAdvise`, `us.patrolAdvise` (partial), `us.sweepAirStrike`, `us.assaultAirLiftAssault`.
  - Modules (4): `us.blockImmediateWin` (removed by Spec 201), `us.createAndDefendSupport`, `us.forceMultiplier`, `us.preserveAvailability`.
  - Posture: 1 (`us.preserveSupportAndAvailability`).
  - Guardrails (2): `us.avoidPoliticalAirStrike`, plus the shared `dropPassWhenOtherMovesExist`.
- **Current US witnesses**: 2 (`us-advise-airlift-force-multiplier.test.ts`, `us-avoids-airstrike-populated-support.test.ts`).
- **`us.airLiftTrain` exclusion**: `packages/engine/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.ts:26,41` explicitly asserts `us.airLiftTrain` is NOT included in the US baseline templates. This spec's P3 decides whether that exclusion stands.
- **Available `reachable` role constraint**: Spec 196 added `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn` to `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS`; Air Lift origin/destination role binding uses these.
- **Compound availability**: Spec 199 added the proposer-time compound-availability probe; Air Lift compound templates (Assault + Air Lift + Assault) consult it.
- **Relationships**: `us.arvnNominalAlly` and `us.arvnNearWin` already exist (`92-agents.md:1379-1431`); the gap is module-side consumption.

## 4. Architecture

### 4.1 Plan templates (additions)

`us.trainPacify` — Train operation, Pacification space target:

```yaml
us.trainPacify:
  matchActionTag: train
  roles:
    pacifySpace:
      selector: us.pacifyTargetSpace
      constraints:
        - kind: postState
          predicate: coinControlPresentInSpace
        - kind: postState
          predicate: spaceHasPopulation
  microturnSteps:
    - bindTo: pacifySpace
  posture: us.preserveSupportAndAvailability
  compoundSpecial: null
```

`us.patrolAdvise` — Patrol carrier with Advise free-Aid:

```yaml
us.patrolAdvise:
  matchActionTag: patrol
  roles:
    patrolLoc:
      selector: us.patrolLocTarget
    adviseSpace:
      selector: us.adviseTargetSpace
      constraints:
        - kind: notEqual
          a: patrolLoc
          b: adviseSpace
  microturnSteps:
    - bindTo: patrolLoc
    - bindTo: adviseSpace
  compoundSpecial:
    tag: advise
    timing: during
  posture: us.preserveSupportAndAvailability
```

`us.airLiftAssault` — Air Lift route binding using `reachable`:

```yaml
us.airLiftAssault:
  matchActionTag: assault
  roles:
    assaultOrigin:
      selector: us.airLiftAssaultOrigin
    airLiftOrigin:
      selector: us.airLiftRouteOrigin
    airLiftDestination:
      selector: us.airLiftRouteDestination
      constraints:
        - kind: reachable
          from: airLiftOrigin
          to: airLiftDestination
        - kind: distinctOriginDestination
          a: airLiftOrigin
          b: airLiftDestination
    assaultSecondary:
      selector: us.assaultHighValueTarget
  microturnSteps:
    - bindTo: assaultOrigin
    - bindTo: airLiftOrigin
    - bindTo: airLiftDestination
    - bindTo: assaultSecondary
  compoundSpecial:
    tag: airLift
    timing: during
```

`us.airLiftControlOrWithdrawal` — Air Lift to preserve Control or withdraw to Available:

```yaml
us.airLiftControlOrWithdrawal:
  matchActionTag: airLift
  roles:
    airLiftOrigin:
      selector: us.airLiftControlOrigin
    airLiftDestination:
      selector: us.airLiftControlDestination
      constraints:
        - kind: reachable
          from: airLiftOrigin
          to: airLiftDestination
  microturnSteps:
    - bindTo: airLiftOrigin
    - bindTo: airLiftDestination
```

`us.assaultHighValueInfrastructure`, `us.eventDirectSwing`: shaped analogously; targets and constraints documented in §4.2 selector definitions.

**`us.airLiftTrain` decision**: this spec ships with the template *not authored*. The rationale (recorded in §11 and propagated to `us-advise-airlift-force-multiplier.test.ts`) is that the compound shape "Air Lift before Training to make a Pacification target legal" requires the airLift→train microturn sequencing surface to be verifiable, and no current witness proves the construction is safe. The decision is reversible: a follow-up ticket may author the template if a P3 authoring experiment demonstrates safe construction.

### 4.2 Selectors (additions)

New US selectors with item-local features (not constant `value: 1` placeholders):

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

The specific `zoneProp.*` references must resolve against the existing FITL zone-property authoring; the P0 deliverable surveys what zone props exist (`zoneProp.population`, `zoneProp.support`, `zoneProp.opposition`, `zoneProp.coinControl`, `zoneProp.usTroopCount`, etc.) and records gaps as Open Questions so Spec 205 (ARVN selector cleanup) can authoritatively replace placeholders with the same vocabulary.

### 4.3 Strategy modules (additions)

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
      - { ref: feature.aid }
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
          value: { ref: feature.projectedArvnMarginDelta }
```

### 4.4 Posture evaluators (additions / strengthening)

```yaml
us.preserveSupportAndAvailability:
  applies:
    scopes: [move]
  prefer:
    - weight: 4
      value: { ref: feature.projectedSupportDelta }
      previewFallback:
        onUnavailable: noContribution
    - weight: 3
      value:
        coalesce:
          - { ref: preview.feature.availableUsTroops }
          - { ref: feature.availableUsTroops }
      previewFallback:
        onUnavailable: noContribution

us.airStrikePoliticalCost:
  applies:
    scopes: [move]
    actionTags: [airStrike]
  prefer:
    - weight: -8
      value:
        boolToNumber:
          and:
            - { ref: candidate.tag.airStrike }
            - { ref: roleTarget.target.hasPopulation }
            - { ref: roleTarget.target.hasSupport }

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
      previewFallback:
        onUnavailable: noContribution
```

### 4.5 Guardrails (additions)

```yaml
us.avoidOvercommitment:
  trigger:
    and:
      - or:
          - { ref: candidate.tag.airLift }
          - { ref: candidate.tag.assault }
      - lte:
          - { ref: feature.availableUsTroops }
          - 2
      - lt:
          - coalesce:
              - { ref: preview.feature.projectedSupportDelta }
              - 0
          - 1
  effect: veto

us.avoidArvnKingmaking:
  trigger:
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
  effect: veto
```

### 4.6 Bindings

`us-baseline.bindings.strategyModules` adds: `us.buildSupport`, `us.preserveAvailability` (replacing the existing), `us.protectAidEcon`, `us.avoidArvnKingmaking`. `us-baseline.bindings.planTemplates` adds the new templates from §4.1.

## 5. Edge cases

- **Available US count is unknown via metric synthesis** — if Spec 201's P0 metric survey records `availableUsTroops` as unavailable, this spec authors it via `globalTokenAgg` filtering on faction + type + standing-pool location, recording the exact filter in §4.1 selector definitions.
- **`reachable` constraint requires `routeGraph` data asset** — Spec 196 added `routeGraph` reader; FITL's authored `routeGraph` covers Air Lift adjacency. P2 acceptance verifies the route binding compiles and resolves correctly.
- **`us.airLiftTrain` decision later flips** — reversible via a follow-up ticket that authors the template; the existing witness exclusion would be relaxed.
- **`condition.arvnNearWin` and `condition.usNearWin`** already exist in `92-agents.md` (verified at lines 261-296); no new conditions needed for the kingmaking guardrail.
- **Replay-identity preservation** — existing US witnesses (`us-advise-airlift-force-multiplier`, `us-avoids-airstrike-populated-support`) must continue passing under the expanded template set.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector vocabulary survey | Inventory of available `zoneProp.*` references; gaps recorded as Open Questions for §4.2 selectors | S |
| **P1** | New US plan templates (§4.1) | All 6 templates compile; `us.airLiftTrain` explicitly excluded with documented rationale | M |
| **P2** | US strategy modules (§4.3) + posture (§4.4) + guardrails (§4.5) | All compile; eligibility-gating verified via Spec 197 trace surface | M |
| **P3** | `us-baseline` bindings (§4.6) | Profile compiles; existing US witnesses pass; replay-identity for FITL canaries preserved | S |
| **P4** | US profile-quality witness suite (§7) | All 10 witnesses pass; `pnpm turbo build` byte-identical | M |
| **P5** | Replay-identity reattestation against Spec 201 | After Spec 201 lands, ARVN seed 1000 / FITL seed 2057 / four-profile convergence canaries all byte-identical with US baseline changes folded in | S |

## 7. Test plan

Profile-quality witnesses (under `packages/engine/test/policy-profile-quality/`):

- `us-immediate-win-by-support.test.ts` — scenario where Pacification crosses the threshold; selected template = `us.trainPacify`.
- `us-blocks-vc-near-win.test.ts` — scenario where VC at -1; selected template prefers VC-Base removal or Opposition reduction.
- `us-blocks-nva-near-win.test.ts` — scenario where NVA at -1; selected template prefers NVA-Control/Base removal.
- `us-train-pacify-high-pop-support.test.ts` — selector picks the highest-population COIN-Controlled Support-shift-available space.
- `us-train-advise-beats-plain-train.test.ts` — when indigenous-removal opportunity exists, `us.trainAdvise` outscores `us.trainPacify`.
- `us-sweep-airstrike-prefers-zero-pop-or-trail.test.ts` — existing `us-avoids-airstrike-populated-support.test.ts` strengthened with a positive case: zero-pop or Trail target preferred.
- `us-airlift-assault-no-control-abandonment.test.ts` — `us.airLiftAssault` selector demotes origins whose `usControlCritical` is true.
- `us-patrol-protects-high-econ-loc.test.ts` — Patrol target chosen by Econ value, not generic projected margin.
- `us-avoid-arvn-kingmaking.test.ts` — when ARVN at -1 and US not near win, `us.trainPacify` is suppressed in favor of `us.assaultHighValueInfrastructure` or `us.sweepAirStrike`.
- `us-airlift-train-not-enabled.test.ts` — existing exclusion preserved with new rationale comment.

Architectural invariants:
- `us-templates-bind-shared-modules.test.ts` — verifies `us-baseline` binds `shared.immediateWin`, `shared.blockCurrentLeader`, `shared.nearCoupConcreteSwing`, `shared.eventDirectSwing` (when Spec 201 is live).

Determinism: `pnpm turbo build` byte-identical; FITL canaries byte-identical.

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only |
| #2 | All US doctrine evolvable via tunable parameters and bindings |
| #15 | Closes the US-vs-ARVN parity gap with concrete templates and witnesses |
| #16 | 10 witnesses cover the competence report's §1 requirements |
| #19 | Compound shapes (Air Lift + Assault) emerge from microturn step decisions, not pre-declared compounds |
| #20 | All preview-derived features declare `previewFallback.onUnavailable: noContribution` |

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
- The proposal lists 5 `postState` predicates (`notEqual`, `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`); these are role-constraint kinds added by Spec 196, not literal `postState` predicate kinds. The §4.1 templates use them as role constraints (Spec 196's surface), which is the actual supported shape.

**Deferred:**
- US Train+Advise Aid-mode variant — uncommitted until a witness shows the current Aid-mode selector cannot differentiate.
- Pacification "for Aid" vs "for Support" specialization — uncommitted; current `us.trainPacify` covers Support and `us.protectAidEcon` covers Aid posture separately.

**Rejected:**
- "Add `us.airLiftTrain` now" — preserved as explicitly excluded with rationale. Reversible via follow-up ticket.

## 10. Out of scope (named follow-on / sibling)

- **Spec 201** — shared doctrine + lifecycle awareness (soft prerequisite).
- **Spec 203** — NVA completion.
- **Spec 204** — VC completion.
- **Spec 205** — ARVN selector cleanup (the placeholder-replacement pattern this spec uses for US selectors is the same pattern Spec 205 applies to ARVN).
- US Train+Advise Aid-mode specialization — uncommitted.
- US Irregular/Ranger specific removal templates — uncommitted; current selectors treat indigenous removal as a generic option.

## 11. Open questions

- **Zone-prop vocabulary**: which of `zoneProp.coinControl`, `zoneProp.usTroopCount`, `zoneProp.usControlCritical`, `zoneProp.hasTerrorMarker`, `zoneProp.supportShiftAvailable`, `zoneProp.removableEnemyValue`, `zoneProp.controlSwingPossible`, `zoneProp.hasUsTroops`, `zoneProp.hasRemovableEnemy` exist today vs. require introduction in the FITL token/zone data files? P0 deliverable answers.
- **`us.airLiftTrain` enablement**: does a safe authoring exist? Deferred to a follow-up ticket post-202.
- **Threshold calibration**: the `totalSupport < 30` / `availableUsTroops < 4` / `aid < 15` thresholds in §4.3 are initial drafts; P4 calibrates against the four-profile convergence canary.

# Spec 205 — FITL ARVN Selector Cleanup and Placeholder Replacement

**Status**: PROPOSED
**Priority**: Medium — `arvn-baseline` is the most mature faction (21 library components: 9 selectors + 6 plan templates + 6 guardrails; plus 8 strategy modules + 1 posture + 2 relationships and 10 profile-quality witnesses), but its maturity grew during the architecture-proving period and several selectors still score with placeholder constants (`value: 1`) or rely on global features (`feature.coinControlPop`) as item-local target quality rather than `zoneProp`/`lookup`/`aggregate`-derived local features. The proposal correctly identifies this as quality-gap, not absence-of-doctrine — and warns against renaming for aesthetics. The fix is targeted replacement of *only* the items where a real local feature is available.
**Complexity**: S–M — selector body replacements in `data/games/fire-in-the-lake/92-agents.md` plus regression-only witnesses. No engine work. Existing ARVN doctrine, plan templates, modules, posture, guardrails, and witnesses are preserved.
**Date**: 2026-05-27 (reassessed 2026-06-01)
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — inline `postState.predicate.condition` shape (Transport origin-control).
- **Soft**: `archive/specs/137-convergence-witness-invariant-promotion.md` (COMPLETED) — distillation rule lineage cited in §5 and §7.
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — Spec 205 is *independent* of 201, but the selector-vocabulary baseline 201 P0 surveys is consumed here when relevant.

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27).

**Ticket namespace**: `205FITLARVSEL`

---

## 1. Goal

Replace placeholder-constant selector components (`value: 1`) and global-feature-as-zone-score patterns with item-local features authored as `zoneProp` / `lookup` / `aggregate` constructs, where a real local feature is available. Strengthen Transport with an inline `postState.predicate.condition` origin-control guard. Extend Govern with a Patronage-availability term (the Active-vs-Passive Support distinction already ships at `arvn.governPatronageSpace.activeSupportGovern` / `passiveSupportGovern`). Preserve all existing ARVN doctrine, plan templates, modules, posture, guardrails, and witnesses verbatim. Concretely:

1. **Replace placeholder selectors** (verified line refs from `92-agents.md`):
   - `arvn.trainSpaceForControlOrPacification:569` — `controlOrPacificationOpportunity` with `value: 1` → item-local population, terror-marker presence, Pacification-eligibility, city-target components.
   - `arvn.sweepToExposeSpace:637` — `exposeUndergroundThreat` with `value: 1` → underground-guerrilla count, insurgent-base-presence components.
   - `arvn.raidRemovalTarget:652` — `baseOrUndergroundRemoval` with `value: 1` → removable-base-presence, underground-guerrilla-count components.
   - `arvn.transportOrigin:667` — `overstackedSafeOrigin` with `value: 1` → ARVN-troop-overstack component (`authoredMapSpace` and `preserveOriginControl` retained).
   - `arvn.pieceRemovalPriority:741` — `baseAndControlThreat` with `value: 1` → removable-base, control-swing, population components.

2. **Strengthen Transport with an inline `postState.predicate.condition` origin-control guard**:
   - Add an inline `postState` constraint with `predicate: { condition: { bindings, when } }` (modeled on the existing `arvn.trainTransport.transportDestination` constraint at `92-agents.md:1990-2019`) to the `arvn.trainTransport` plan template's `transportOrigin` role so Transport that would lose origin-Control is filtered at constraint time, not posture time. The existing `arvn.doNotLoseOriginControlByTransport` guardrail remains as defense-in-depth.

3. **Extend Govern with a Patronage-availability term**:
   - Existing `arvn.governPatronageSpace` already encodes Active-vs-Passive Support via `activeSupportGovern` (weight 20) and `passiveSupportGovern` (weight 10) components at `92-agents.md:576-601`. Add an `arvnCubesExceedUsCubes` term so Govern is demoted when Patronage mode is unavailable.

4. **Preserve generic-weight reliance as fallback only**:
   - `rallyWeight`, `taxWeight`, `governWeight`, `trainWeight`, `sweepWeight`, `assaultWeight` parameters remain as fallback tuning knobs (per the proposal — "acceptable as fallback tuning knobs, but they should not be the primary strategic encoding"). ARVN module `scoreGroups` continue to use explicit `prefer` terms over item-local features; only the `considerations` section retains the binary-tag weight pattern.

Sweep+Raid preview-derived posture composition is deferred to §10 (blocked on the absent `preview.role.*` namespace).

## 2. Non-Goals

- **No removal of ARVN doctrine.** All existing modules (`arvnPursueProjectedMargin`, `buildPoliticalEngine`, `arvn.harvestPatronage`, `arvn.holdHighPopControl`, `arvn.protectAidEcon`, `arvn.selectiveViolence`, `arvn.denyUSIfNearWin`, `arvn.preCoupRedeployDiscipline`) preserved verbatim. (Note: `arvnPursueProjectedMargin` and `buildPoliticalEngine` are authored without the `arvn.` prefix in the file; this spec preserves the existing identifiers.)
- **No removal of existing ARVN witnesses.** All 10 must continue to pass.
- **No renames for aesthetics.** Selector ids stay; only their *bodies* change.
- **No engine changes.**
- **No new plan templates or strategy modules.**
- **No introduction of Active-vs-Passive Support distinction.** It already ships; §4.6 only adds a Patronage-availability term.
- **No churn on already-good selectors.** Verified item-local-quality selectors (e.g., `arvn.governPatronageSpace`'s Support and population components, `arvn.patrolLocOrCity`) are left untouched.

## 3. Context (verified against codebase, 2026-06-01)

Verified placeholder selectors and their exact lines:

| Line | Selector | Component id | Issue |
|---|---|---|---|
| 569 | `arvn.trainSpaceForControlOrPacification` | `controlOrPacificationOpportunity` | `value: 1` flag |
| 637 | `arvn.sweepToExposeSpace` | `exposeUndergroundThreat` | `value: 1` flag |
| 652 | `arvn.raidRemovalTarget` | `baseOrUndergroundRemoval` | `value: 1` flag |
| 667 | `arvn.transportOrigin` | `overstackedSafeOrigin` | `value: 1` flag |
| 741 | `arvn.pieceRemovalPriority` | `baseAndControlThreat` | `value: 1` flag |

Post-002 reassessment found the same pattern still present in additional selector-library rows outside the five ARVN selectors above. 205FITLARVSEL-007 completed that prerequisite cleanup before the §7 faction-agnostic invariant lands.

**Selector authoring shape (verified)**: every existing selector uses `quality: { components: [{id, value, weight}], order: qualityDesc, result: {...} }` where `value` is a policy expression composed from `boolToNumber`, `coalesce`, `zoneProp: { zone, prop }`, `lookup`, `aggregate`, `ref: <namespace>.<id>`, and comparison/arithmetic operators. The new §4 blocks adopt this shape verbatim; exemplars cited per sub-section.

**Generic action-weight parameters (`92-agents.md:6-59`)**: all eight (`eventWeight:6-11`, `projectedMarginWeight:12-17`, `rallyWeight:24-29`, `taxWeight:30-35`, `governWeight:36-41`, `trainWeight:42-47`, `sweepWeight:48-53`, `assaultWeight:54-59`) are present. They serve only via `considerations` (lines ~3722+), not via strategy module `scoreGroups`. The proposal's recommendation to preserve them as fallback tuning is honored.

**ARVN guardrails (`92-agents.md`)**: six faction guardrails (`arvn.doNotServeUSWin:3409`, `arvn.preserveAidEconFloor:3424`, `arvn.doNotGovernAwaySupportEverywhere:3441`, `arvn.doNotLoseOriginControlByTransport:3456`, `arvn.doNotOvercommitTroopsPreCoupWithoutBase:3469`, `arvn.doNotFightLowYieldHighlands:3486`) plus shared guardrails. The proposal calls out `arvn.avoidGovernWhenSupportLossOutweighsPatronage` and `arvn.avoidResourceBurnWithoutMarginOrControl`; verification finds `doNotGovernAwaySupportEverywhere` covers the first concern and the score-side `arvn.holdHighPopControl` module covers the second. No new guardrails added; existing identifiers preserved (they do not lie about doctrine).

**Existing inline `postState.predicate.condition` shape**: shipped via Spec 196 (outcome: "uses generic `postState.predicate.condition` semantics over authored role bindings and token-count predicates") and authored at `arvn.trainTransport.transportDestination` (`92-agents.md:1990-2019`). This is the template for the §4.5 origin-control constraint. Named predicates (e.g., `predicate: <name>`) are NOT a shipped surface; only inline condition expressions ship.

**Plan template name**: the existing Train+Transport compound template is `arvn.trainTransport:1976`. There is no separate `arvn.transportControl` template; §4.5 amends `arvn.trainTransport`.

## 4. Architecture

All YAML blocks below use the current selector authoring shape (`quality.components`). Names like `zoneProp.pacificationEligible`, `zoneProp.controlSwingPossible`, and similar are *placeholders* for the §11 P0 vocabulary baseline — for each placeholder, P0 determines whether the concrete form is (a) an existing `zoneProp.prop` field, (b) an inline `lookup` against `policyState` markers/control state, (c) an `aggregate` over `tokensInZone`, or (d) a new authored derived metric. Constructs cited per sub-section come from existing authored exemplars in `92-agents.md`.

### 4.1 `arvn.trainSpaceForControlOrPacification` replacement

Cited exemplars: `arvn.patrolLocOrCity:612-636` (`zoneProp` + `boolToNumber.eq.zoneProp` pattern); `arvn.governPatronageSpace:576-588` (`lookup` over `policyState.markers`).

```yaml
arvn.trainSpaceForControlOrPacification:
  scopes: [move]
  source:
    collection: { kind: zones }
  quality:
    components:
      - id: trainPopulation
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: population }
            - 0
        weight: 4
      - id: terrorMarkerPresent
        value:
          # Pattern: lookup over policyState markers (per arvn.governPatronageSpace:580-587).
          # P0: confirm marker path for terror, or rewrite as inline aggregate.
          boolToNumber:
            eq:
              - lookup:
                  surface: policyState
                  collection: zones
                  keyType: ZoneId
                  key: { ref: selector.item.key }
                  path: [markers, terror]
                  onMissing: { kind: constant, value: false }
              - true
        weight: 3
      - id: pacificationEligible
        # P0 placeholder: resolve to one of (a) existing zoneProp.prop, (b) inline
        # lookup over policyState, (c) aggregate over tokens, (d) new derived metric.
        value:
          boolToNumber:
            ref: zoneProp.pacificationEligible
        weight: 3
      - id: cityTrainTarget
        value:
          boolToNumber:
            eq:
              - zoneProp: { zone: { ref: selector.item.key }, prop: category }
              - city
        weight: 2
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

### 4.2 `arvn.sweepToExposeSpace` replacement

Cited exemplar: `arvn.trainTransport.transportDestination.constraints.postState.predicate.condition` (`92-agents.md:2001-2019`) for `aggregate.op:count` over `tokensInZone` with `prop: faction, op: in`. The selector-scope `zoneExpr` resolution is P0 vocabulary baseline.

```yaml
arvn.sweepToExposeSpace:
  scopes: [move]
  source:
    collection: { kind: zones }
  quality:
    components:
      - id: undergroundGuerrillaCount
        # P0: confirm aggregate-query authoring shape in selector scope
        # (existing aggregate exemplar is inside a postState predicate, where
        # `zone: { zoneExpr: { ref: binding, name: <name> } }` is used).
        value:
          coalesce:
            - aggregate:
                op: count
                query:
                  query: tokensInZone
                  zone: { zoneExpr: { ref: selector.item.key } }
                  filter:
                    op: and
                    args:
                      - { prop: faction, op: in, value: ['NVA', 'VC'] }
                      - { prop: underground, op: eq, value: true }
            - 0
        weight: 5
      - id: insurgentBasePresent
        value:
          boolToNumber:
            gt:
              - aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: selector.item.key } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, op: in, value: ['base'] }
              - 0
        weight: 4
      - id: highPopControlSetup
        value: { ref: feature.coinControlPop }
        weight: 1
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

### 4.3 `arvn.raidRemovalTarget` replacement

Current selector scope is `move` over zones (per the authored shape at 92-agents.md:652). Per-token target selection happens at the chooseOne stage downstream; the selector predicts which zone has the highest-value Raid removal.

```yaml
arvn.raidRemovalTarget:
  scopes: [move]
  source:
    collection: { kind: zones }
  quality:
    components:
      - id: removableBasePresent
        value:
          boolToNumber:
            gt:
              - aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: selector.item.key } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, op: in, value: ['base'] }
              - 0
        weight: 6
      - id: undergroundGuerrillaCount
        value:
          coalesce:
            - aggregate:
                op: count
                query:
                  query: tokensInZone
                  zone: { zoneExpr: { ref: selector.item.key } }
                  filter:
                    op: and
                    args:
                      - { prop: faction, op: in, value: ['NVA', 'VC'] }
                      - { prop: underground, op: eq, value: true }
            - 0
        weight: 4
      - id: controlSwing
        value: { ref: feature.projectedSelfMargin }
        weight: 1
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

### 4.4 `arvn.transportOrigin` replacement

Existing `authoredMapSpace` (weight 5) and `preserveOriginControl` (weight 1) components retained verbatim. Only the placeholder `overstackedSafeOrigin` component is replaced.

```yaml
arvn.transportOrigin:
  scopes: [move]
  source:
    collection: { kind: zones }
  quality:
    components:
      - id: authoredMapSpace
        # Preserved verbatim from current 92-agents.md:673-684.
        value:
          boolToNumber:
            not:
              eq:
                - coalesce:
                    - zoneProp: { zone: { ref: selector.item.key }, prop: category }
                    - none
                - none
        weight: 5
      - id: arvnTroopOverstack
        # Replaces the placeholder overstackedSafeOrigin (value: 1, weight: 3).
        value:
          coalesce:
            - aggregate:
                op: count
                query:
                  query: tokensInZone
                  zone: { zoneExpr: { ref: selector.item.key } }
                  filter:
                    op: and
                    args:
                      - { prop: faction, op: eq, value: 'ARVN' }
                      - { prop: type, op: in, value: ['troop'] }
            - 0
        weight: 3
      - id: preserveOriginControl
        # Preserved verbatim from current 92-agents.md:688-691.
        value: { ref: feature.coinControlPop }
        weight: 1
    order: qualityDesc
  result: { maxItems: 32, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

### 4.5 Transport `postState` inline-condition constraint

Add to the existing `arvn.trainTransport.transportOrigin` role (preserving all other fields), modeled byte-for-byte on the existing `transportDestination` constraint at `92-agents.md:1990-2019`. The predicate asserts that, in the post-state, COIN faction token count at the Transport origin is at least the insurgent count there (i.e., origin Control is preserved).

```yaml
arvn.trainTransport:
  # ... existing fields preserved verbatim ...
  roles:
    trainSpace: { selector: arvn.trainSpaceForControlOrPacification, required: true }
    transportOrigin:
      selector: arvn.transportOrigin
      required: true
      constraints:
        - postState:
            step: transport-destination
            role: role.transportOrigin
            maxSteps: 8
            predicate:
              condition:
                bindings:
                  origin: role.transportOrigin
                when:
                  op: '>='
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: origin } }
                        filter:
                          op: and
                          args:
                            - { prop: faction, op: in, value: ['US', 'ARVN'] }
                  right:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: origin } }
                        filter:
                          op: and
                          args:
                            - { prop: faction, op: in, value: ['NVA', 'VC'] }
    transportDestination:
      # ... existing constraints (reachable, distinctOriginDestination, notEqual, postState) preserved verbatim ...
```

This makes the existing guardrail `arvn.doNotLoseOriginControlByTransport` a defense-in-depth backup rather than the sole enforcement; constraint-time filtering removes the candidate before scoring. Bounded computation (Foundation #10) is preserved via `maxSteps: 8`, matching the existing destination constraint.

### 4.6 Govern: add Patronage-availability term

The existing `arvn.governPatronageSpace` already encodes Active-vs-Passive Support via `activeSupportGovern` (weight 20) and `passiveSupportGovern` (weight 10) components at `92-agents.md:576-601`; the doctrine "Active outscores Passive" is already in place. This section adds one missing term: demote Govern when Patronage mode is unavailable (local ARVN cubes do not exceed US cubes).

```yaml
arvn.governPatronageSpace:
  # ... existing fields preserved ...
  quality:
    components:
      # ... existing activeSupportGovern (weight 20), passiveSupportGovern (weight 10), governPopulation (weight 4) preserved verbatim ...
      - id: arvnCubesExceedUsCubes
        value:
          boolToNumber:
            gt:
              - aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: selector.item.key } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: eq, value: 'ARVN' }
                        - { prop: type, op: in, value: ['troop', 'police'] }
              - aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: selector.item.key } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: eq, value: 'US' }
                        - { prop: type, op: in, value: ['troop'] }
        weight: 6
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

### 4.7 `arvn.pieceRemovalPriority` replacement

Selector remains `scope: move` over zones, matching the current authored shape; per-token removal happens downstream at chooseOne.

```yaml
arvn.pieceRemovalPriority:
  scopes: [move]
  source:
    collection: { kind: zones }
  quality:
    components:
      - id: removableBasePresent
        value:
          boolToNumber:
            gt:
              - aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: selector.item.key } }
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, op: in, value: ['base'] }
              - 0
        weight: 5
      - id: controlSwingFromRemoval
        value: { ref: feature.projectedSelfMargin }
        weight: 4
      - id: populationWeight
        value:
          coalesce:
            - zoneProp: { zone: { ref: selector.item.key }, prop: population }
            - 0
        weight: 3
    order: qualityDesc
  result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
```

## 5. Edge cases

- **Placeholder names in §§4.1-4.7**: `zoneProp.pacificationEligible`, `markers.terror` lookup, `tokensInZone` aggregate authoring shape in selector scope, etc., are *placeholder forms* for the §11 P0 vocabulary baseline. P0 resolves each to its concrete authoring form before P1 implementation. The §6 P-acceptance criteria for §§4.1-4.7 are conditional on the vocabulary baseline.
- **Existing ARVN witnesses must continue to pass.** The replacement selectors produce different scores than placeholder-1 selectors, so the canonical seed (ARVN seed 1000) MAY produce a different trajectory. If it does, the witness is *distilled* per the project Testing rule (see `archive/specs/137-convergence-witness-invariant-promotion.md`) rather than re-blessed: the underlying property (e.g., "Transport rejects origin-control loss") is asserted as an architectural invariant over any legitimate trajectory, not the specific seed-1000 trajectory. Note that `arvn-seed-1000-deep-recovery.test.ts` is currently `@test-class: convergence-witness`; promotion under the Spec 137 framework is a P1 decision if trajectory shifts.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector vocabulary baseline | For each placeholder name in §§4.1-4.7 (`zoneProp.pacificationEligible`, the `markers.terror` lookup path, the `tokensInZone` aggregate authoring shape in selector scope, etc.), determine the concrete authoring form: existing `zoneProp.prop` / inline `lookup` / `aggregate` / new derived metric. Open Questions list any reference that needs a new authored metric. Also confirms whether plan-template posture `prefer` terms honor `previewFallback` (informational, for the deferred §10 Sweep+Raid follow-up). | S |
| **P1** | Selector body replacements (§§4.1-4.4, 4.7) | All five ARVN placeholder selectors replaced using current authoring shape with item-local features; existing ARVN witnesses pass (under distillation rule if necessary). | M |
| **P2** | Transport inline `postState.predicate.condition` constraint (§4.5) | Constraint added to `arvn.trainTransport.transportOrigin`; existing `arvn.doNotLoseOriginControlByTransport` witness passes (now via constraint-time filtering); guardrail preserved as defense-in-depth. | S |
| **P3** | Govern Patronage-availability term (§4.6) | New `arvnCubesExceedUsCubes` component added to `arvn.governPatronageSpace`; existing Active/Passive Support components untouched; new witness asserts Patronage-unavailable demotion. | S |
| **P4** | Regression re-attestation | All 10 existing ARVN witnesses pass (under distillation rule); 4-profile convergence canary byte-identical; `pnpm turbo build` byte-identical. | S |

## 7. Test plan

**Existing witnesses preserved (must pass)** — all 10 ARVN witnesses in `packages/engine/test/policy-profile-quality/arvn-*`, with current `@test-class:` markers:
- `arvn-govern-active-support-priority.test.ts` (`convergence-witness`)
- `arvn-patrol-govern-over-train-when-threatened.test.ts` (`convergence-witness`)
- `arvn-precoup-posture-avoids-redeploy-undone.test.ts` (`architectural-invariant`)
- `arvn-seed-1000-deep-recovery.test.ts` (`convergence-witness`)
- `arvn-sweep-raid-expose-before-removal.test.ts` (`architectural-invariant`)
- `arvn-train-govern-fallback.test.ts` (`convergence-witness`)
- `arvn-train-govern-separation.test.ts` (`convergence-witness`)
- `arvn-transport-refuses-origin-control-loss.test.ts` (`architectural-invariant`)
- `arvn-transport-rejected-by-reachable.test.ts` (`convergence-witness`)
- `arvn-us-rival-risk-flip.test.ts` (`convergence-witness`)

If any witness becomes trajectory-sensitive under the new selectors, distill per the project Testing rule (`archive/specs/137-convergence-witness-invariant-promotion.md`).

**New regression witnesses (additions)**:
- `arvn-transport-postState-origin-control-constraint-time.test.ts` — Transport-with-origin-control-loss is filtered at constraint time (before scoring), traceable via Spec 196 constraint trace.
- `arvn-govern-patronage-unavailable-demotes.test.ts` — given two candidate Govern targets identical in Support state and population, the one where ARVN cubes do NOT exceed US cubes scores lower.

**Architectural invariant**:
- `no-placeholder-value-one-selectors.test.ts` — faction-agnostic fixture-driven scan asserts no selector body in any game's `data/games/<game>/*-agents.md` contains a `value: 1` standalone scoring constant (forward-protection invariant against regression, covering ARVN / US / NVA / VC alike).

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only; §7 invariant is faction-agnostic |
| #10 | §4.5 inline `postState.predicate.condition` includes `maxSteps: 8` matching the existing destination-constraint shape; aggregate queries are bounded over the per-zone token list |
| #15 | Closes the ARVN selector-quality gap that ChatGPT-Pro's proposal identified, using only existing engine surfaces (no new constructs proposed) |
| #16 | New regression witnesses guard the strengthened selectors and the postState constraint behavior |

## 9. Reassessment of source proposal

**Adopted:**
- §6.2 Replace placeholder selector components → §§4.1-4.4, 4.7.
- §6.2 Global features used as local target quality → addressed by replacing standalone `value: 1` with item-local `aggregate` / `lookup` / `zoneProp` components; retained `feature.coinControlPop` / `feature.projectedSelfMargin` as low-weight tiebreakers, not as primary scoring.
- §6.2 "Generic action weights … should not be the primary strategic encoding" → preserved as fallback tuning; module `scoreGroups` use explicit `prefer` terms.
- §5 ARVN "Transport rejects origin-control loss" preserved + strengthened via inline `postState.predicate.condition` (§4.5).
- §5 ARVN "Sweep+Raid exposes before removal" preserved via §4.2 (Sweep selector scores by underground guerrilla count + insurgent-base presence) and §4.3 (Raid selector scores by removable-base + underground guerrilla count). Preview-derived posture composition is deferred to §10.

**Adopted with adjustment:**
- §6.2 "Do not churn names for aesthetics" — honored. Selector ids unchanged; only bodies modified.
- §5 ARVN "Govern Active Support to Patronage" — the proposal asks for local enemy/base/underground features on Govern; verification finds the Active-vs-Passive Support distinction already encoded in `activeSupportGovern` / `passiveSupportGovern` at `92-agents.md:576-601`. This spec therefore *extends* Govern with a Patronage-availability term (§4.6) rather than introducing the Active-vs-Passive distinction.
- Proposal calls for `arvn.avoidGovernWhenSupportLossOutweighsPatronage` and `arvn.avoidResourceBurnWithoutMarginOrControl` guardrails. Verification finds existing `doNotGovernAwaySupportEverywhere` (margin-based demotion) and `arvn.holdHighPopControl` (score-side module) cover the doctrine. No new guardrails added; existing ones strengthened where item-local features make the trigger more precise.

**Corrected:**
- The proposal's conditional "Any profile logic that preserves historical ARVN-specific architecture experiments if it no longer improves competence, …" is moot for ARVN: no such experiments exist; ARVN's structure is doctrinally sound (the maturity-gap is selector-quality, not architectural). The spec preserves all ARVN architecture verbatim.

**Deferred:**
- `arvn.trainPacifyCoupPrep` template — uncommitted; the existing `arvn.preCoupRedeployDiscipline` posture covers the discipline concern; explicit Coup-prep template deferred until a witness shows the posture cannot drive selection.
- `arvn.eventPoliticalSwing` template — covered by Spec 201's `shared.eventDirectSwing` consumption in ARVN bindings.
- Sweep+Raid preview-derived posture composition — see §10 entry.

**Rejected:**
- Renaming existing well-named ARVN symbols — preserved verbatim.

## 10. Out of scope (named follow-on / sibling)

- **Specs 201, 202, 203, 204** (sibling, all COMPLETED).
- **Existing non-ARVN selector placeholder cleanup** — live post-002 reassessment found remaining selector-library `value: 1` constants across US/NVA/VC rows plus one zero-weight ARVN destination row. 205FITLARVSEL-007 completed that prerequisite so the §7 invariant can stay strict and faction-agnostic.
- **Sweep+Raid preview-derived posture composition** — the proposal recommended scoring Sweep targets by post-Sweep Raid-availability via a `preview.role.sweepSpace.raidRemovalAvailable` term. The `preview.role.*` namespace does not exist in the current engine (available namespaces: `preview.option.*`, `preview.feature.*`, `preview.var.*`, `preview.victory.*`, `preview.inner.*`, `preview.relationship.*`), and `previewFallback` support in plan-template posture `prefer` terms is unverified. A follow-up spec authoring per-role preview refs (or a per-step preview avenue) would unblock this composition. Until then, §4.2 (Sweep) and §4.3 (Raid) selectors each carry item-local features that approximate the doctrine independently.
- **Compiler-level enforcement of "no `value: 1` standalone constants in selectors"** — uncommitted; the §7 faction-agnostic fixture invariant test covers the spot-check.

## 11. Open questions

- **Zone-prop / lookup / aggregate vocabulary baseline**: for each placeholder name in §§4.1-4.7 (`zoneProp.pacificationEligible`, `markers.terror` lookup path, `tokensInZone` aggregate authoring shape in selector scope, etc.), determine concrete authoring form:
  - (a) existing `zoneProp.prop` field (pattern: `zoneProp: { zone: { ref: selector.item.key }, prop: <name> }`, see `arvn.governPatronageSpace:605-607`)
  - (b) inline `lookup` against `policyState` (pattern: `lookup: { surface: policyState, collection: zones, keyType: ZoneId, key: { ref: selector.item.key }, path: [markers, <name>], onMissing: {kind: constant, value: <default>} }`, see `arvn.governPatronageSpace:580-587`)
  - (c) `aggregate` over `tokensInZone` (pattern in `arvn.trainTransport.transportDestination.constraints.postState.predicate.condition` at 92-agents.md:2001-2019)
  - (d) new authored derived metric (last resort)

  **P0 deliverable.**
- **`aggregate.query` authoring in selector scope**: the existing aggregate-query exemplar lives inside a postState predicate condition where `zone: { zoneExpr: { ref: binding, name: <name> } }` uses a `binding` ref. Selector scope uses `selector.item.key`. P0 confirms whether the `zoneExpr` wrapper is required and what the canonical selector-scope shape is. **P0 deliverable.**
- **`tokenProp` scope clarification**: the rejected `tokenProp.zone.X` notation conflates token and zone scopes. Confirm whether any selector authoring should run `scope: tokens` (vs. the current `scope: move` over zones with per-token resolution downstream). **P0 deliverable.**
- **`previewFallback` support in plan-template posture `prefer` terms**: documented for agent considerations (`packages/engine/src/cnl/lower-agent-considerations.ts:45,71`); unverified for plan-template posture. Informational for the deferred §10 Sweep+Raid composition; not a blocker for §§4.1-4.7. **P0 deliverable** (informational).
- **Distillation vs re-blessing** for ARVN seed-1000 canary if trajectory shifts under new selectors — P1 deliverable. Follow `archive/specs/137-convergence-witness-invariant-promotion.md` distillation rule.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-06-01:

- [`archive/tickets/205FITLARVSEL-001.md`](../archive/tickets/205FITLARVSEL-001.md) — P0 — Selector vocabulary baseline for ARVN cleanup (covers §6 P0 / §11)
- [`archive/tickets/205FITLARVSEL-002.md`](../archive/tickets/205FITLARVSEL-002.md) — P1 — Replace placeholder selector bodies (covers §§4.1–4.4, 4.7)
- [`tickets/205FITLARVSEL-003.md`](../tickets/205FITLARVSEL-003.md) — P2 — Transport postState origin-control constraint (covers §4.5)
- [`archive/tickets/205FITLARVSEL-004.md`](../archive/tickets/205FITLARVSEL-004.md) — P3 — Govern Patronage-availability term (covers §4.6)
- [`archive/tickets/205FITLARVSEL-007.md`](../archive/tickets/205FITLARVSEL-007.md) — Prerequisite cleanup for selector value-one invariant
- [`archive/tickets/205FITLARVSEL-005.md`](../archive/tickets/205FITLARVSEL-005.md) — Faction-agnostic no-placeholder-value-one invariant (covers §7 last bullet)
- [`tickets/205FITLARVSEL-006.md`](../tickets/205FITLARVSEL-006.md) — P4 — Regression re-attestation (covers §6 P4)

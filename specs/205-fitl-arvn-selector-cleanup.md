# Spec 205 — FITL ARVN Selector Cleanup and Placeholder Replacement

**Status**: PROPOSED
**Priority**: Medium — `arvn-baseline` is the most mature faction (21 library components + 10 profile-quality witnesses), but its maturity grew during the architecture-proving period and several selectors still score with placeholder constants (`value: 1`) or rely on global features (`feature.coinControlPop`) as item-local target quality rather than `zoneProp`-derived local features. The proposal correctly identifies this as quality-gap, not absence-of-doctrine — and warns against renaming for aesthetics. The fix is targeted replacement of *only* the items where a real local feature is available.
**Complexity**: S–M — selector body replacements in `data/games/fire-in-the-lake/92-agents.md` plus regression-only witnesses. No engine work. Existing ARVN doctrine, plan templates, modules, posture, guardrails, and witnesses are preserved.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED) — `postState` constraints (Transport origin-control)
- **Soft**: `specs/201-fitl-shared-doctrine-and-lifecycle.md` (PROPOSED) — Spec 205 is *independent* of 201, but the selector-vocabulary baseline 201 P0 surveys is consumed here when relevant.

**Trigger report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration, 2026-05-27).

**Ticket namespace**: `205FITLARVSEL`

---

## 1. Goal

Replace placeholder-constant selector components (`value: 1`) and global-feature-as-zone-score patterns with item-local `zoneProp`-derived features, where a real local feature is available. Strengthen Transport/Govern/Sweep+Raid selectors with item-local features. Preserve all existing ARVN doctrine, plan templates, modules, posture, guardrails, and witnesses verbatim. Concretely:

1. **Replace placeholder selectors** (verified line refs from `92-agents.md`):
   - `arvn.trainSpaceForControlOrPacification:352` — `controlOrPacificationOpportunity` with `value: 1` → item-local population, support-shift, and Pacification-eligibility features.
   - `arvn.sweepToExposeSpace:427` — `exposeUndergroundThreat` with `value: 1` → underground-guerrilla count, Base-defended-flag, control-swing-possible.
   - `arvn.raidRemovalTarget:442` — `baseOrUndergroundRemoval` with `value: 1` → base-tunnel-flag, underground-guerrilla-count, control-swing.
   - `arvn.transportOrigin:469` — `overstackedSafeOrigin` with `value: 1` → cube-overstack, control-criticality, base-presence.
   - `arvn.pieceRemovalPriority:530` — `baseAndControlThreat` with `value: 1` → base-flag, control-priority, terrain-defense.

2. **Strengthen Transport with `postState` origin-control guard**:
   - Add `kind: postState, predicate: coinControlPreservedAtOrigin` to the `arvn.transportControl` (or current equivalent) plan template so Transport that would lose origin-Control is filtered at constraint time, not posture time. This preserves the existing `arvn.doNotLoseOriginControlByTransport` guardrail as a belt-and-suspenders.

3. **Strengthen Govern selector** (`arvn.governPatronageSpace` or current equivalent) with item-local active-vs-passive Support distinction:
   - Score Active Support targets higher than Passive Support targets (per competence report §2 ARVN: "Govern Active Support to Patronage… leaves the space Supported").
   - Demote Govern when local ARVN cubes do not exceed US cubes (Patronage mode unavailable).

4. **Strengthen Sweep+Raid selector quality**:
   - Combine `arvn.sweepToExposeSpace` and `arvn.raidRemovalTarget` so the Sweep target predicts which Raid removal becomes available post-Sweep (preview-derived), with explicit `previewFallback`.

5. **Replace generic-weight reliance as primary strategic scoring**:
   - `rallyWeight`, `taxWeight`, `governWeight`, `trainWeight`, `sweepWeight`, `assaultWeight` parameters remain as fallback tuning knobs (per the proposal — "acceptable as fallback tuning knobs, but they should not be the primary strategic encoding"). ARVN module `scoreGroups` use explicit `prefer` terms over item-local features; only the `considerations` section retains the binary-tag weight pattern.

## 2. Non-Goals

- **No removal of ARVN doctrine.** All existing modules (`arvnPursueProjectedMargin`, `harvestPatronage`, `holdHighPopControl`, `protectAidEcon`, `selectiveViolence`, `denyUSIfNearWin`, `preCoupRedeployDiscipline`, `buildPoliticalEngine`) preserved.
- **No removal of existing ARVN witnesses.** All 10 must continue to pass.
- **No renames for aesthetics.** Selector ids stay; only their *bodies* change.
- **No engine changes.**
- **No new plan templates or strategy modules.**
- **No churn on already-good selectors.** Verified item-local-quality selectors (e.g., `arvn.governPatronageSpace` with population scoring) are left untouched.

## 3. Context (verified against codebase, 2026-05-27)

Verified placeholder selectors and their exact lines:

| Line | Selector | Component id | Issue |
|---|---|---|---|
| 352 | `arvn.trainSpaceForControlOrPacification` | `controlOrPacificationOpportunity` | `value: 1` flag |
| 427 | `arvn.sweepToExposeSpace` | `exposeUndergroundThreat` | `value: 1` flag |
| 442 | `arvn.raidRemovalTarget` | `baseOrUndergroundRemoval` | `value: 1` flag |
| 469 | `arvn.transportOrigin` | `overstackedSafeOrigin` | `value: 1` flag |
| 530 | `arvn.pieceRemovalPriority` | `baseAndControlThreat` | `value: 1` flag |
| 636 | `us.adviseTargetSpace` | `indigenousForceMultiplier` | `value: 1` flag (covered by Spec 202; this spec only addresses ARVN, but the pattern is the same; coordination noted in §11) |

Generic action-weight parameters (`92-agents.md:24-59`): all six (`rallyWeight`, `taxWeight`, `governWeight`, `trainWeight`, `sweepWeight`, `assaultWeight`) plus `eventWeight` and `projectedMarginWeight` are present. They serve only via `considerations` (lines ~2091-2205), not via strategy module `scoreGroups`. The proposal's recommendation to preserve them as fallback tuning is honored.

ARVN guardrails (`92-agents.md`): seven faction guardrails (`doNotServeUSWin`, `preserveAidEconFloor`, `doNotGovernAwaySupportEverywhere`, `doNotLoseOriginControlByTransport`, `doNotOvercommitTroopsPreCoupWithoutBase`, `doNotFightLowYieldHighlands`) plus shared. The proposal calls out `arvn.avoidGovernWhenSupportLossOutweighsPatronage` and `arvn.avoidResourceBurnWithoutMarginOrControl`; verification finds `doNotGovernAwaySupportEverywhere` covers the first concern and the score-side `arvn.holdHighPopControl` module covers the second. No new guardrails needed; the existing ones are renamed only if their current names lie about doctrine (verification: they do not).

## 4. Architecture

### 4.1 `arvn.trainSpaceForControlOrPacification` replacement

```yaml
arvn.trainSpaceForControlOrPacification:
  scope: zones
  filters:
    - { ref: zoneProp.coinControl }
    - or:
        - gt:
            - { ref: zoneProp.population }
            - 0
        - { ref: zoneProp.isCity }
  score:
    add:
      - mul:
          - { weight: 4 }
          - { ref: zoneProp.population }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.hasTerrorMarker }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.pacificationEligible }
      - mul:
          - { weight: 2 }
          - boolToNumber: { ref: zoneProp.troopPolicePairMissing }
```

### 4.2 `arvn.sweepToExposeSpace` replacement

```yaml
arvn.sweepToExposeSpace:
  scope: zones
  filters:
    - { ref: zoneProp.hasUndergroundEnemy }
  score:
    add:
      - mul:
          - { weight: 5 }
          - { ref: zoneProp.undergroundGuerrillaCount }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: zoneProp.hasInsurgentBase }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.controlSwingPossible }
```

### 4.3 `arvn.raidRemovalTarget` replacement

```yaml
arvn.raidRemovalTarget:
  scope: tokens
  filters:
    - or:
        - and:
            - { ref: tokenProp.type.base }
            - not: { ref: tokenProp.zone.baseIsTunneled }
        - { ref: tokenProp.underground }
  score:
    add:
      - mul:
          - { weight: 6 }
          - boolToNumber: { ref: tokenProp.type.base }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: tokenProp.zone.controlSwingFromRemoval }
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: tokenProp.zone.hasSupport }
```

### 4.4 `arvn.transportOrigin` replacement

```yaml
arvn.transportOrigin:
  scope: zones
  filters:
    - { ref: zoneProp.hasArvnTroops }
    - gt:
        - { ref: zoneProp.arvnTroopCount }
        - 2
  score:
    sub:
      - mul:
          - { weight: 5 }
          - { ref: zoneProp.arvnTroopCount }
      - mul:
          - { weight: 6 }
          - boolToNumber: { ref: zoneProp.arvnControlCritical }
```

### 4.5 Transport `postState` constraint

Add to the existing `arvn.transportControl` plan template (preserving all other fields):

```yaml
arvn.transportControl:
  # ... existing fields preserved verbatim ...
  roles:
    transportOrigin:
      selector: arvn.transportOrigin
      constraints:
        - kind: postState
          predicate: coinControlPreservedAtOrigin
    transportDestination:
      # ... existing constraints (reachable, distinctOriginDestination) preserved ...
```

This makes the existing guardrail `arvn.doNotLoseOriginControlByTransport` a defense-in-depth backup rather than the sole enforcement; constraint-time filtering removes the candidate before scoring.

### 4.6 Govern Active-vs-Passive distinction

Add a `governActiveSupportPreference` term to `arvn.governPatronageSpace`:

```yaml
arvn.governPatronageSpace:
  # ... existing fields preserved ...
  score:
    add:
      # ... existing terms preserved ...
      - mul:
          - { weight: 3 }
          - boolToNumber: { ref: zoneProp.hasActiveSupport }
      - mul:
          - { weight: -2 }
          - boolToNumber: { ref: zoneProp.hasPassiveSupportOnly }
      - mul:
          - { weight: 2 }
          - boolToNumber: { ref: zoneProp.arvnCubesExceedUsCubes }
```

### 4.7 `arvn.pieceRemovalPriority` replacement

```yaml
arvn.pieceRemovalPriority:
  scope: tokens
  filters:
    - or:
        - { ref: tokenProp.type.base }
        - { ref: tokenProp.zone.controlSwingFromRemoval }
  score:
    add:
      - mul:
          - { weight: 5 }
          - boolToNumber: { ref: tokenProp.type.base }
      - mul:
          - { weight: 4 }
          - boolToNumber: { ref: tokenProp.zone.controlSwingFromRemoval }
      - mul:
          - { weight: 3 }
          - { ref: tokenProp.zone.population }
```

### 4.8 Sweep+Raid composition

Strengthen the existing `arvn.sweepRaid` plan template's `sweepSpace` role with a posture term that prefers Sweep targets where a Raid removal becomes available post-Sweep (preview-derived):

```yaml
arvn.sweepRaid:
  # ... existing fields preserved ...
  posture:
    # ... existing posture preserved ...
    prefer:
      - weight: 3
        value:
          coalesce:
            - { ref: preview.role.sweepSpace.raidRemovalAvailable }
            - 0
        previewFallback:
          onUnavailable: noContribution
```

If `preview.role.sweepSpace.raidRemovalAvailable` is not a current ref surface, the P0 deliverable records it as an Open Question and the term degrades to current-state-only inspection.

## 5. Edge cases

- **`zoneProp.*` references missing**: P0 deliverable surveys what zone props exist; missing ones either (a) fold into Spec 201's vocabulary survey if shared with other factions, or (b) get authored as derived metrics in the relevant `data/games/fire-in-the-lake/` file. The spec's P-acceptance criteria for §§4.1-4.7 are conditional on the vocabulary baseline.
- **`tokenProp.zone.controlSwingFromRemoval`** preview-derived ref may not exist — falls back to current-state heuristic plus posture filtering.
- **Existing ARVN witnesses must pass byte-identically replay-wise**. The replacement selectors produce different scores than placeholder-1 selectors, so the canonical seed (ARVN seed 1000) MAY produce a different trajectory. If it does, the witness is *distilled* per the Testing §Distillation rule rather than re-blessed: the underlying property (e.g., "Transport rejects origin-control loss") is asserted as an architectural invariant over any legitimate trajectory, not the specific seed-1000 trajectory.

## 6. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P0** | Selector vocabulary inventory (zone props, token props, preview refs) | Inventory committed; Open Questions list any reference the §§4.1-4.7 replacements need that does not yet exist | S |
| **P1** | Selector body replacements (§§4.1-4.4, 4.7) | All ARVN selectors replaced with item-local features; existing ARVN witnesses pass (under distillation rule if necessary) | M |
| **P2** | Transport `postState` constraint (§4.5) | Constraint added; existing `arvn.doNotLoseOriginControlByTransport` witness passes (now via constraint-time filtering); guardrail preserved | S |
| **P3** | Govern + Sweep+Raid strengthening (§§4.6, 4.8) | Strengthened selectors compile; Govern Active-Support witness asserts new scoring; Sweep+Raid composition witness asserts post-Sweep Raid-availability preview gate | S |
| **P4** | Regression re-attestation | All 10 existing ARVN witnesses pass (under distillation rule); 4-profile convergence canary byte-identical; `pnpm turbo build` byte-identical | S |

## 7. Test plan

**Existing witnesses preserved (must pass)** — all 10 ARVN witnesses in `packages/engine/test/policy-profile-quality/arvn-*`:
- `arvn-govern-active-support-priority.test.ts`
- `arvn-patrol-govern-over-train-when-threatened.test.ts`
- `arvn-precoup-posture-avoids-redeploy-undone.test.ts`
- `arvn-seed-1000-deep-recovery.test.ts`
- `arvn-sweep-raid-expose-before-removal.test.ts`
- `arvn-train-govern-fallback.test.ts`
- `arvn-train-govern-separation.test.ts`
- `arvn-transport-refuses-origin-control-loss.test.ts`
- `arvn-transport-rejected-by-reachable.test.ts`
- `arvn-us-rival-risk-flip.test.ts`

If any witness becomes trajectory-sensitive under the new selectors, distill per the project Testing rule (e.g., `arvn-seed-1000-deep-recovery` is already an architectural invariant per the Spec 137 canary precedent; re-affirm property-form assertions).

**New regression witnesses (additions)**:
- `arvn-transport-postState-origin-control-constraint-time.test.ts` — Transport-with-origin-control-loss is filtered at constraint time (before scoring), traceable via Spec 196 constraint trace.
- `arvn-govern-active-support-scores-higher-than-passive.test.ts` — given two candidate Govern targets identical in population, Active Support outscores Passive Support.
- `arvn-sweep-raid-post-sweep-raid-available.test.ts` — Sweep target whose post-state would have a Raid-removable Base scores higher than one without.

**Architectural invariants**:
- `no-arvn-placeholder-value-one-selectors.test.ts` — fixture-driven scan asserts no ARVN selector body contains `value: 1` as a standalone scoring constant (this is a forward-protection invariant against regression).

## 8. Foundation alignment

| Foundation | How |
|---|---|
| #1 | YAML-only |
| #15 | Closes the ARVN selector-quality gap that ChatGPT-Pro's proposal identified |
| #16 | New regression witnesses guard the strengthened selectors |
| #20 | Sweep+Raid composition's preview-derived term declares explicit `previewFallback` |

## 9. Reassessment of source proposal

**Adopted:**
- §6.2 Replace placeholder selector components → §§4.1-4.4, 4.7.
- §6.2 Global features used as local target quality → addressed by replacing `feature.coinControlPop` references with `zoneProp.coinControl` + `zoneProp.population`.
- §6.2 "Generic action weights … should not be the primary strategic encoding" → preserved as fallback tuning; module scoreGroups use explicit prefer terms.
- §5 ARVN "Transport rejects origin-control loss" preserved + strengthened via `postState` constraint (§4.5).
- §5 ARVN "Govern Active Support outscores Passive Support" → §4.6.
- §5 ARVN "Sweep+Raid exposes before removal" preserved + strengthened via preview-derived availability (§4.8).

**Adopted with adjustment:**
- §6.2 "Do not churn names for aesthetics" — honored. Selector ids unchanged; only bodies modified.
- Proposal calls for `arvn.avoidGovernWhenSupportLossOutweighsPatronage` and `arvn.avoidResourceBurnWithoutMarginOrControl` guardrails. Verification finds existing `doNotGovernAwaySupportEverywhere` and `arvn.holdHighPopControl` module cover the doctrine. No new guardrails added; existing ones strengthened where item-local features make the trigger more precise.

**Corrected:**
- The proposal's "Existing ARVN-specific architecture experiments" → no such experiments exist; ARVN's structure is doctrinally sound (the maturity-gap is selector-quality, not architectural). The spec preserves all ARVN architecture verbatim.

**Deferred:**
- `arvn.trainPacifyCoupPrep` template — uncommitted; the existing `arvn.preCoupRedeployDiscipline` posture covers the discipline concern; explicit Coup-prep template deferred until a witness shows the posture cannot drive selection.
- `arvn.eventPoliticalSwing` template — covered by Spec 201's `shared.eventDirectSwing` consumption in ARVN bindings.

**Rejected:**
- Renaming existing well-named ARVN symbols — preserved verbatim.

## 10. Out of scope (named follow-on / sibling)

- **Specs 201, 202, 203, 204** (sibling).
- US-side placeholder cleanup (`us.adviseTargetSpace:636`) — owned by Spec 202 (the same pattern is applied to new US selectors there).
- Compiler-level enforcement of "no `value: 1` standalone constants in selectors" — uncommitted; the §7 fixture invariant test covers the spot-check.

## 11. Open questions

- **Zone-prop vocabulary baseline**: which of `zoneProp.pacificationEligible`, `zoneProp.troopPolicePairMissing`, `zoneProp.controlSwingPossible`, `zoneProp.hasInsurgentBase`, `zoneProp.hasUndergroundEnemy`, `zoneProp.undergroundGuerrillaCount`, `zoneProp.arvnTroopCount`, `zoneProp.arvnControlCritical`, `zoneProp.hasActiveSupport`, `zoneProp.hasPassiveSupportOnly`, `zoneProp.arvnCubesExceedUsCubes` exist today? P0 deliverable.
- **Preview ref availability**: does `preview.role.sweepSpace.raidRemovalAvailable` (or analogous post-Sweep Raid-availability preview) materialize via the current preview engine? P0 deliverable.
- **Distillation vs re-blessing** for ARVN seed-1000 canary if trajectory shifts under new selectors — P1 deliverable.

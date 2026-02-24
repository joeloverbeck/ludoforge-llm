# Spec 46: FITL Section 4 Rules Gaps

**Status**: Not started
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 26 (operations), Spec 27 (SAs)
**Estimated effort**: 3-4 days
**Source sections**: Rules Section 4 gap analysis (`reports/fire-in-the-lake-rules-section-4.md`)

## Overview

Gap analysis of FITL Rules Section 4 (Special Activities) against the current game data (`data/games/fire-in-the-lake/`) identified 5 confirmed gaps and 1 minor edge case across 4 Special Activity profiles: Transport, Air Lift, Bombard, Subvert, and Tax. All 12 SAs were individually compared; 7 are fully correct (Advise, Air Strike, Govern, Raid, Infiltrate, NVA Ambush, VC Ambush).

All changes are **data-only YAML** in GameSpecDoc files under `data/games/fire-in-the-lake/`. No engine or kernel code changes.

## Gap Analysis Summary

| # | Gap | Rule | Status | Action |
|---|-----|------|--------|--------|
| 1 | Transport excludes Rangers from non-shaded movement | 4.3.2 | Missing | FITLSEC4RULGAP-001 |
| 2 | Ranger flip conditional on capability + scoped to destination only | 4.3.2 | Missing | FITLSEC4RULGAP-002 |
| 3 | Subvert erroneously activates a VC guerrilla | 4.5.2 | Wrong | FITLSEC4RULGAP-003 |
| 4 | Air Lift forces single destination instead of multi-destination redistribution | 4.2.2 | Missing | FITLSEC4RULGAP-004 |
| 5 | Bombard uses fixed priority removal instead of NVA player choice | 4.4.2 | Missing | FITLSEC4RULGAP-005 |
| 6 | Tax support shift conditioned on pop > 0 | 4.5.1 | Wrong | FITLSEC4RULGAP-006 |

## Scope

### In Scope

- Transport ranger movement filter correction (non-shaded branch)
- Transport ranger flip unconditional + map-wide scope
- Subvert guerrilla activation removal
- Air Lift multi-destination restructuring
- Bombard player-choice removal
- Tax pop-0 support shift fix

### Out of Scope

- Kernel source code changes (all DSL primitives already exist)
- Compiler source code changes
- Capability/momentum interactions beyond what is directly affected
- Profiles already verified correct (Advise, Air Strike, Govern, Raid, Infiltrate, NVA Ambush, VC Ambush)

---

## FITLSEC4RULGAP-001: Transport Ranger Movement

**Priority**: P1
**Estimated effort**: Small (30 min)
**Rule reference**: 4.3.2
**Depends on**: None

### Summary

Rule 4.3.2: "Select 1 space and move up to 6 ARVN Troops and/or Rangers from there onto 1 or more adjacent LoCs..."

Currently, in the `transport-profile` `move-selected-pieces` stage, the non-shaded branch (line 4087-4104 in `30-rules-actions.md`) filters pieces with `{ prop: type, eq: troops }` — this excludes Rangers (guerrilla type). The rules say "ARVN Troops and/or Rangers", so both types must be movable.

### Current Behavior

```yaml
# transport-profile, move-selected-pieces stage, non-shaded branch (line 4087-4095)
else:
  - forEach:
      bind: $piece
      over:
        query: tokensInZone
        zone: $transportOrigin
        filter:
          - { prop: faction, eq: ARVN }
          - { prop: type, eq: troops }
        limit: 6
```

Only ARVN Troops are selected. Rangers (faction: ARVN, type: guerrilla) are excluded.

### Required Behavior

The filter should match both `troops` and `guerrilla` types so that Rangers are included alongside Troops.

### Implementation

Change the filter in the non-shaded branch (line 4095) from:

```yaml
- { prop: type, eq: troops }
```

to:

```yaml
- { prop: type, op: in, value: [troops, guerrilla] }
```

This matches the shaded (`cap_armoredCavalry`) branch which already uses `{ prop: type, op: in, value: [troops, guerrilla] }`.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `transport-profile`, `move-selected-pieces` stage, non-shaded branch (line ~4095)

### Acceptance Criteria

1. In the non-shaded Transport path, ARVN Rangers (guerrilla type) appear as selectable pieces alongside Troops
2. The shaded (`cap_armoredCavalry`) branch remains unchanged (already correct)
3. Limit of 6 pieces still applies to the combined Troops + Rangers selection
4. No kernel source files modified
5. Build passes (`pnpm turbo build`)
6. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC4RULGAP-002: Transport Ranger Flip Scope

**Priority**: P1
**Estimated effort**: Small (1 hour)
**Rule reference**: 4.3.2
**Depends on**: FITLSEC4RULGAP-001

### Summary

Rule 4.3.2: "Then flip all Rangers anywhere on the map to Underground."

Currently, the `transport-profile` `flip-rangers-underground` stage (lines 4105-4119 in `30-rules-actions.md`) has two issues:

1. **Conditional on capability**: The flip is wrapped in `if: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }`. Per the rules, flipping Rangers underground is always part of Transport, regardless of the Armored Cavalry capability state.
2. **Scoped to destination only**: The query targets `zone: $transportDestination` — only Rangers at the destination are flipped. The rules say "anywhere on the map", meaning ALL ARVN Rangers everywhere should be flipped Underground.

### Current Behavior

```yaml
# transport-profile, flip-rangers-underground stage (lines 4105-4119)
- stage: flip-rangers-underground
  effects:
    - if:
        when: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }
        then:
          - forEach:
              bind: $ranger
              over:
                query: tokensInZone
                zone: $transportDestination
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: guerrilla }
              effects:
                - setTokenProp: { token: $ranger, prop: activity, value: underground }
```

Only flips Rangers at the destination, and only when `cap_armoredCavalry` is shaded.

### Required Behavior

Unconditionally flip ALL ARVN Rangers on the entire map to Underground after Transport movement completes.

### Implementation

1. Remove the `if` wrapper entirely (make the flip unconditional)
2. Change the query from `tokensInZone` (single zone) to `tokensInZones` querying all map spaces, or use a `forEach` over `mapSpaces` with a nested `tokensInZone` query

**Sketch**:

```yaml
- stage: flip-rangers-underground
  effects:
    - forEach:
        bind: $space
        over: { query: mapSpaces }
        effects:
          - forEach:
              bind: $ranger
              over:
                query: tokensInZone
                zone: $space
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: guerrilla }
              effects:
                - setTokenProp: { token: $ranger, prop: activity, value: underground }
```

Alternatively, if the kernel supports a global token query (e.g., `allTokens` with filter), that would be simpler. The implementer should verify available query types.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `transport-profile`, `flip-rangers-underground` stage (lines ~4105-4119)

### Acceptance Criteria

1. After Transport, ALL ARVN Rangers on the map are Underground — not just those at the destination
2. The flip happens unconditionally, regardless of `cap_armoredCavalry` state
3. Rangers that were already Underground remain Underground (no-op, no error)
4. The `cap-armored-cavalry-unshaded-assault` stage (line 4120+) still functions correctly after the flip
5. No kernel source files modified
6. Build passes (`pnpm turbo build`)
7. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC4RULGAP-003: Subvert Erroneous Activation

**Priority**: P2
**Estimated effort**: Small (30 min)
**Rule reference**: 4.5.2
**Depends on**: None

### Summary

Rule 4.5.2: "In each space, remove any 2 ARVN cubes or replace 1 there with a VC Guerrilla. Then drop Patronage..."

Currently, the `subvert-profile` `resolve-per-space` stage (lines 4745-4756 in `30-rules-actions.md`) activates 1 Underground VC Guerrilla as the first step of resolution. The rules do NOT require guerrilla activation for Subvert — the VC guerrillas performing Subvert should remain Underground. Subvert's legality requires Underground VC guerrillas to be present, but it does not consume or activate them.

### Current Behavior

```yaml
# subvert-profile, resolve-per-space (lines 4745-4756)
- forEach:
    bind: $subvertingGuerrilla
    over:
      query: tokensInZone
      zone: $space
      filter:
        - { prop: faction, eq: VC }
        - { prop: type, eq: guerrilla }
        - { prop: activity, eq: underground }
    limit: 1
    effects:
      - setTokenProp: { token: $subvertingGuerrilla, prop: activity, value: active }
```

This erroneously activates 1 Underground VC Guerrilla per space during Subvert resolution.

### Required Behavior

Remove the guerrilla activation block entirely. Subvert should proceed directly to ARVN cube removal/replacement and Patronage reduction without activating any VC guerrillas.

### Implementation

Delete the entire `forEach` block at lines 4745-4756. The subsequent logic (ARVN cube counting, removal/replacement choice, Patronage reduction) begins at line 4757 and is correct.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Remove guerrilla activation block from `subvert-profile`, `resolve-per-space` stage (lines ~4745-4756)

### Acceptance Criteria

1. After Subvert resolution, all Underground VC Guerrillas in the space remain Underground
2. ARVN cube removal/replacement logic is unchanged
3. Patronage reduction logic is unchanged
4. Subvert legality (requires Underground VC Guerrilla) is unchanged
5. No kernel source files modified
6. Build passes (`pnpm turbo build`)
7. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC4RULGAP-004: Air Lift Multi-Destination

**Priority**: P2
**Estimated effort**: Large (4-6 hours)
**Rule reference**: 4.2.2
**Depends on**: None

### Summary

Rule 4.2.2: "Move any US Troops and up to 4 ARVN Troops, Rangers, or Irregulars among any 4 spaces (2 spaces during Monsoon, 2.3.9; not North Vietnam, 1.4.2)."

Currently, the `air-lift-profile` (lines 3319-3486 in `30-rules-actions.md`) selects up to 4 spaces (line 3342), then forces ALL piece movement to a single destination via `chooseOne` (line 3345-3347). The rules say "among any 4 spaces" — pieces can be redistributed across multiple origin/destination pairs within the selected spaces. Any of the 4 spaces can serve as both origin and destination.

This is the most complex gap because it requires restructuring the profile's movement logic.

### Current Behavior

```yaml
# air-lift-profile (lines 3331-3347)
- stage: select-spaces
  effects:
    - chooseN:
        bind: spaces
        options:
          query: mapSpaces
          filter:
            op: '!='
            left: { ref: zoneProp, zone: $zone, prop: country }
            right: northVietnam
        min: 1
        max: 4
- stage: select-destination
  effects:
    - chooseOne:
        bind: $airLiftDestination
        options: { query: binding, name: spaces }
```

All US Troops from all selected spaces are moved to `$airLiftDestination` (lines 3348-3369). Then up to 4 ARVN pieces are moved to the same single destination (lines 3370-3478).

### Required Behavior

After selecting up to 4 spaces, the player should be able to:
1. Move **any** US Troops from any selected space to **any other** selected space (no limit on US Troops)
2. Move up to 4 total ARVN Troops/Rangers/Irregulars from any selected space to **any other** selected space
3. Each piece's destination can be different — not forced to a single destination

### Implementation

This requires restructuring the movement stages. One approach:

1. **Select spaces** (unchanged): `chooseN` up to 4 spaces (2 during Monsoon)
2. **Move US Troops**: For each selected space, for each US Troop in that space, offer a `chooseOne` destination from the remaining selected spaces (or stay). Alternatively, use a per-piece destination selection approach.
3. **Move ARVN pieces**: Select up to 4 ARVN pieces across all selected spaces, then for each selected piece, `chooseOne` destination from the selected spaces.

**Sketch for ARVN movement**:

```yaml
- stage: move-arvn-pieces
  effects:
    # Gather all eligible ARVN pieces across selected spaces
    - chooseN:
        bind: $liftPieces
        options:
          # ARVN Troops, Rangers, Irregulars across all selected spaces
          query: tokensInZones
          zones: { query: binding, name: spaces }
          filter:
            - { prop: faction, eq: ARVN }
            - { prop: type, op: in, value: [troops, guerrilla] }
        min: 0
        max: 4
    - forEach:
        bind: $piece
        over: { query: binding, name: $liftPieces }
        effects:
          - chooseOne:
              bind: $pieceDestination
              options: { query: binding, name: spaces }
          - if:
              when: { op: '!=', left: { ref: tokenZone, token: $piece }, right: { ref: binding, name: $pieceDestination } }
              then:
                - moveToken:
                    token: $piece
                    from: { zoneExpr: { ref: tokenZone, token: $piece } }
                    to: { zoneExpr: { ref: binding, name: $pieceDestination } }
```

**Note**: The exact structure depends on whether the kernel supports `tokensInZones` (plural) or requires a `forEach` over spaces with nested `tokensInZone` queries. US Troops are unlimited and should use a similar per-piece destination pattern. The Monsoon 2-space limit is already handled by the space selection `chooseN.max`. The implementer must also handle US Irregulars (line 3428-3478), which are currently moved with a separate counter — this should be folded into the ARVN 4-piece budget since Irregulars are US faction, not ARVN.

**Clarification**: Re-reading rule 4.2.2 carefully — "Move any US Troops and up to 4 ARVN Troops, Rangers, or Irregulars among any 4 spaces." Irregulars are US faction but count against the ARVN 4-piece limit per the rule text grouping. The implementer should verify whether Irregulars fall under the US unlimited bucket or the ARVN 4-piece cap.

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Restructure `air-lift-profile` stages (lines ~3319-3486)

### Acceptance Criteria

1. Player can select up to 4 spaces (2 during Monsoon) as origin/destination pool
2. Any US Troops in selected spaces can be moved to any other selected space (unlimited)
3. Up to 4 ARVN Troops/Rangers/Irregulars total can be moved among the selected spaces
4. Each piece can be sent to a different destination within the selected spaces
5. North Vietnam exclusion still enforced
6. Monsoon 2-space limit still enforced
7. No kernel source files modified
8. Build passes (`pnpm turbo build`)
9. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC4RULGAP-005: Bombard Player Choice

**Priority**: P2
**Estimated effort**: Medium (2-3 hours)
**Rule reference**: 4.4.2
**Depends on**: None

### Summary

Rule 4.4.2: "Remove 1 US or ARVN Troop cube from each selected location, if US, to the Casualties box."

The rule says "NVA removes" — this means the NVA player chooses which COIN Troop to remove (US Troop vs ARVN Troop). Currently, the `bombard-profile` `resolve-per-space` stage (lines 4555-4581 in `30-rules-actions.md`) uses `removeByPriority` with a fixed US-first removal order. This denies the NVA player agency over which piece to remove.

### Current Behavior

```yaml
# bombard-profile, resolve-per-space (lines 4561-4581)
- removeByPriority:
    budget: 1
    groups:
      - bind: $usTroop
        over:
          query: tokensInZone
          zone: $space
          filter:
            - { prop: faction, eq: US }
            - { prop: type, eq: troops }
        to:
          zoneExpr: 'casualties-US:none'
      - bind: $arvnTroop
        over:
          query: tokensInZone
          zone: $space
          filter:
            - { prop: faction, eq: ARVN }
            - { prop: type, eq: troops }
        to:
          zoneExpr: 'available-ARVN:none'
```

Removes US Troops first (priority group 1), then ARVN Troops (priority group 2). The NVA player has no choice.

### Required Behavior

The NVA player should choose which 1 COIN Troop cube to remove from each space. US Troops go to the Casualties box; ARVN Troops go to Available.

### Implementation

Replace `removeByPriority` with a `chooseOne` that lets the NVA player select any COIN Troop (US or ARVN) in the space, then move the selected piece to the appropriate destination based on its faction.

**Sketch**:

```yaml
- stage: resolve-per-space
  effects:
    - forEach:
        bind: $space
        over: { query: binding, name: targetSpaces }
        effects:
          - chooseOne:
              bind: $targetTroop
              options:
                query: tokensInZone
                zone: $space
                filter:
                  - { prop: type, eq: troops }
                  - { prop: faction, op: in, value: [US, ARVN] }
          - if:
              when: { op: '==', left: { ref: tokenProp, token: $targetTroop, prop: faction }, right: US }
              then:
                - moveToken:
                    token: $targetTroop
                    from: { zoneExpr: { ref: tokenZone, token: $targetTroop } }
                    to: { zoneExpr: 'casualties-US:none' }
              else:
                - moveToken:
                    token: $targetTroop
                    from: { zoneExpr: { ref: tokenZone, token: $targetTroop } }
                    to: { zoneExpr: 'available-ARVN:none' }
```

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `bombard-profile`, `resolve-per-space` stage (lines ~4555-4581)

### Acceptance Criteria

1. NVA player is presented with a choice of which COIN Troop to remove in each Bombard space
2. US Troops selected for removal go to the Casualties box
3. ARVN Troops selected for removal go to the Available box
4. Budget of 1 removal per space is maintained
5. Space eligibility (3+ COIN Troops or US/ARVN Base, adjacent 3+ NVA Troops) is unchanged
6. Capability interactions (`cap_longRangeGuns`) are unchanged
7. No kernel source files modified
8. Build passes (`pnpm turbo build`)
9. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## FITLSEC4RULGAP-006: Tax Pop-0 Support Shift

**Priority**: P3 (minor)
**Estimated effort**: Small (15 min)
**Rule reference**: 4.5.1
**Depends on**: None

### Summary

Rule 4.5.1: "If a Province or City, shift it 1 level toward Active Support."

Currently, the `tax-profile` `resolve-per-space` stage (lines 4691-4698 in `30-rules-actions.md`) conditions the support-to-ActiveSupport shift on `pop > 0`. The rules say "If a Province or City" without any population threshold. A Province at Population 0 with Passive Support (or Neutral/Opposition) should still shift 1 level toward Active Support during Tax.

### Current Behavior

```yaml
# tax-profile, resolve-per-space, support shift (lines 4691-4698)
- if:
    when:
      op: and
      args:
        - { op: '>', left: { ref: zoneProp, zone: $space, prop: population }, right: 0 }
        - { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
    then:
      - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
```

The `pop > 0` condition prevents the support shift in Population 0 Provinces/Cities.

### Required Behavior

Remove the `pop > 0` condition. The shift should occur in any Province or City (non-LoC) regardless of population, as long as the space is not already at Active Support.

### Implementation

Simplify the condition from the `and` with two args to just the `activeSupport` check:

```yaml
- if:
    when: { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
    then:
      - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
```

The LoC check is already handled by the outer `if` at line 4676 — the `else` branch (lines 4683+) only runs for non-LoC spaces (Provinces/Cities).

### Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` — Modify `tax-profile`, `resolve-per-space` stage, support shift condition (lines ~4691-4698)

### Acceptance Criteria

1. Tax in a Population 0 Province with Passive Support shifts it toward Active Support
2. Tax in a Population 0 Province at Active Support does NOT shift (no-op guard intact)
3. Tax in a Population > 0 Province behaves identically to before (no regression)
4. LoC spaces still skip the support shift (outer branch handles this)
5. Resource gain logic is unchanged
6. No kernel source files modified
7. Build passes (`pnpm turbo build`)
8. Compilation tests pass (`pnpm -F @ludoforge/engine test`)

---

## Overall Test Plan

### Compilation Tests

All existing FITL compilation tests must continue to pass after YAML changes:
- `pnpm -F @ludoforge/engine test` — full engine test suite
- `pnpm -F @ludoforge/engine test:e2e` — E2E pipeline tests

### Manual Verification

1. **FITLSEC4RULGAP-001**: Compile the FITL spec and verify that the Transport non-shaded branch's piece filter includes guerrilla type alongside troops.
2. **FITLSEC4RULGAP-002**: Verify the flip-rangers-underground stage has no capability conditional and queries all map spaces.
3. **FITLSEC4RULGAP-003**: Verify the Subvert resolve-per-space stage has no guerrilla activation block.
4. **FITLSEC4RULGAP-004**: Verify Air Lift allows per-piece destination selection across the selected space pool.
5. **FITLSEC4RULGAP-005**: Verify Bombard presents a `chooseOne` for COIN Troop removal instead of `removeByPriority`.
6. **FITLSEC4RULGAP-006**: Verify Tax support shift has no `pop > 0` condition.

### Regression

- Texas Hold'em compilation tests must still pass (engine-agnosticism check)
- No new kernel or compiler source files created or modified

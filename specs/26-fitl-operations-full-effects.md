# Spec 26: FITL Operations Full Effects (Revised)

**Status**: Draft (ready for implementation)
**Priority**: P0
**Complexity**: XL
**Dependencies**: Spec 23 (map + pieces — COMPLETED), Spec 25a (kernel operation primitives — COMPLETED), Spec 25b (decision sequence model — COMPLETED), Spec 25c (extended kernel primitives — COMPLETED), Spec 13a (effect macros — COMPLETED)
**Estimated effort**: 8-10 days
**Source sections**: FITL Rules 3.2.1–3.2.4, 3.3.1–3.3.4, 1.4.1–1.4.4, 1.8.1

## Overview

Replace the 8 stub operation profiles with **16 faction-specific profiles** (Approach A). Every FITL operation has significant faction-specific behavior in cost, targeting, AND resolution. Separate profiles per faction make each one self-contained, independently testable, and directly traceable to the rulebook.

### Architecture: Separate Profiles per Faction

| Operation | Profile 1 | Profile 2 |
|-----------|-----------|-----------|
| Train | `train-us-profile` | `train-arvn-profile` |
| Patrol | `patrol-us-profile` | `patrol-arvn-profile` |
| Sweep | `sweep-us-profile` | `sweep-arvn-profile` |
| Assault | `assault-us-profile` | `assault-arvn-profile` |
| Rally | `rally-nva-profile` | `rally-vc-profile` |
| March | `march-nva-profile` | `march-vc-profile` |
| Attack | `attack-nva-profile` | `attack-vc-profile` |
| Terror | `terror-nva-profile` | `terror-vc-profile` |

The turn flow already knows which faction is acting and selects the correct profile. Shared patterns (piece removal ordering, dynamic sourcing) use the Spec 13a macro system.

### Why Not Single Profiles with Actor Branching?

Approach B (single profile + `{ ref: actor }` branching) was rejected because:
- For Assault, US and ARVN share almost nothing — the profile would be 90% branching
- Cost, targeting, and resolution ALL need separate branches in every operation
- Error-prone: easy to miss a branch, hard to trace which path applies
- Harder to test (must test both branches within the same profile)

### Changes from Previous Draft

**Structural**: 8 profiles → 16 faction-specific profiles.

**P0 Correctness Fixes** (per rules cross-reference):
1. **Train**: Wrong faction handling, missing sub-actions (ARVN base-building, US Saigon patronage transfer), wrong cost model
2. **Patrol**: Wrong cost model (ARVN 3 total not per-space, US 0), missing free Assault, missing LimOp single-destination
3. **Sweep**: Wrong cost for US (should be 0), missing Special Forces in activation count, wrong terrain (Jungle only not Highland)
4. **Assault**: Completely different US/ARVN damage formulas not modeled, missing US+ARVN combo
5. **Rally**: Wrong space filter (should be "without Support"), wrong placement logic, wrong with-Base bonuses
6. **March**: Wrong activation condition, missing LoC free cost, missing NVA Trail chain
7. **Attack**: Die roll mechanic missing, wrong damage formula, wrong attrition model
8. **Terror**: Missing NVA Troops selection, wrong cost for LoCs, wrong NVA shift direction

## Kernel Prerequisites (All Completed)

### Spec 25a — Kernel Operation Primitives
- Compound token filtering, binding query, `setTokenProp`, `rollRandom`, marker lattice, typed `OperationProfileDef`, compound move

### Spec 25b — Decision Sequence Model
- `legalChoices()`, template moves, `freeOperation` binding, agent updates

### Spec 25c — Extended Kernel Primitives
- Integer division `{ op: '/' }`, `tokenZone` reference

### Spec 13a — Effect Macros
- `piece-removal-ordering` macro, `place-from-available-or-map` macro
- `concat` ValueExpr, dynamic `forEach.limit`, `forEach.countBind`/`in`

### New Kernel Work Required

**`__actionClass` binding injection**: The current kernel injects `__freeOperation` into effect bindings but does NOT inject `__actionClass`. Spec 26 requires this for LimOp constraints (max 1 space, no SA). Implementation:
- In `apply-move.ts`: inject `__actionClass` from the turn flow's action class determination into bindings
- In `legal-choices.ts`: same injection in base bindings
- Value: `'operation' | 'limitedOperation' | 'operationPlusSpecialActivity'`

**`chooseN.max` as `ValueExpr`**: Currently `chooseN.max` is `number`. For the conditional LimOp pattern (`max: 1` when limited, `max: 99` otherwise), we need `max` to accept `ValueExpr`. Alternative: use an `if` effect wrapping two different `chooseN` blocks. The spec uses the `if`-wrapping approach to avoid kernel type changes.

## Scope

### In Scope

- **16 faction-specific operation profiles** (8 operations × 2 factions each)
- **4 new macros** for shared patterns across profiles
- **Global mechanics**: Terror/Sabotage marker supply (15), stacking enforcement (max 2 Bases), LimOp constraints
- **Multi-space targeting** via `chooseN` + `forEach` with decision sequence
- **Piece removal ordering**: Troops → Active Guerrillas → Bases (shared macro)
- **Cost models**: Faction-specific (US often 0, ARVN 3 per space, insurgents 1 per space)
- **Operation/SA interleaving**: Compound Move model (Spec 25a)
- **US Joint Operations constraint**: ARVN Resources minus Total Econ (Rule 1.8.1)
- **Dynamic piece sourcing**: Rule 1.4.1 via `place-from-available-or-map` macro
- **Attack die roll**: Probabilistic damage via `rollRandom`
- **NVA Troops Attack alternative**: Separate attack mode without die roll
- **Patrol free Assault**: Free Assault in 1 LoC after Patrol
- **Trail interactions**: NVA Rally Trail improvement, NVA March chain through Laos/Cambodia

### Out of Scope

- Capability/momentum modifiers on operations (Spec 28)
- Non-player operation selection logic (Spec 30)
- Special activity effect implementations (Spec 27)
- Event-granted free operations (Spec 29)

## Global Mechanics

### Terror/Sabotage Marker Supply (Rule 3.3.4)

Global variable `terrorSabotageMarkersPlaced` (init: 0, min: 0, max: 15). Check before placing:

```yaml
# Guard: do not place if all 15 markers already on map
- if:
    when: { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
    then:
      - setMarker: { space: $space, marker: terror, state: terror }
      - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
```

### Stacking Enforcement (Rule 1.4.2)

Max 2 Bases per space. Check in all placement effects (Train ARVN base-building, Rally):

```yaml
# Guard: only place base if fewer than 2 bases in space
- if:
    when:
      op: '<'
      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }] } } }
      right: 2
    then:
      - macro: place-from-available-or-map
        args: { pieceType: base, faction: 'ARVN', targetSpace: $space, maxPieces: 1 }
```

### LimOp Constraints

When the action class is `limitedOperation`:
- Max 1 space selected (enforced via `if` wrapping around `chooseN`)
- No SA compound moves allowed (enforced by turn flow, not operation profiles)

Pattern for conditional max:

```yaml
# LimOp-aware space selection
- if:
    when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
    then:
      - chooseN:
          bind: targetSpaces
          options: { query: zones, filter: ... }
          min: 1
          max: 1
    else:
      - chooseN:
          bind: targetSpaces
          options: { query: zones, filter: ... }
          min: 1
          max: 99
```

### US Joint Operations Constraint (Rule 1.8.1)

When US performs a COIN operation, ARVN Resources minus Total Econ must afford the cost:

```yaml
# In legality.when for US COIN profiles:
- op: '>='
  left: { op: '-', left: { ref: gvar, var: arvnResources }, right: { ref: gvar, var: totalEcon } }
  right: 3  # per-space cost (0 for US Patrol/Sweep)
```

### Free Operation Guard

Per-space costs use `__freeOperation` guard. Exceptions: Pacification and Trail improvement cost even when free (Rules 3.1.2, 5.5).

```yaml
# Standard per-space cost guard
- if:
    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
    then:
      - addVar: { scope: global, var: arvnResources, delta: -3 }
```

## New Macros (Spec 13a Extensions)

Beyond existing `piece-removal-ordering` and `place-from-available-or-map`:

### Macro: `coin-assault-removal-order`

Wraps `piece-removal-ordering` with COIN-specific behavior: each Base removed adds +6 Aid.

```yaml
effectMacros:
  - id: coin-assault-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
    effects:
      # Track bases before removal
      - let:
          bind: basesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
            # After removal: count bases removed, add +6 Aid per base
            - let:
                bind: basesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                in:
                  - let:
                      bind: basesRemoved
                      value: { op: '-', left: { ref: binding, name: $basesBefore }, right: { ref: binding, name: $basesAfter } }
                      in:
                        - if:
                            when: { op: '>', left: { ref: binding, name: $basesRemoved }, right: 0 }
                            then:
                              - addVar:
                                  scope: global
                                  var: aid
                                  delta: { op: '*', left: { ref: binding, name: $basesRemoved }, right: 6 }
```

### Macro: `insurgent-attack-removal-order`

Wraps piece removal with Attack-specific behavior: COIN Bases protected by non-Base COIN pieces of the other faction. Per US piece removed: attacker loses 1 piece to Available (not Casualties).

```yaml
effectMacros:
  - id: insurgent-attack-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
      - { name: attackerFaction, type: string }
    effects:
      # Track US pieces before removal for attrition
      - let:
          bind: usPiecesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
          in:
            # Removal: Do not remove US/ARVN Bases before other pieces of either faction
            # NVA Troops first, then Active Guerrillas, then Bases (same ordering)
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
            # US pieces removed go to Casualties (handled by piece-removal-ordering
            # which moves to available: — needs post-correction for US pieces)
            # Attrition: per US piece removed, attacker loses 1 piece to Available
            - let:
                bind: usPiecesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
                in:
                  - let:
                      bind: usRemoved
                      value: { op: '-', left: { ref: binding, name: $usPiecesBefore }, right: { ref: binding, name: $usPiecesAfter } }
                      in:
                        # Attacker attrition: lose 1 piece per US piece removed
                        - forEach:
                            bind: $attritionPiece
                            over:
                              query: tokensInZone
                              zone: { param: space }
                              filter: [{ prop: faction, eq: { param: attackerFaction } }]
                            limit: { ref: binding, name: $usRemoved }
                            effects:
                              - moveToken:
                                  token: $attritionPiece
                                  from: { param: space }
                                  to: { concat: ['available:', { param: attackerFaction }] }
```

**Note**: The base `piece-removal-ordering` macro moves removed pieces to `available:<faction>`. For Attack, US pieces should go to the Casualties box instead. This requires a post-correction step or a variant macro. Implementation detail: the Attack profiles will use inline removal logic that sends US pieces to `casualties:US` rather than `available:US`.

### Macro: `per-province-city-cost`

Faction-conditional per-space cost that charges 0 for LoCs:

```yaml
effectMacros:
  - id: per-province-city-cost
    params:
      - { name: space, type: string }
      - { name: resource, type: string }
      - { name: amount, type: number }
    effects:
      - if:
          when:
            op: and
            args:
              - { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
              - { op: '!=', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: 'loc' }
          then:
            - addVar: { scope: global, var: { param: resource }, delta: { param: amount } }
```

### Macro: `sweep-activation`

Guerrilla activation counting cubes + Special Forces, with Jungle terrain ratio:

```yaml
effectMacros:
  - id: sweep-activation
    params:
      - { name: space, type: string }
      - { name: cubeFaction, type: string }
      - { name: sfType, type: string }  # 'irregulars' for US, 'rangers' for ARVN
    effects:
      # Count cubes (troops + police)
      - let:
          bind: cubeCount
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
          in:
            # Count Special Forces
            - let:
                bind: sfCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, eq: { param: sfType } }] } } }
                in:
                  - let:
                      bind: totalSweepers
                      value: { op: '+', left: { ref: binding, name: $cubeCount }, right: { ref: binding, name: $sfCount } }
                      in:
                        # Jungle: 1 per 2 sweepers (round down). Otherwise: 1 per 1.
                        - let:
                            bind: activationLimit
                            value:
                              if:
                                when: { op: zonePropIncludes, zone: { param: space }, prop: terrainTags, value: 'jungle' }
                                then: { op: '/', left: { ref: binding, name: $totalSweepers }, right: 2 }
                                else: { ref: binding, name: $totalSweepers }
                            in:
                              - forEach:
                                  bind: $guerrilla
                                  over:
                                    query: tokensInZone
                                    zone: { param: space }
                                    filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                                  limit: { ref: binding, name: $activationLimit }
                                  effects:
                                    - setTokenProp: { token: $guerrilla, prop: activity, value: active }
```

## Implementation Tasks

### Task 26.1: `__actionClass` Binding Injection

Inject `__actionClass` into effect context bindings alongside `__freeOperation`.

**Modify**:
- `src/kernel/apply-move.ts`: Add `__actionClass` to bindings (derive from turn flow action class or from move metadata)
- `src/kernel/legal-choices.ts`: Same injection in `baseBindings`

**Design**: The action class is determined by the turn flow system. For now, add an optional `actionClass` field to `Move` (parallel to `freeOperation`). The turn flow or agent sets it when constructing the move. Default: `'operation'`.

**Tests**: Verify `__actionClass` is accessible in effect conditions.

### Task 26.2: New Macros

Add the 4 macros defined in the "New Macros" section above to the FITL GameSpecDoc.

### Task 26.3: COIN Operations — Train

#### train-us-profile (Rule 3.2.1, US variant)

**Space filter**: Provinces or Cities with US pieces.
**Cost**: 0 for US. 3 ARVN Resources only if ARVN pieces placed.
**US Joint Ops guard**: ARVN Resources - Total Econ >= 3 (only if placing ARVN).

**Resolution**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      # LimOp-aware space selection
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      # Must have US pieces
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }] } } }
                        right: 0
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }] } } }
                        right: 0
                min: 1
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # US Train placement choice:
            # Option A: Place 1-2 Irregulars
            # Option B: At US Bases: 1-2 Rangers OR up to 6 ARVN cubes
            - chooseOne:
                bind: $trainChoice
                options: { query: enums, values: ['place-irregulars', 'place-at-base'] }

            - if:
                when: { op: '==', left: { ref: binding, name: $trainChoice }, right: 'place-irregulars' }
                then:
                  - macro: place-from-available-or-map
                    args:
                      pieceType: irregulars
                      faction: 'US'
                      targetSpace: $space
                      maxPieces: 2

            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $trainChoice }, right: 'place-at-base' }
                    # Must have US Base in space
                    - op: '>'
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                      right: 0
                then:
                  - chooseOne:
                      bind: $baseTrainChoice
                      options: { query: enums, values: ['rangers', 'arvn-cubes'] }
                  - if:
                      when: { op: '==', left: { ref: binding, name: $baseTrainChoice }, right: 'rangers' }
                      then:
                        - macro: place-from-available-or-map
                          args:
                            pieceType: rangers
                            faction: 'ARVN'
                            targetSpace: $space
                            maxPieces: 2
                  - if:
                      when: { op: '==', left: { ref: binding, name: $baseTrainChoice }, right: 'arvn-cubes' }
                      then:
                        # Cost: 3 ARVN Resources for placing ARVN pieces
                        - if:
                            when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                            then:
                              - addVar: { scope: global, var: arvnResources, delta: -3 }
                        # Place up to 6 ARVN cubes (any mix of Troops and Police)
                        - chooseN:
                            bind: $arvnCubeTypes
                            options: { query: enums, values: ['troops', 'police'] }
                            min: 1
                            max: 6
                        - forEach:
                            bind: $cubeType
                            over: { query: binding, name: $arvnCubeTypes }
                            effects:
                              - macro: place-from-available-or-map
                                args:
                                  pieceType: { ref: binding, name: $cubeType }
                                  faction: 'ARVN'
                                  targetSpace: $space
                                  maxPieces: 1

  - stage: sub-action
    effects:
      # In 1 selected space, choose one of:
      # A) Pacification (US needs US piece + COIN Control, NOT Troops+Police)
      # B) Saigon patronage transfer
      - chooseN:
          bind: $subActionSpaces
          options:
            query: binding
            name: targetSpaces
          min: 0
          max: 1
      - forEach:
          bind: $subSpace
          over: { query: binding, name: $subActionSpaces }
          effects:
            - chooseOne:
                bind: $subAction
                options: { query: enums, values: ['pacify', 'saigon-transfer', 'none'] }

            # Pacification: needs US piece + COIN Control
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $subAction }, right: 'pacify' }
                    - op: '>'
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'US' }] } } }
                      right: 0
                    # COIN Control check (COIN pieces > enemy pieces)
                then:
                  # Remove Terror marker first (if present)
                  - if:
                      when: { op: '==', left: { ref: markerState, space: $subSpace, marker: terror }, right: 'terror' }
                      then:
                        # Costs 3 ARVN Resources per Terror removed (even if free op!)
                        - addVar: { scope: global, var: arvnResources, delta: -3 }
                        - setMarker: { space: $subSpace, marker: terror, state: none }
                  # Shift up to 2 levels toward Active Support
                  - chooseOne:
                      bind: $pacLevels
                      options: { query: intsInRange, min: 1, max: 2 }
                  # Costs 3 ARVN Resources per level shifted (even if free op!)
                  - addVar:
                      scope: global
                      var: arvnResources
                      delta: { op: '*', left: { ref: binding, name: $pacLevels }, right: -3 }
                  - shiftMarker: { space: $subSpace, marker: supportOpposition, delta: { ref: binding, name: $pacLevels } }

            # Saigon patronage transfer (US only, space must be Saigon)
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $subAction }, right: 'saigon-transfer' }
                    - { op: '==', left: { ref: zoneProp, zone: $subSpace, prop: spaceId }, right: 'saigon' }
                then:
                  - chooseOne:
                      bind: $transferAmount
                      options: { query: intsInRange, min: 1, max: 3 }
                  - addVar: { scope: global, var: patronage, delta: { op: '*', left: { ref: binding, name: $transferAmount }, right: -1 } }
                  - addVar: { scope: global, var: arvnResources, delta: { ref: binding, name: $transferAmount } }
```

#### train-arvn-profile (Rule 3.2.1, ARVN variant)

**Space filter**: Provinces or Cities without NVA Control.
**Cost**: 3 ARVN Resources only if ARVN pieces placed (including base replacement).

**Resolution**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      # Without NVA Control (NVA pieces <= COIN+VC pieces)
                      - op: not
                        arg: { op: '==', left: { ref: zoneProp, zone: $zone, prop: control }, right: 'NVA' }
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      - op: not
                        arg: { op: '==', left: { ref: zoneProp, zone: $zone, prop: control }, right: 'NVA' }
                min: 1
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # ARVN Train: place 1-2 Rangers or up to 6 ARVN cubes
            # at Cities or at US/ARVN Bases
            - chooseOne:
                bind: $trainChoice
                options: { query: enums, values: ['rangers', 'arvn-cubes'] }

            - if:
                when: { op: '==', left: { ref: binding, name: $trainChoice }, right: 'rangers' }
                then:
                  # Cost: 3 ARVN Resources for placing ARVN pieces
                  - if:
                      when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                      then:
                        - addVar: { scope: global, var: arvnResources, delta: -3 }
                  - macro: place-from-available-or-map
                    args:
                      pieceType: rangers
                      faction: 'ARVN'
                      targetSpace: $space
                      maxPieces: 2

            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $trainChoice }, right: 'arvn-cubes' }
                    # Must be City or have COIN Base
                    - op: or
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'city' }
                        - op: '>'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }, { prop: type, eq: base }] } } }
                          right: 0
                then:
                  # Cost: 3 ARVN Resources
                  - if:
                      when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                      then:
                        - addVar: { scope: global, var: arvnResources, delta: -3 }
                  # Place up to 6 ARVN cubes
                  - macro: place-from-available-or-map
                    args:
                      pieceType: troops
                      faction: 'ARVN'
                      targetSpace: $space
                      maxPieces: 6

  - stage: sub-action
    effects:
      # In 1 selected space (even if LimOp), choose one of:
      # A) Pacification (ARVN needs ARVN Troops AND Police + COIN Control)
      # B) Replace 3 ARVN cubes with 1 ARVN Base
      - chooseN:
          bind: $subActionSpaces
          options: { query: binding, name: targetSpaces }
          min: 0
          max: 1
      - forEach:
          bind: $subSpace
          over: { query: binding, name: $subActionSpaces }
          effects:
            - chooseOne:
                bind: $subAction
                options: { query: enums, values: ['pacify', 'replace-cubes-with-base', 'none'] }

            # Pacification: needs ARVN Troops AND Police + COIN Control
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $subAction }, right: 'pacify' }
                    - op: '>'
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: troops }] } } }
                      right: 0
                    - op: '>'
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: police }] } } }
                      right: 0
                then:
                  - if:
                      when: { op: '==', left: { ref: markerState, space: $subSpace, marker: terror }, right: 'terror' }
                      then:
                        - addVar: { scope: global, var: arvnResources, delta: -3 }
                        - setMarker: { space: $subSpace, marker: terror, state: none }
                  - chooseOne:
                      bind: $pacLevels
                      options: { query: intsInRange, min: 1, max: 2 }
                  - addVar:
                      scope: global
                      var: arvnResources
                      delta: { op: '*', left: { ref: binding, name: $pacLevels }, right: -3 }
                  - shiftMarker: { space: $subSpace, marker: supportOpposition, delta: { ref: binding, name: $pacLevels } }

            # Replace 3 ARVN cubes with 1 ARVN Base (costs 3 even if free op)
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: binding, name: $subAction }, right: 'replace-cubes-with-base' }
                    # Must have 3+ ARVN cubes
                    - op: '>='
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                      right: 3
                    # Stacking: fewer than 2 bases
                    - op: '<'
                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: type, eq: base }] } } }
                      right: 2
                then:
                  # Cost: 3 ARVN Resources (even if free op)
                  - addVar: { scope: global, var: arvnResources, delta: -3 }
                  # Remove 3 ARVN cubes
                  - forEach:
                      bind: $cube
                      over:
                        query: tokensInZone
                        zone: $subSpace
                        filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }]
                      limit: 3
                      effects:
                        - moveToken: { token: $cube, from: $subSpace, to: 'available:ARVN' }
                  # Place 1 ARVN Base
                  - macro: place-from-available-or-map
                    args:
                      pieceType: base
                      faction: 'ARVN'
                      targetSpace: $subSpace
                      maxPieces: 1
```

### Task 26.4: COIN Operations — Patrol

#### patrol-us-profile (Rule 3.2.2, US variant)

**Cost**: 0 (US pays nothing).
**Movement**: Cubes chain-move through adjacent LoCs/Cities until stopped by enemy or player choice.
**Activation**: 1 enemy Guerrilla per US cube in each LoC (1:1 ratio).
**Free Assault**: In 1 LoC at no added cost. US may not add ARVN.
**LimOp**: All moving cubes must end on single destination.

```yaml
# patrol-us-profile
legality:
  when: true  # US Patrol is always legal (costs 0)
cost:
  spend: []  # No cost for US
resolution:
  - stage: select-locs
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetLoCs
                options:
                  query: zones
                  filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetLoCs
                options:
                  query: zones
                  filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                min: 1
                max: 99

  - stage: move-cubes
    effects:
      - forEach:
          bind: loc
          over: { query: binding, name: targetLoCs }
          effects:
            # Move US cubes from adjacent spaces into LoC
            - chooseN:
                bind: $movingCubes
                options:
                  query: tokensInAdjacentZones
                  zone: $loc
                  filter:
                    - { prop: faction, eq: 'US' }
                    - { prop: type, op: in, value: ['troops', 'police'] }
                min: 0
                max: 99
            - forEach:
                bind: $cube
                over: { query: binding, name: $movingCubes }
                effects:
                  - moveToken:
                      token: $cube
                      from: { ref: tokenZone, token: $cube }
                      to: $loc

  - stage: activate-guerrillas
    effects:
      - forEach:
          bind: loc
          over: { query: binding, name: targetLoCs }
          effects:
            # Activate 1 enemy Guerrilla per US cube (1:1 ratio)
            - let:
                bind: usCubeCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $loc, filter: [{ prop: faction, eq: 'US' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                in:
                  - forEach:
                      bind: $guerrilla
                      over:
                        query: tokensInZone
                        zone: $loc
                        filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                      limit: { ref: binding, name: $usCubeCount }
                      effects:
                        - setTokenProp: { token: $guerrilla, prop: activity, value: active }

  - stage: free-assault
    effects:
      # Free Assault in 1 LoC (no added cost). US may not add ARVN.
      - chooseN:
          bind: $assaultLoCs
          options: { query: binding, name: targetLoCs }
          min: 0
          max: 1
      - forEach:
          bind: $assaultLoC
          over: { query: binding, name: $assaultLoCs }
          effects:
            # US Assault damage: count US Troops
            - let:
                bind: usTroops
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                in:
                  # Damage: same as US Assault formula (simplified for LoC — no Highland)
                  # LoCs can have US Bases so check
                  - let:
                      bind: hasUSBase
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                      in:
                        - let:
                            bind: damage
                            value:
                              if:
                                when: { op: '>', left: { ref: binding, name: $hasUSBase }, right: 0 }
                                then: { op: '*', left: { ref: binding, name: $usTroops }, right: 2 }
                                else: { ref: binding, name: $usTroops }
                            in:
                              - macro: coin-assault-removal-order
                                args:
                                  space: $assaultLoC
                                  damageExpr: { ref: binding, name: $damage }
```

#### patrol-arvn-profile (Rule 3.2.2, ARVN variant)

**Cost**: 3 ARVN Resources TOTAL (not per space).
**Otherwise identical to US except faction references**.

```yaml
# patrol-arvn-profile
legality:
  when:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
cost:
  validate:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
  spend:
    # 3 ARVN Resources TOTAL (upfront, not per space)
    - addVar: { scope: global, var: arvnResources, delta: -3 }
resolution:
  # Same structure as US but with ARVN faction references
  # Movement, activation (1:1 ratio), free Assault all identical
  # except: faction filter uses 'ARVN' instead of 'US'
  # and ARVN Assault damage formula applies in free Assault
  # (Omitted for brevity — same pattern as patrol-us-profile with ARVN faction)
```

### Task 26.5: COIN Operations — Sweep

#### sweep-us-profile (Rule 3.2.3, US variant)

**Space filter**: Provinces or Cities only (not LoCs, not North Vietnam).
**Cost**: 0 (US pays nothing).
**Movement**: US Troops from adjacent; can hop through 1 LoC free of NVA/VC.
**Activation count**: US cubes + Irregulars (Special Forces).
**Terrain**: Jungle only — 1 per 2 sweepers (not Highland).

```yaml
# sweep-us-profile
legality:
  when: true  # US Sweep costs 0
cost:
  spend: []
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                min: 1
                max: 99

  - stage: move-troops
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Move US Troops from adjacent spaces
            - chooseN:
                bind: $movingTroops
                options:
                  query: tokensInAdjacentZones
                  zone: $space
                  filter:
                    - { prop: faction, eq: 'US' }
                    - { prop: type, eq: troops }
                min: 0
                max: 99
            - forEach:
                bind: $troop
                over: { query: binding, name: $movingTroops }
                effects:
                  - moveToken:
                      token: $troop
                      from: { ref: tokenZone, token: $troop }
                      to: $space

  - stage: activate-guerrillas
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            - macro: sweep-activation
              args:
                space: $space
                cubeFaction: 'US'
                sfType: irregulars
```

#### sweep-arvn-profile (Rule 3.2.3, ARVN variant)

**Cost**: 3 ARVN Resources per space.
**Activation count**: ARVN cubes + Rangers.
**Otherwise same structure**.

```yaml
# sweep-arvn-profile
legality:
  when:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
cost:
  validate:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
  spend: []  # Per-space cost in resolution
resolution:
  - stage: select-spaces
    effects:
      # Same filter as US (Provinces/Cities only)
      # ... (same LimOp-aware pattern)

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost: 3 ARVN Resources
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Move ARVN Troops from adjacent
            - chooseN:
                bind: $movingTroops
                options:
                  query: tokensInAdjacentZones
                  zone: $space
                  filter:
                    - { prop: faction, eq: 'ARVN' }
                    - { prop: type, eq: troops }
                min: 0
                max: 99
            - forEach:
                bind: $troop
                over: { query: binding, name: $movingTroops }
                effects:
                  - moveToken:
                      token: $troop
                      from: { ref: tokenZone, token: $troop }
                      to: $space

            # Activation: ARVN cubes + Rangers
            - macro: sweep-activation
              args:
                space: $space
                cubeFaction: 'ARVN'
                sfType: rangers
```

### Task 26.6: COIN Operations — Assault

#### assault-us-profile (Rule 3.2.4, US variant)

**Space filter**: Spaces with US Troops and enemy pieces.
**Cost**: 3 ARVN Resources only if adding ARVN Assault follow-up.
**Damage formula**:
- With US Base: 2 enemies per US Troop
- Highland without US Base: 1 enemy per 2 US Troops (round down)
- Otherwise: 1 enemy per US Troop

```yaml
# assault-us-profile
legality:
  when: true  # US Assault costs 0 unless adding ARVN
cost:
  spend: []
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                        right: 0
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                        right: 0
                min: 1
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            - let:
                bind: usTroops
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                in:
                  - let:
                      bind: hasUSBase
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                      in:
                        - let:
                            bind: isHighland
                            value:
                              if:
                                when: { op: zonePropIncludes, zone: $space, prop: terrainTags, value: 'highland' }
                                then: 1
                                else: 0
                            in:
                              # Damage formula:
                              # hasBase → 2 * troops
                              # highland, no base → troops / 2
                              # otherwise → troops
                              - let:
                                  bind: damage
                                  value:
                                    if:
                                      when: { op: '>', left: { ref: binding, name: $hasUSBase }, right: 0 }
                                      then: { op: '*', left: { ref: binding, name: $usTroops }, right: 2 }
                                      else:
                                        if:
                                          when: { op: '==', left: { ref: binding, name: $isHighland }, right: 1 }
                                          then: { op: '/', left: { ref: binding, name: $usTroops }, right: 2 }
                                          else: { ref: binding, name: $usTroops }
                                  in:
                                    - macro: coin-assault-removal-order
                                      args:
                                        space: $space
                                        damageExpr: { ref: binding, name: $damage }

  - stage: arvn-followup
    effects:
      # US may pay 3 ARVN Resources to add ARVN Assault in 1 space
      - chooseN:
          bind: $arvnFollowupSpaces
          options: { query: binding, name: targetSpaces }
          min: 0
          max: 1
      - forEach:
          bind: $arvnSpace
          over: { query: binding, name: $arvnFollowupSpaces }
          effects:
            - addVar: { scope: global, var: arvnResources, delta: -3 }
            # ARVN Assault damage in that space
            - let:
                bind: arvnCubes
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $arvnSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                in:
                  - let:
                      bind: isHighland
                      value:
                        if:
                          when: { op: zonePropIncludes, zone: $arvnSpace, prop: terrainTags, value: 'highland' }
                          then: 1
                          else: 0
                      in:
                        - let:
                            bind: arvnDamage
                            value:
                              if:
                                when: { op: '==', left: { ref: binding, name: $isHighland }, right: 1 }
                                then: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                                else: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                            in:
                              - macro: coin-assault-removal-order
                                args:
                                  space: $arvnSpace
                                  damageExpr: { ref: binding, name: $arvnDamage }
```

#### assault-arvn-profile (Rule 3.2.4, ARVN variant)

**Cost**: 3 ARVN Resources per space.
**Damage**: 1 enemy per 2 ARVN cubes (3 in Highland). Cities/LoCs: Police+Troops. Provinces: Troops only.

```yaml
# assault-arvn-profile
legality:
  when:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
cost:
  validate:
    op: '>='
    left: { ref: gvar, var: arvnResources }
    right: 3
  spend: []  # Per-space cost in resolution
resolution:
  - stage: select-spaces
    effects:
      # Spaces with ARVN cubes and enemy pieces
      # ... (same LimOp-aware pattern)

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Count ARVN cubes (faction-specific by space type)
            - let:
                bind: isProvinceOnly
                value:
                  if:
                    when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'province' }
                    then: 1
                    else: 0
                in:
                  - let:
                      bind: arvnCubes
                      value:
                        if:
                          # Provinces: Troops only
                          when: { op: '==', left: { ref: binding, name: $isProvinceOnly }, right: 1 }
                          then: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: troops }] } } }
                          # Cities/LoCs: Troops + Police
                          else: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                      in:
                        - let:
                            bind: isHighland
                            value:
                              if:
                                when: { op: zonePropIncludes, zone: $space, prop: terrainTags, value: 'highland' }
                                then: 1
                                else: 0
                            in:
                              # Damage: 1 per 2 cubes, or 1 per 3 in Highland
                              - let:
                                  bind: damage
                                  value:
                                    if:
                                      when: { op: '==', left: { ref: binding, name: $isHighland }, right: 1 }
                                      then: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                                      else: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                                  in:
                                    - macro: coin-assault-removal-order
                                      args:
                                        space: $space
                                        damageExpr: { ref: binding, name: $damage }
```

### Task 26.7: Insurgent Operations — Rally

#### rally-nva-profile (Rule 3.3.1, NVA variant)

**Space filter**: Provinces or Cities without Support.
**Cost**: 1 Resource per space.
**Without NVA Base**: Place 1 NVA Guerrilla OR replace 2 NVA Guerrillas with 1 NVA Base (mutually exclusive).
**With NVA Base**: Place guerrillas up to Trail value + NVA Bases in space.
**Trail improvement**: Spend 2 more Resources to improve Trail by 1 (even during LimOp, even if 0 spaces selected, even if free).

```yaml
# rally-nva-profile
legality:
  when:
    op: '>='
    left: { ref: gvar, var: nvaResources }
    right: 1
cost:
  validate:
    op: '>='
    left: { ref: gvar, var: nvaResources }
    right: 1
  spend: []  # Per-space cost in resolution
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                      # Without Support (Neutral, Passive Opposition, or Active Opposition)
                      - op: '!='
                        left: { ref: markerState, space: $zone, marker: supportOpposition }
                        right: 'passiveSupport'
                      - op: '!='
                        left: { ref: markerState, space: $zone, marker: supportOpposition }
                        right: 'activeSupport'
                min: 0
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                      - op: '!='
                        left: { ref: markerState, space: $zone, marker: supportOpposition }
                        right: 'passiveSupport'
                      - op: '!='
                        left: { ref: markerState, space: $zone, marker: supportOpposition }
                        right: 'activeSupport'
                min: 0
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: nvaResources, delta: -1 }

            # Check for NVA Base in space
            - let:
                bind: nvaBaseCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: base }] } } }
                in:
                  # WITHOUT NVA Base: place 1 guerrilla OR replace 2 guerrillas with base
                  - if:
                      when: { op: '==', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                      then:
                        - chooseOne:
                            bind: $noBaseChoice
                            options: { query: enums, values: ['place-guerrilla', 'replace-with-base'] }
                        - if:
                            when: { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'place-guerrilla' }
                            then:
                              - macro: place-from-available-or-map
                                args:
                                  pieceType: guerrilla
                                  faction: 'NVA'
                                  targetSpace: $space
                                  maxPieces: 1
                        - if:
                            when:
                              op: and
                              args:
                                - { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'replace-with-base' }
                                # Must have 2+ NVA guerrillas
                                - op: '>='
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }] } } }
                                  right: 2
                                # Stacking check
                                - op: '<'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }] } } }
                                  right: 2
                            then:
                              # Remove 2 NVA guerrillas
                              - forEach:
                                  bind: $g
                                  over:
                                    query: tokensInZone
                                    zone: $space
                                    filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }]
                                  limit: 2
                                  effects:
                                    - moveToken: { token: $g, from: $space, to: 'available:NVA' }
                              # Place 1 NVA base
                              - macro: place-from-available-or-map
                                args:
                                  pieceType: base
                                  faction: 'NVA'
                                  targetSpace: $space
                                  maxPieces: 1

                  # WITH NVA Base: place guerrillas up to Trail + NVA Bases in space
                  - if:
                      when: { op: '>', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                      then:
                        - let:
                            bind: rallyLimit
                            value: { op: '+', left: { ref: gvar, var: trail }, right: { ref: binding, name: $nvaBaseCount } }
                            in:
                              - macro: place-from-available-or-map
                                args:
                                  pieceType: guerrilla
                                  faction: 'NVA'
                                  targetSpace: $space
                                  maxPieces: { ref: binding, name: $rallyLimit }

  - stage: trail-improvement
    effects:
      # NVA may spend 2 Resources to improve Trail by 1
      # Available even with 0 spaces selected, even during LimOp, even if free
      - chooseN:
          bind: $improveTrail
          options: { query: enums, values: ['yes', 'no'] }
          min: 1
          max: 1
      - if:
          when: { op: '==', left: { ref: binding, name: $improveTrail }, right: 'yes' }
          then:
            # Costs 2 Resources (even if free op — Rule 3.3.1)
            - addVar: { scope: global, var: nvaResources, delta: -2 }
            - addVar: { scope: global, var: trail, delta: 1 }
```

#### rally-vc-profile (Rule 3.3.1, VC variant)

**Same space filter**. Different with-Base behavior:
- Place guerrillas up to Population + VC Bases in space, OR flip all VC Guerrillas Underground.
- No Trail improvement (VC can't improve Trail).

```yaml
# rally-vc-profile — same structure but:
# WITH VC Base: place guerrillas up to Pop + VC Bases OR flip all underground
# Stage: resolve-per-space, with-Base branch:
- if:
    when: { op: '>', left: { ref: binding, name: $vcBaseCount }, right: 0 }
    then:
      - chooseOne:
          bind: $withBaseChoice
          options: { query: enums, values: ['place-guerrillas', 'flip-underground'] }
      - if:
          when: { op: '==', left: { ref: binding, name: $withBaseChoice }, right: 'place-guerrillas' }
          then:
            - let:
                bind: rallyLimit
                value: { op: '+', left: { ref: zoneProp, zone: $space, prop: population }, right: { ref: binding, name: $vcBaseCount } }
                in:
                  - macro: place-from-available-or-map
                    args:
                      pieceType: guerrilla
                      faction: 'VC'
                      targetSpace: $space
                      maxPieces: { ref: binding, name: $rallyLimit }
      - if:
          when: { op: '==', left: { ref: binding, name: $withBaseChoice }, right: 'flip-underground' }
          then:
            - forEach:
                bind: $g
                over:
                  query: tokensInZone
                  zone: $space
                  filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }]
                effects:
                  - setTokenProp: { token: $g, prop: activity, value: underground }
# No trail-improvement stage for VC
```

### Task 26.8: Insurgent Operations — March

#### march-nva-profile (Rule 3.3.2, NVA variant)

**Cost**: 1 Resource per Province/City entered (0 for LoCs). Trail=4 makes Laos/Cambodia moves free.
**Activation**: If (destination is LoC or has Support) AND (moving group pieces + COIN cubes/Irregulars/Rangers at destination > 3).
**NVA Trail chain**: NVA can continue moving through Laos/Cambodia if Trail > 0 and not LimOp.

```yaml
# march-nva-profile
resolution:
  - stage: select-destinations
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options: { query: zones }
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options: { query: zones }
                min: 1
                max: 99

  - stage: resolve-per-destination
    effects:
      - forEach:
          bind: destSpace
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-destination cost: 1 Resource for Province/City, 0 for LoC
            - macro: per-province-city-cost
              args:
                space: $destSpace
                resource: nvaResources
                amount: -1

            # Select NVA pieces to move into this space (from adjacent)
            - chooseN:
                bind: $movingPieces
                options:
                  query: tokensInAdjacentZones
                  zone: $destSpace
                  filter: [{ prop: faction, eq: 'NVA' }, { prop: type, op: in, value: ['guerrilla', 'troops'] }]
                min: 1
                max: 99
            - forEach:
                bind: $piece
                over: { query: binding, name: $movingPieces }
                effects:
                  - moveToken:
                      token: $piece
                      from: { ref: tokenZone, token: $piece }
                      to: $destSpace

            # Activation check: if (LoC or Support) AND (moving + COIN > 3)
            - let:
                bind: isLocOrSupport
                value:
                  if:
                    when:
                      op: or
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $destSpace, prop: spaceType }, right: 'loc' }
                        - { op: in, item: { ref: markerState, space: $destSpace, marker: supportOpposition }, set: ['passiveSupport', 'activeSupport'] }
                    then: 1
                    else: 0
                in:
                  - let:
                      bind: coinPieces
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $destSpace, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
                      in:
                        - let:
                            bind: movingCount
                            value: { aggregate: { op: count, query: { query: binding, name: $movingPieces } } }
                            in:
                              - if:
                                  when:
                                    op: and
                                    args:
                                      - { op: '==', left: { ref: binding, name: $isLocOrSupport }, right: 1 }
                                      - { op: '>', left: { op: '+', left: { ref: binding, name: $movingCount }, right: { ref: binding, name: $coinPieces } }, right: 3 }
                                  then:
                                    # Activate all guerrillas in moving group
                                    - forEach:
                                        bind: $g
                                        over: { query: binding, name: $movingPieces }
                                        effects:
                                          - if:
                                              when: { op: '==', left: { ref: tokenProp, token: $g, prop: type }, right: 'guerrilla' }
                                              then:
                                                - setTokenProp: { token: $g, prop: activity, value: active }
```

**Note**: NVA Trail chain movement (continuing through Laos/Cambodia) is a complex multi-hop mechanic. In the spec YAML, this is modeled as the player being able to select additional destination spaces for pieces already in Laos/Cambodia. The turn flow ensures this is only available when Trail > 0 and not LimOp. Full chain logic may require a kernel extension or be modeled as sequential destination selections within the same operation.

#### march-vc-profile (Rule 3.3.2, VC variant)

Same structure but no Trail chain movement. VC cannot chain through Laos/Cambodia.

### Task 26.9: Insurgent Operations — Attack

#### attack-nva-profile (Rule 3.3.3, NVA variant)

**Space filter**: Spaces where NVA and an enemy have pieces.
**Cost**: 1 Resource per space.
**Mode choice**: Guerrilla Attack OR NVA Troops Attack (NVA-only alternative).

```yaml
# attack-nva-profile
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
                        right: 0
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: and
                    args:
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
                        right: 0
                min: 1
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: nvaResources, delta: -1 }

            # NVA chooses: Guerrilla Attack or Troops Attack
            - chooseOne:
                bind: $attackMode
                options: { query: enums, values: ['guerrilla-attack', 'troops-attack'] }

            # MODE A: Guerrilla Attack
            - if:
                when: { op: '==', left: { ref: binding, name: $attackMode }, right: 'guerrilla-attack' }
                then:
                  # Step 1: Activate ALL NVA guerrillas
                  - forEach:
                      bind: $g
                      over:
                        query: tokensInZone
                        zone: $space
                        filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }]
                      effects:
                        - setTokenProp: { token: $g, prop: activity, value: active }

                  # Step 2: Roll die
                  - let:
                      bind: guerrillaCount
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }] } } }
                      in:
                        - rollRandom:
                            bind: $dieRoll
                            min: 1
                            max: 6
                            in:
                              # If roll <= guerrilla count: remove up to 2 enemy pieces
                              - if:
                                  when: { op: '<=', left: { ref: binding, name: $dieRoll }, right: { ref: binding, name: $guerrillaCount } }
                                  then:
                                    # Remove up to 2 enemy pieces (Attack removal ordering)
                                    # US pieces removed go to Casualties
                                    - macro: insurgent-attack-removal-order
                                      args:
                                        space: $space
                                        damageExpr: 2
                                        attackerFaction: 'NVA'

            # MODE B: NVA Troops Attack (no die roll, no guerrilla activation)
            - if:
                when: { op: '==', left: { ref: binding, name: $attackMode }, right: 'troops-attack' }
                then:
                  - let:
                      bind: nvaTroops
                      value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: troops }] } } }
                      in:
                        # Damage: 1 enemy per 2 NVA Troops (round down)
                        - let:
                            bind: damage
                            value: { op: '/', left: { ref: binding, name: $nvaTroops }, right: 2 }
                            in:
                              - macro: insurgent-attack-removal-order
                                args:
                                  space: $space
                                  damageExpr: { ref: binding, name: $damage }
                                  attackerFaction: 'NVA'
```

#### attack-vc-profile (Rule 3.3.3, VC variant)

**Guerrilla Attack only** (no Troops alternative). Same die roll mechanic.

```yaml
# attack-vc-profile — same as NVA guerrilla attack mode only
# No troops-attack option
# No chooseOne for attack mode — always guerrilla attack
resolution:
  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: vcResources, delta: -1 }
            # Activate ALL VC guerrillas
            - forEach:
                bind: $g
                over:
                  query: tokensInZone
                  zone: $space
                  filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }]
                effects:
                  - setTokenProp: { token: $g, prop: activity, value: active }
            # Roll die
            - let:
                bind: guerrillaCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }] } } }
                in:
                  - rollRandom:
                      bind: $dieRoll
                      min: 1
                      max: 6
                      in:
                        - if:
                            when: { op: '<=', left: { ref: binding, name: $dieRoll }, right: { ref: binding, name: $guerrillaCount } }
                            then:
                              - macro: insurgent-attack-removal-order
                                args:
                                  space: $space
                                  damageExpr: 2
                                  attackerFaction: 'VC'
```

### Task 26.10: Insurgent Operations — Terror

#### terror-nva-profile (Rule 3.3.4, NVA variant)

**Space filter**: Underground Guerrilla OR NVA Troop cube (NVA can Terror with Troops alone).
**Cost**: 1 Resource per Province/City (0 for LoCs).
**Support shift**: Toward **Neutral** (different from VC!).
**Activation**: Activate 1 Underground Guerrilla (if any there — NVA with only Troops doesn't activate).
**Marker supply**: Check 15-marker limit.

```yaml
# terror-nva-profile
resolution:
  - stage: select-spaces
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
          then:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: or
                    args:
                      # Has NVA Underground Guerrilla
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }] } } }
                        right: 0
                      # OR has NVA Troops
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: troops }] } } }
                        right: 0
                min: 1
                max: 1
          else:
            - chooseN:
                bind: targetSpaces
                options:
                  query: zones
                  filter:
                    op: or
                    args:
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: troops }] } } }
                        right: 0
                min: 1
                max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost: 0 for LoCs, 1 for Provinces/Cities
            - macro: per-province-city-cost
              args:
                space: $space
                resource: nvaResources
                amount: -1

            # Activate 1 Underground Guerrilla (if any there)
            - forEach:
                bind: $g
                over:
                  query: tokensInZone
                  zone: $space
                  filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                limit: 1
                effects:
                  - setTokenProp: { token: $g, prop: activity, value: active }

            # Place marker (check supply and existing markers)
            - if:
                when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'loc' }
                then:
                  # LoC: Sabotage marker
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '!=', left: { ref: markerState, space: $space, marker: sabotage }, right: 'sabotaged' }
                          - { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
                      then:
                        - setMarker: { space: $space, marker: sabotage, state: sabotaged }
                        - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
                else:
                  # Province/City: Terror marker + shift Support toward Neutral
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '!=', left: { ref: markerState, space: $space, marker: terror }, right: 'terror' }
                          - { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
                      then:
                        - setMarker: { space: $space, marker: terror, state: terror }
                        - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
                  # NVA: shift Support toward Neutral (not Opposition!)
                  # Only shift if space currently has Support
                  - if:
                      when:
                        op: or
                        args:
                          - { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: 'activeSupport' }
                      then:
                        - shiftMarker: { space: $space, marker: supportOpposition, delta: -1 }
```

#### terror-vc-profile (Rule 3.3.4, VC variant)

**Space filter**: Underground Guerrilla required (VC cannot Terror with Troops alone).
**Support shift**: Toward **Active Opposition** (different from NVA!).

```yaml
# terror-vc-profile — differences from NVA:
# Space filter: Underground Guerrilla required (no Troops alternative)
# Support shift: toward Active Opposition (delta: -1 always, not just from Support)
# Otherwise same structure

# Space filter (no Troops alternative):
filter:
  op: '>'
  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }] } } }
  right: 0

# Support shift in resolve-per-space:
# VC shifts 1 level toward Active Opposition (always, regardless of current level)
- shiftMarker: { space: $space, marker: supportOpposition, delta: -1 }
```

## Testing Requirements

### Per-Profile Unit Tests

For each of the 16 profiles, minimum test coverage:
1. Single-space operation with minimal state — correct effects
2. Multi-space operation with cost tracking (where applicable)
3. Edge case: insufficient resources, no valid spaces
4. Free operation variant (per-space cost skipped, exceptions honored)
5. Limited operation variant (max 1 space)

### Operation-Specific Test Scenarios

| Test | Profile | Verifies |
|------|---------|----------|
| US Train places Irregulars | train-us | Irregular placement from Available |
| US Train at Base places ARVN cubes, costs 3 | train-us | ARVN placement, cost only when ARVN placed |
| US Train Pacification needs US piece not Troops+Police | train-us | Correct US Pacify prerequisites |
| ARVN Train Pacification needs Troops AND Police | train-arvn | Correct ARVN Pacify prerequisites |
| ARVN Train replace cubes with Base | train-arvn | Base-building sub-action, stacking check |
| US Patrol costs 0 | patrol-us | No resource deduction |
| ARVN Patrol costs 3 total | patrol-arvn | Single upfront cost, not per-space |
| Patrol free Assault in 1 LoC | patrol-us | Assault effects applied at no cost |
| US Sweep costs 0 | sweep-us | No resource deduction |
| Sweep activation counts cubes + SF | sweep-us | Irregulars counted for US |
| Sweep Jungle halves activation | sweep-arvn | 1 per 2 sweepers in Jungle |
| US Assault with Base: 2× damage | assault-us | Correct damage multiplier |
| US Assault Highland no Base: half damage | assault-us | floor(troops/2) |
| ARVN Assault Province: Troops only | assault-arvn | Police excluded in Provinces |
| US Assault + ARVN follow-up | assault-us | 3 extra Resources, ARVN formula |
| Base removed: +6 Aid | assault-us/arvn | Aid tracking |
| Rally NVA without Base: mutually exclusive choice | rally-nva | Either guerrilla OR base, not both |
| Rally NVA with Base: limit = Trail + Bases | rally-nva | Placement limit formula |
| Rally VC with Base: flip Underground option | rally-vc | All active → underground |
| Trail improvement costs 2 even if free | rally-nva | Exception to free op cost skip |
| March LoC costs 0 | march-nva | No cost for LoC destinations |
| March activation: LoC+Support AND pieces>3 | march-nva | Correct activation condition |
| NVA Attack guerrilla mode: die roll | attack-nva | rollRandom, conditional damage |
| NVA Attack troops mode: no die roll | attack-nva | floor(troops/2) damage |
| Attack attrition per US piece removed | attack-nva | Attacker loses pieces to Available |
| VC Attack: guerrilla mode only | attack-vc | No troops-attack option |
| NVA Terror with Troops only (no guerrilla) | terror-nva | Valid space selection |
| NVA Terror shifts toward Neutral | terror-nva | Correct shift direction |
| VC Terror shifts toward Active Opposition | terror-vc | Correct shift direction |
| Terror/Sabotage idempotent | terror-nva | No marker on already-marked space |
| Terror marker supply limit | terror-nva | Stops at 15 markers |

### Integration Tests

- Multi-operation sequences (Train + Pacification)
- Operation + SA interleaving (compound move)
- Full game turn: card draw → eligibility → operation selection → execution

### Test Files

- Update: `test/integration/fitl-coin-operations.test.ts` — replace stubs with real profiles
- Update: `test/integration/fitl-insurgent-operations.test.ts` — replace stubs with real profiles
- New: `test/integration/fitl-removal-ordering.test.ts` — piece removal priority
- New: `test/integration/fitl-attack-die-roll.test.ts` — Attack die roll with seeded PRNG
- New: `test/integration/fitl-faction-costs.test.ts` — faction-specific cost models
- New: `test/integration/fitl-limited-ops.test.ts` — LimOp constraints
- New: `test/integration/fitl-patrol-sweep-movement.test.ts` — cube movement stages

## Acceptance Criteria

1. All 8 operations have 2 faction-specific profiles each (16 total) — no stubs remain
2. Each profile matches the FITL rules for its faction (verified by rule-by-rule checklist)
3. Attack uses `rollRandom` for die-roll damage (deterministic via seeded PRNG)
4. NVA Attack has Troops alternative (no die roll, different formula)
5. US and ARVN Assault have different damage formulas
6. US Patrol/Sweep cost 0; ARVN Patrol costs 3 total; ARVN Sweep costs 3 per space
7. Rally space filter is "without Support" (not "with Base or 2+ guerrillas")
8. Rally without-Base choices are mutually exclusive (place guerrilla OR replace with Base)
9. NVA Terror can use Troops alone; VC Terror requires Underground Guerrilla
10. NVA Terror shifts toward Neutral; VC Terror shifts toward Active Opposition
11. Terror/Sabotage markers check existing markers and 15-marker supply limit
12. Patrol includes free Assault in 1 LoC
13. March costs 0 for LoCs, 1 for Provinces/Cities
14. March activation uses correct condition (LoC or Support) AND (moving+COIN > 3)
15. Sweep activation counts cubes + Special Forces; Jungle terrain halves
16. All per-space costs respect `__freeOperation` guard (with documented exceptions)
17. Pacification and Trail improvement cost even when free op
18. US Joint Operations constraint enforced on US COIN profiles
19. Stacking (max 2 Bases) checked on all Base placement
20. `__actionClass` binding injection implemented and tested
21. All existing integration tests pass or are updated
22. Build passes (`npm run build`)
23. Typecheck passes (`npm run typecheck`)

## Dependencies

```
Spec 25a (Completed) ─┐
Spec 25b (Completed) ─┼─→ Spec 26 (THIS SPEC)
Spec 25c (Completed) ─┤
Spec 13a (Completed) ─┘
```

All prerequisites completed. No external blockers.

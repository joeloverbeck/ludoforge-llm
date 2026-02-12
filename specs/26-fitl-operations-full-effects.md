# Spec 26: FITL Operations Full Effects

**Status**: Draft (prerequisites in progress)
**Priority**: P0
**Complexity**: XL
**Dependencies**: Spec 23 (map + pieces), Spec 25 (derived values, stacking, dynamic sourcing, free ops), **Spec 25a (kernel operation primitives — COMPLETED)**, **Spec 25b (kernel decision sequence model — REQUIRED)**
**Estimated effort**: 5-7 days
**Source sections**: Brainstorming Sections 4.2 (items 1, 3-5), 5.3, 7.4, 7.6

## Overview

Replace the 8 stub operation profiles with complete effect resolution. Establish multi-space targeting, piece removal ordering, and the operation/SA interleaving architecture. This is the largest and highest-risk spec in the FITL implementation.

## Kernel Prerequisites

### Spec 25a (Completed)

All kernel primitive gaps identified during spec analysis have been implemented:

1. **Compound token filtering** -- `filter` on `tokensInZone`/`tokensInAdjacentZones` accepts array of predicates (AND-conjunction)
2. **Binding query** -- `{ query: 'binding', name: string }` in `OptionsQuery` enables `forEach` over `chooseN` selections
3. **setTokenProp** -- In-place token property mutation (e.g., flip guerrillas underground/active)
4. **rollRandom** -- Deterministic random number generation with let-like scoping
5. **Marker lattice** -- `setMarker`/`shiftMarker` effects with lattice validation, `markerState` reference, Zobrist hashing
6. **Typed OperationProfileDef** -- `legality`, `cost`, `targeting`, `resolution` use typed interfaces instead of Record<string, unknown>
7. **Compound Move** -- `Move.compound` field for SA interleaving with `before`/`during`/`after` timing

### Spec 25b (Required -- Decision Sequence Model)

Operations with variable-space targeting create combinatorial explosion in `legalMoves()` (Train on ~30 eligible spaces = 2^30 move variants). Spec 25b provides:

1. **`legalChoices()`** -- Given a partial move, return the next decision point with available options
2. **Template moves** -- `legalMoves()` returns template moves (actionId + empty params) for operations with profiles
3. **`validateMove()` relaxation** -- Operations validate incrementally via `legalChoices()` instead of exact match
4. **`freeOperation` binding** -- `move.freeOperation` injected into effect context bindings for per-space cost guards
5. **Agent updates** -- RandomAgent/GreedyAgent use `legalChoices()` to build moves incrementally

## Scope

### In Scope

- **4 COIN Operations**: Train (with Pacification sub-action), Patrol, Sweep, Assault
- **4 Insurgent Operations**: Rally, March, Attack, Terror
- **Multi-space operations**: Player selects N spaces via `legalChoices()` -> pays cost per space -> resolves per space
- **Piece removal ordering**: Troops first, Active Guerrillas next (attacker chooses faction order), Bases last (only when no Guerrillas remain). Underground Guerrillas protect Bases. Tunneled Bases require die roll.
- **US vs ARVN distinction**: Operations use `{ ref: 'actor' }` to determine which faction's pieces to place/move
- **Operation/SA interleaving** (Rule 4.1): Compound Move model with `Move.compound` field (Spec 25a)
- **Cost formulas**: Per-space resource costs inside resolution effects with `freeOperation` guard
- **Effect resolution**: Placement, movement, removal, activation, flipping per operation rules
- **Casualties tracking**: Attacker guerrilla losses go to casualties zone, not available/destroyed
- **Dynamic piece sourcing**: Rule 1.4.1 reusable macro for Available-or-map placement
- **Trail interactions**: NVA Rally Trail improvement, March movement through Laos/Cambodia
- **LoC-specific rules**: Patrol on LoCs, Terror/Sabotage distinction on LoCs

### Out of Scope

- Capability/momentum modifiers on operations (Spec 28 -- adds conditional branches)
- Non-player operation selection logic (Spec 30)
- Special activity effect implementations (Spec 27 -- but interleaving architecture is owned here)
- Event-granted free operations (Spec 25 provides the flag; Spec 29 encodes the events)

## Key Types & Interfaces

### Multi-Space Pattern (Decision Sequence Model)

Operations use `legalChoices()` (Spec 25b) for incremental space selection. The effect AST uses `chooseN` + `forEach`, but agents fill decisions incrementally rather than upfront:

```yaml
# Resolution stage 1: Player chooses target spaces via legalChoices()
- stage: select-spaces
  effects:
    - chooseN:
        bind: targetSpaces
        options: { query: zones, filter: { ... } }
        min: 1
        max: 99  # no hard limit; resource check is the real constraint

# Resolution stage 2: Pay cost and resolve per space
- stage: resolve-per-space
  effects:
    - forEach:
        bind: space
        over: { query: binding, name: targetSpaces }
        effects:
          # Per-space cost (skipped for free operations)
          - if:
              when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
              then:
                - addVar: { scope: global, var: arvnResources, delta: -3 }
          # Per-space resolution effects
          - # ... placement/movement/removal
```

**Note on `OperationCostDef`**: For multi-space operations, `OperationCostDef.spend` should be empty (no upfront lump cost). Per-space costs go inside resolution effects with the `freeOperation` guard. `OperationCostDef.validate` still checks minimum resources (can the player afford at least 1 space).

### Piece Removal Ordering Pattern (Reusable Macro)

Both Assault and Attack use the same removal priority logic. Define once as a reusable pattern:

```yaml
# Macro: piece-removal-ordering
# Params: space, damage (number of pieces to remove)
# Priority: 1) Enemy Troops, 2) Active Guerrillas (attacker chooses faction order),
#           3) Bases (only if no guerrillas remain), 4) Underground guerrillas immune
# Tunneled Bases: die roll (1-3 nothing, 4-6 remove tunnel marker)

# Step 1: Compute damage
- let:
    bind: damage
    value: { ... }  # operation-specific damage formula
    in:
      # Step 2: Remove enemy Troops
      - forEach:
          bind: target
          over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] }
          effects:
            - if:
                when: { op: '>', left: { ref: binding, name: damage }, right: 0 }
                then:
                  - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
                  - addVar: { scope: global, var: damage, delta: -1 }

      # Step 3: Attacker chooses faction order for Active Guerrillas
      - chooseOne:
          bind: targetFactionFirst
          options: { query: enums, values: ['NVA', 'VC'] }

      # Step 4: Remove Active Guerrillas of chosen faction first
      - forEach:
          bind: target
          over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: $targetFactionFirst }, { prop: activity, eq: active }] }
          effects:
            - if:
                when: { op: '>', left: { ref: binding, name: damage }, right: 0 }
                then:
                  - moveToken: { token: $target, from: $space, to: { concat: ['available:', $targetFactionFirst] } }
                  - addVar: { scope: global, var: damage, delta: -1 }

      # Step 5: Remove Active Guerrillas of other faction
      - let:
          bind: targetFactionSecond
          value: { if: { when: { op: '==', left: { ref: binding, name: targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
          in:
            - forEach:
                bind: target
                over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: $targetFactionSecond }, { prop: activity, eq: active }] }
                effects:
                  - if:
                      when: { op: '>', left: { ref: binding, name: damage }, right: 0 }
                      then:
                        - moveToken: { token: $target, from: $space, to: { concat: ['available:', $targetFactionSecond] } }
                        - addVar: { scope: global, var: damage, delta: -1 }

      # Step 6: Remove Bases only if no enemy guerrillas remain
      - let:
          bind: remainingGuerrillas
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: neq, value: { ref: actor } }] } } }
          in:
            - if:
                when: { op: '==', left: { ref: binding, name: remainingGuerrillas }, right: 0 }
                then:
                  - forEach:
                      bind: target
                      over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }, { prop: faction, op: neq, value: { ref: actor } }] }
                      effects:
                        - if:
                            when: { op: '>', left: { ref: binding, name: damage }, right: 0 }
                            then:
                              # Tunneled bases: die roll
                              - if:
                                  when: { op: '==', left: { ref: tokenProp, token: $target, prop: tunnel }, right: 'tunneled' }
                                  then:
                                    - rollRandom:
                                        bind: dieRoll
                                        min: 1
                                        max: 6
                                        in:
                                          - if:
                                              when: { op: '>=', left: { ref: binding, name: dieRoll }, right: 4 }
                                              then:
                                                - setTokenProp: { token: $target, prop: tunnel, value: 'untunneled' }
                                                - addVar: { scope: global, var: damage, delta: -1 }
                                  else:
                                    - moveToken: { token: $target, from: $space, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
                                    - addVar: { scope: global, var: damage, delta: -1 }
```

### Operation/SA Interleaving

**Resolved**: Compound Move model with `Move.compound` field (Spec 25a). Execution infrastructure (`applyMove` handling for `before`/`during`/`after` timing) is complete.

Compound move generation (pairing operations with SAs) is handled by reading `linkedSpecialActivityWindows` from `OperationProfileDef`. Since operations now use template moves (Spec 25b), compound SA selection happens after the agent completes the operation's space decisions -- the agent can then wrap the completed move in a compound move with the desired SA.

### US vs ARVN Distinction

COIN operations use `{ ref: 'actor' }` in token queries to determine which faction's pieces are placed/moved. A single operation profile per COIN operation handles both US and ARVN:

```yaml
# Train resolution: actor-aware placement
- forEach:
    bind: piece
    over: { query: tokensInZone, zone: { concat: ['available:', { ref: actor }] }, filter: [{ prop: type, eq: troops }] }
    limit: 6  # City limit
    effects:
      - moveToken: { token: $piece, from: { concat: ['available:', { ref: actor }] }, to: $space }
```

The operating faction (US or ARVN) is determined by `state.activePlayer`, which the kernel already threads through as `actorPlayer` in the effect context.

### Dynamic Piece Sourcing Macro (Rule 1.4.1)

All placement operations must follow Rule 1.4.1: take pieces from Available first; if none Available, may take from the map (EXCEPTION: US Troops and US Bases cannot be taken from the map).

```yaml
# Macro: place-from-available-or-map
# Params: pieceType, faction, targetSpace, limit
# Logic:
#   1. Count available pieces of desired type/faction
#   2. Place from Available up to limit
#   3. If need more and faction != US (or type is guerrilla/ranger):
#      place from map (choosing which map space to remove from)
#   4. US Troops and US Bases: Available only, never from map
```

This macro should be referenced by Train, Rally, and any other placement operations to avoid duplication.

## Standard Operation Encoding Template

Every operation follows this standard encoding pattern:

```yaml
operationProfiles:
  - id: <op>-profile
    actionId: <op>
    legality:
      when: <minimum resource check>
    cost:
      validate: <can afford at least 1 space>
      spend: []  # Per-space cost in resolution (NOT upfront)
    targeting: {}  # Space selection handled in resolution via chooseN
    resolution:
      - stage: select-spaces
        effects:
          - chooseN:
              bind: targetSpaces
              options: { query: zones, filter: { ... } }
              min: 1
              max: 99
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: space
              over: { query: binding, name: targetSpaces }
              effects:
                # Per-space cost with freeOperation guard
                - if:
                    when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: <resource>, delta: <-cost> }
                # Per-space resolution effects
                - # ...
      - stage: sub-action  # Optional (e.g., Pacification for Train)
        effects:
          - # ...
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [<sa-id>]
```

## Implementation Tasks

### Task 26.1: Compound Move Generation for SA Interleaving

**Prerequisite**: Spec 25b (template moves, `legalChoices()`).

With template moves, compound SA interleaving is handled as a post-decision wrapping step. After the agent fills all operation params via `legalChoices()`, it can optionally wrap the completed move in a `CompoundMovePayload`.

Key work:
- After an agent completes an operation move, enumerate legal SA moves
- Read `linkedSpecialActivityWindows` from the operation's profile to determine which SAs pair with it
- Combine the completed operation move with each legal SA at each valid timing (`before`/`during`/`after`)
- Limited Operations (1 space, no SA) must NOT have compound SA
- Free operations must NOT have compound SA

Modify:
- `src/kernel/legal-moves.ts` -- add helper to enumerate compound variants for a completed operation move

Tests:
- Compound variants include SA at before/during/after timings
- Free operations cannot have compound SA
- Limited operations do not get compound variants
- Non-compound moves still generated alongside compound variants

### Task 26.2: COIN Operations -- Train

**Rule 3.2.1**: Select any Cities/Provinces (no limit). Per space: place ARVN cubes (City: up to 6, Province: up to 2 from any single piece type) or Rangers (up to 2) from Available. Cost: 3 ARVN Resources per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: zones
            filter:
              op: or
              args:
                - { op: '==', left: { ref: zoneCount, zone: $zone }, right: 'city' }
                - { op: '==', left: { ref: zoneCount, zone: $zone }, right: 'province' }
          min: 1
          max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost (skipped for free ops)
            - if:
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }
            # Place troops/police from Available (actor-aware)
            # Uses dynamic piece sourcing macro (Rule 1.4.1)
            - forEach:
                bind: piece
                over:
                  query: tokensInZone
                  zone: { concat: ['available:', { ref: actor }] }
                  filter: [{ prop: type, eq: troops }]
                limit: 6  # City max; Province max = 2 (handled by stacking)
                effects:
                  - moveToken:
                      token: $piece
                      from: { concat: ['available:', { ref: actor }] }
                      to: $space

  - stage: pacification-option
    effects:
      # Pacification: in 1 Train space with ARVN Troops+Police and COIN Control
      - chooseN:
          bind: pacifySpaces
          options:
            query: binding
            name: targetSpaces
            # Filter: has ARVN troops, has ARVN police, COIN controlled
          min: 0
          max: 1
      - forEach:
          bind: pacSpace
          over: { query: binding, name: pacifySpaces }
          effects:
            - chooseOne:
                bind: pacLevels
                options: { query: intsInRange, min: 1, max: 2 }
            # Pacification costs resources EVEN during free operations (Rule 3.1.2 exception)
            - addVar: { scope: global, var: arvnResources, delta: { op: '*', left: { ref: binding, name: pacLevels }, right: -3 } }
            - shiftMarker: { space: $pacSpace, marker: supportOpposition, delta: { ref: binding, name: pacLevels } }
```

### Task 26.3: COIN Operations -- Patrol

**Rule 3.2.2**: Select any LoCs (no limit). Move cubes along adjacent LoCs. Activate Guerrillas in patrolled LoCs if cube count >= 2. Cost: 3 ARVN Resources per LoC.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-locs
    effects:
      - chooseN:
          bind: targetLoCs
          options:
            query: zones
            filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
          min: 1
          max: 99

  - stage: resolve-per-loc
    effects:
      - forEach:
          bind: loc
          over: { query: binding, name: targetLoCs }
          effects:
            # Per-LoC cost
            - if:
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }
            # Move cubes along LoC (actor-aware)
            # Activate guerrillas if cube count >= 2
            - let:
                bind: cubeCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $loc, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                in:
                  - if:
                      when: { op: '>=', left: { ref: binding, name: cubeCount }, right: 2 }
                      then:
                        - forEach:
                            bind: guerrilla
                            over: { query: tokensInZone, zone: $loc, filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }] }
                            effects:
                              - setTokenProp: { token: $guerrilla, prop: activity, value: active }
```

### Task 26.4: COIN Operations -- Sweep

**Rule 3.2.3**: Select any spaces (no limit). Move cubes into adjacent spaces. Activate 1 Underground Guerrilla per 2 cubes (Highland/Jungle) or per 1 cube (other terrain). Cost: 3 ARVN Resources per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options: { query: zones }
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
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }
            # Count sweeping cubes (actor-aware)
            - let:
                bind: cubeCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                in:
                  # Terrain-dependent activation ratio
                  # Highland/Jungle: 1 guerrilla per 2 cubes
                  # Other: 1 guerrilla per 1 cube
                  - let:
                      bind: activationLimit
                      value: # terrain check: if Highland/Jungle, floor(cubeCount/2), else cubeCount
                      in:
                        - forEach:
                            bind: guerrilla
                            over: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }] }
                            limit: { ref: binding, name: activationLimit }
                            effects:
                              - setTokenProp: { token: $guerrilla, prop: activity, value: active }
```

### Task 26.5: COIN Operations -- Assault

**Rule 3.2.4**: Select any spaces with COIN forces (no limit). Remove enemy pieces up to the number of Assaulting pieces. **Piece removal ordering** applies (reusable macro). Underground Guerrillas immune. Tunneled Bases: die roll (1-3 nothing, 4-6 remove). Cost: 3 ARVN Resources per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: zones
            filter:
              # Has COIN troops/police
              op: '>'
              left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
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
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }
            # Damage = number of COIN cubes in space
            # Apply piece-removal-ordering macro (see Key Types section)
            # ... (uses reusable removal ordering pattern)
```

### Task 26.6: Insurgent Operations -- Rally

**Rule 3.3.1**: Select spaces with faction's Base or 2+ faction's Guerrillas. Place Guerrillas from Available. If space has Base, may also: NVA place Troops, VC flip to Underground. Trail level affects NVA Rally (Trail >= 3: may improve Trail by 1). Cost: 1 Resource per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: zones
            filter:
              op: or
              args:
                # Has faction's base
                - { op: '>', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: base }] } } }, right: 0 }
                # Has 2+ faction's guerrillas
                - { op: '>=', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }] } } }, right: 2 }
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
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }
            # Place guerrillas from Available (dynamic sourcing macro)
            - forEach:
                bind: piece
                over: { query: tokensInZone, zone: { concat: ['available:', { ref: actor }] }, filter: [{ prop: type, eq: guerrilla }] }
                limit: 1  # 1 guerrilla per Rally space (without base)
                effects:
                  - moveToken: { token: $piece, from: { concat: ['available:', { ref: actor }] }, to: $space }
            # If space has base: additional placement options
            # NVA: may place Troops
            # VC: may flip guerrilla to Underground

  - stage: trail-improvement
    effects:
      # NVA only, Trail >= 3: may improve Trail by 1
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: actor }, right: 'NVA' }
              - { op: '>=', left: { ref: gvar, var: trail }, right: 3 }
          then:
            - chooseN:
                bind: improveTrail
                options: { query: enums, values: ['yes', 'no'] }
                min: 1
                max: 1
            - if:
                when: { op: '==', left: { ref: binding, name: improveTrail }, right: 'yes' }
                then:
                  - addVar: { scope: global, var: trail, delta: 1 }
```

### Task 26.7: Insurgent Operations -- March

**Rule 3.3.2**: Select Guerrillas/Troops to move into adjacent spaces. Guerrillas that March into spaces with enemy pieces become Active. Cost: 1 Resource per destination space. Trail >= 2 allows movement through Laos/Cambodia.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-destination-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options: { query: zones }
          min: 1
          max: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: destSpace
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-destination cost
            - if:
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }
            # Select pieces to move into this space (from adjacent)
            - chooseN:
                bind: movingPieces
                options:
                  query: tokensInAdjacentZones
                  zone: $destSpace
                  filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, op: in, value: ['guerrilla', 'troops'] }]
                min: 1
                max: 99
            - forEach:
                bind: piece
                over: { query: binding, name: movingPieces }
                effects:
                  - moveToken: { token: $piece, from: # source zone, to: $destSpace }
                  # Activation: guerrillas entering spaces with enemy pieces become Active
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '==', left: { ref: tokenProp, token: $piece, prop: type }, right: guerrilla }
                          - { op: '>', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $destSpace, filter: [{ prop: faction, op: neq, value: { ref: actor } }] } } }, right: 0 }
                      then:
                        - setTokenProp: { token: $piece, prop: activity, value: active }
```

### Task 26.8: Insurgent Operations -- Attack

**Rule 3.3.3**: Select spaces with Guerrillas. Remove 1 enemy piece per 2 Attacking Guerrillas (rounded down). **Piece removal ordering** applies (reusable macro). Attacker loses 1 Guerrilla to **Casualties** per Attack space (not Available, not destroyed). Cost: 1 Resource per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: zones
            filter:
              op: '>'
              left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }] } } }
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
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }
            # Damage = floor(attacking guerrillas / 2)
            - let:
                bind: damage
                value: { op: '/', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }] } } }, right: 2 }
                in:
                  # Apply piece-removal-ordering macro
                  # ... (uses reusable removal ordering pattern from Key Types section)

            # Attacker casualty: 1 guerrilla to Casualties zone
            - forEach:
                bind: casualty
                over: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }] }
                limit: 1
                effects:
                  - moveToken:
                      token: $casualty
                      from: $space
                      to: { concat: ['casualties:', { ref: actor }] }
```

### Task 26.9: Insurgent Operations -- Terror

**Rule 3.3.4**: Select spaces with Underground Guerrilla. Place Terror marker (or Sabotage on LoCs). Shift Support/Opposition 1 level toward Active Opposition. Flip 1 Guerrilla Active. Cost: 1 Resource per space.

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: zones
            filter:
              op: '>'
              left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }] } } }
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
                when: { op: '!=', left: { ref: binding, name: freeOperation }, right: true }
                then:
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }

            # LoC-specific: place Sabotage marker (different from Terror marker)
            - if:
                when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'loc' }
                then:
                  - setMarker: { space: $space, marker: sabotage, state: sabotaged }
                else:
                  # Non-LoC: place Terror marker, shift Support toward Active Opposition
                  - setMarker: { space: $space, marker: terror, state: terror }
                  - shiftMarker: { space: $space, marker: supportOpposition, delta: -1 }

            # Flip 1 Underground Guerrilla Active
            - forEach:
                bind: guerrilla
                over: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }] }
                limit: 1
                effects:
                  - setTokenProp: { token: $guerrilla, prop: activity, value: active }
```

### Task 26.10: Multi-Space Targeting Validation

Verify that the decision sequence model (Spec 25b) + resolution patterns work correctly for all 8 operations:
- Space selection via `legalChoices()` returns correct eligible spaces per operation
- Per-space cost deduction with `freeOperation` guard
- Per-space effect resolution produces correct state changes
- Resource exhaustion prevents additional space selection (enforced by `legalChoices()` domain)

### Task 26.11: Piece Removal Ordering Validation

Verify the reusable removal ordering pattern for Assault and Attack:
1. Enemy Troops removed first (decrement damage)
2. Attacker chooses faction order for Active Guerrillas via `chooseOne`
3. Active Guerrillas of chosen faction removed (decrement damage)
4. Active Guerrillas of other faction removed (decrement damage)
5. Bases only if no enemy Guerrillas remain
6. Underground Guerrillas immune (never targeted)
7. Tunneled Bases: `rollRandom` (1-3 nothing, 4-6 remove tunnel marker)

## Testing Requirements

### Per-Operation Unit Tests (BEFORE integration)

For each of the 8 operations:
1. Unit test: single-space operation with minimal state
2. Unit test: multi-space operation with cost tracking
3. Unit test: edge case (insufficient resources, no valid spaces)
4. Unit test: free operation variant (per-space cost skipped)

### Integration Tests

5. Multi-operation sequences (e.g., Train + Pacification in same turn)
6. Operation + SA interleaving (compound move with before/during/after timing)

### Specific Test Cases

- Each operation: given valid inputs, produces correct state changes
- Multi-space: cost deducted per space, effects applied per space
- Piece removal ordering: correct priority followed (reusable macro)
- Underground Guerrilla immunity in Assault/Attack
- Tunneled Base die roll (deterministic via seeded PRNG)
- Limited Operation: 1 space, no SA allowed
- Free operation: per-space cost skipped, but Pacification still costs (Rule 3.1.2)
- Casualties tracking: Attack attacker guerrilla goes to casualties zone
- LoC Terror: Sabotage marker placed instead of Terror marker
- Trail improvement: NVA Rally at Trail >= 3 optionally improves Trail
- March activation: Guerrillas entering enemy-occupied spaces become Active
- Patrol activation: Guerrillas in patrolled LoCs with >= 2 cubes become Active
- US vs ARVN: correct faction pieces placed based on acting player

### Test Files

- Update existing: `test/integration/fitl-coin-operations.test.ts` -- full effects replace stubs
- Update existing: `test/integration/fitl-insurgent-operations.test.ts` -- full effects replace stubs
- New: `test/integration/fitl-removal-ordering.test.ts` -- piece removal ordering
- New: `test/integration/fitl-multi-space-ops.test.ts` -- multi-space targeting
- New: `test/integration/fitl-casualties-tracking.test.ts` -- casualties zone usage

## Acceptance Criteria

1. All 8 operations have complete effect implementations -- no stubs remain
2. Multi-space targeting works via decision sequence model (`legalChoices()` + `chooseN` + `forEach`)
3. Piece removal follows ordering constraints for Assault and Attack with attacker faction choice
4. Operation/SA interleaving model complete (compound move generation + execution)
5. Underground Guerrillas immune to Assault/Attack removal
6. Tunneled Base die roll logic correct (deterministic via PRNG)
7. Per-space cost correctly skipped for free operations (except Pacification)
8. Casualties tracking: attacker guerrilla moved to casualties zone in Attack
9. LoC-specific rules: Sabotage on LoC Terror, Patrol activation on LoCs
10. US/ARVN distinction: operations use `{ ref: actor }` correctly
11. All existing integration tests pass or are updated
12. Build passes (`npm run build`)
13. Typecheck passes (`npm run typecheck`)

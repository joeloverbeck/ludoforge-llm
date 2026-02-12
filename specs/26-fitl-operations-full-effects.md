# Spec 26: FITL Operations Full Effects

**Status**: Draft (prerequisites in progress)
**Priority**: P0
**Complexity**: XL
**Dependencies**: Spec 23 (map + pieces), Spec 25 (derived values, stacking, dynamic sourcing, free ops), **Spec 25a (kernel operation primitives -- COMPLETED)**, **Spec 25b (kernel decision sequence model -- COMPLETED)**, **Spec 25c (extended kernel primitives -- REQUIRED)**, **Spec 13a (GameSpecDoc effect macros -- OPTIONAL, enables DRY patterns)**
**Estimated effort**: 6-8 days
**Source sections**: Brainstorming Sections 4.2 (items 1, 3-5), 5.3, 7.4, 7.6

## Overview

Replace the 8 stub operation profiles with complete effect resolution. Establish multi-space targeting, piece removal ordering, and the operation/SA interleaving architecture. This is the largest and highest-risk spec in the FITL implementation.

### Changes from Previous Draft

This revision fixes 4 correctness errors, fills 6 missing mechanics, addresses 2 architecture gaps, and applies 3 improvements identified during codebase analysis:

**P0 Fixes (Correctness)**:
1. **Damage tracking**: Replace `addVar: { scope: global, var: damage }` with cascading `let` bindings (no mutable global state)
2. **Division operator**: Attack/Sweep damage formulas now use `{ op: '/' }` (Spec 25c)
3. **March moveToken.from**: Uses `{ ref: tokenZone, token: $piece }` (Spec 25c) instead of comment placeholder
4. **Train zone filter**: Uses `{ ref: zoneProp }` instead of incorrect `{ ref: zoneCount }`

**P1 Fills (Missing Mechanics)**:
1. **Patrol cube movement**: Cube movement stage before activation
2. **Sweep cube movement**: Cube movement stage before activation
3. **Rally base-building**: Option to place Base when 2+ guerrillas, no faction base
4. **Rally with-Base extra placement**: NVA troops / VC underground flip
5. **Limited Operations modeling**: `__actionClass` binding + conditional `chooseN.max`
6. **US Joint Operations constraint**: Total Econ resource guard

**P2 Architecture**:
1. **Macro system** (Spec 13a): piece-removal-ordering and place-from-available-or-map macros
2. **tokenZone** (Spec 25c): Dynamic source zone reference for March/Patrol/Sweep

**P3 Improvements**:
1. **Train placement limits**: Terrain-conditional (city: 6, province: 2)
2. **Pacification exception**: Explicit note that Pacification costs resources even during free operations
3. **SA interleaving detail**: Expanded flow for compound move generation

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

### Spec 25b (Completed -- Decision Sequence Model)

1. **`legalChoices()`** -- Given a partial move, return the next decision point with available options
2. **Template moves** -- `legalMoves()` returns template moves (actionId + empty params) for operations with profiles
3. **`validateMove()` relaxation** -- Operations validate incrementally via `legalChoices()` instead of exact match
4. **`freeOperation` binding** -- `move.freeOperation` injected into effect context bindings for per-space cost guards
5. **Agent updates** -- RandomAgent/GreedyAgent use `legalChoices()` to build moves incrementally

### Spec 25c (Required -- Extended Kernel Primitives)

1. **Integer division** -- `{ op: '/' }` in ValueExpr for Attack damage `floor(guerrillas / 2)` and Sweep activation ratio `floor(cubes / 2)`
2. **tokenZone reference** -- `{ ref: 'tokenZone', token: TokenSel }` resolves to zone containing token, for March/Patrol/Sweep source lookups

### Spec 13a (Optional -- Effect Macros)

Parameterized compile-time macros for reusable effect patterns. If Spec 13a is not yet implemented, operations inline the full effect patterns directly (more verbose but functionally identical).

- **`piece-removal-ordering`** macro: Used by Assault (Task 26.5) and Attack (Task 26.8)
- **`place-from-available-or-map`** macro: Used by Train (Task 26.2) and Rally (Task 26.6)

## Scope

### In Scope

- **4 COIN Operations**: Train (with Pacification sub-action), Patrol, Sweep, Assault
- **4 Insurgent Operations**: Rally, March, Attack, Terror
- **Multi-space operations**: Player selects N spaces via `legalChoices()` -> pays cost per space -> resolves per space
- **Piece removal ordering**: Troops first, Active Guerrillas next (attacker chooses faction order), Bases last (only when no Active Guerrillas remain). Underground Guerrillas immune. Tunneled Bases require die roll.
- **US vs ARVN distinction**: Operations use `{ ref: 'actor' }` to determine which faction's pieces to place/move
- **Operation/SA interleaving** (Rule 4.1): Compound Move model with `Move.compound` field (Spec 25a)
- **Cost formulas**: Per-space resource costs inside resolution effects with `freeOperation` guard
- **Effect resolution**: Placement, movement, removal, activation, flipping per operation rules
- **Casualties tracking**: Attacker guerrilla losses go to casualties zone, not available/destroyed
- **Dynamic piece sourcing**: Rule 1.4.1 via `place-from-available-or-map` macro (or inline equivalent)
- **Trail interactions**: NVA Rally Trail improvement, March movement through Laos/Cambodia
- **LoC-specific rules**: Patrol on LoCs, Terror/Sabotage distinction on LoCs
- **Limited Operations**: 1 space max, no SA, via `__actionClass` binding
- **US Joint Operations constraint**: ARVN resources minus Total Econ (Rule 1.8.1)
- **Patrol/Sweep cube movement**: Cubes move from adjacent spaces before activation
- **Rally base-building**: Option to place Base instead of guerrillas when eligible
- **Rally with-Base extras**: NVA troops placement, VC underground flip

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
        max:
          if:
            when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
            then: 1
            else: 99

# Resolution stage 2: Pay cost and resolve per space
- stage: resolve-per-space
  effects:
    - forEach:
        bind: space
        over: { query: binding, name: targetSpaces }
        effects:
          # Per-space cost (skipped for free operations)
          - if:
              when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
              then:
                - addVar: { scope: global, var: arvnResources, delta: -3 }
          # Per-space resolution effects
          - # ... placement/movement/removal
```

**Limited Operations**: The `__actionClass` binding (injected by Spec 25b decision sequence alongside `__freeOperation`) controls `chooseN.max`. When `__actionClass == 'limitedOperation'`, max is 1. Additionally, limited operations exclude SA interleaving (no compound moves generated).

**Note on `OperationCostDef`**: For multi-space operations, `OperationCostDef.spend` should be empty (no upfront lump cost). Per-space costs go inside resolution effects with the `__freeOperation` guard. `OperationCostDef.validate` still checks minimum resources (can the player afford at least 1 space).

### US Joint Operations Constraint (Rule 1.8.1)

When the actor is US performing a COIN operation, the cost validation must additionally check that ARVN Resources minus Total Econ >= per-space cost. This constraint prevents US from spending ARVN's "base" resources:

```yaml
# Inside legality or cost.validate for COIN operations:
- if:
    when: { op: '==', left: { ref: actor }, right: 'US' }
    then:
      # arvnResources - totalEcon >= perSpaceCost
      - op: '>='
        left: { op: '-', left: { ref: gvar, var: arvnResources }, right: { ref: gvar, var: totalEcon } }
        right: 3  # per-space cost
```

### Piece Removal Ordering Pattern

Both Assault and Attack use the same removal priority logic. When Spec 13a is available, this is the `piece-removal-ordering` macro. Otherwise, it is inlined.

**Damage tracking via cascading `let` bindings** (no mutable global state):

```yaml
# Pattern: count-before → forEach with limit → count-after → compute remaining
- let:
    bind: troopsBefore
    value: { aggregate: { op: count, query: { ... enemy troops ... } } }
    in:
      - forEach:
          bind: target
          over: { query: tokensInZone, zone: $space, filter: [enemy troops] }
          limit: { ref: binding, name: damage }
          effects:
            - moveToken: { token: $target, from: $space, to: available }
      - let:
          bind: troopsAfter
          value: { aggregate: { op: count, query: { ... enemy troops ... } } }
          in:
            - let:
                bind: remainingDamage
                value: { op: '-', left: damage, right: { op: '-', left: troopsBefore, right: troopsAfter } }
                in:
                  # Continue with guerrillas using remainingDamage...
```

This pattern chains through: Troops → Active Guerrillas (faction 1) → Active Guerrillas (faction 2) → Bases (only if no Active Guerrillas remain). Each step re-queries the zone to compute actual removals via the `before - after` delta.

**Priority order**:
1. Enemy Troops (moved to Available)
2. Active Guerrillas — attacker chooses faction order via `chooseOne` (moved to Available)
3. Active Guerrillas of other faction (moved to Available)
4. Bases — only if no enemy Active Guerrillas remain in space
5. Underground Guerrillas — immune (never targeted; all filters require `activity: active`)
6. Tunneled Bases — `rollRandom` 1-6, result >= 4 removes tunnel marker (not the base)

### Operation/SA Interleaving

**Architecture** (Spec 25a compound move model, expanded here):

1. Agent receives template move from `legalMoves()` for an operation
2. Agent builds operation move incrementally via `legalChoices()` (select spaces, select pieces, etc.)
3. After the operation move is complete (`legalChoices().complete === true`), the agent may:
   a. Submit the operation move as-is (no SA)
   b. Wrap it in a `CompoundMovePayload` with a Special Activity
4. For compound wrapping, enumerate legal SA moves from `linkedSpecialActivityWindows`
5. Combine: `{ ...operationMove, compound: { specialActivity: saMove, timing: 'before'|'during'|'after' } }`

**Constraints**:
- Free operations: no compound SA allowed
- Limited operations (`__actionClass == 'limitedOperation'`): no compound SA allowed
- SA interleaving respect operation's `linkedSpecialActivityWindows` (from OperationProfileDef)

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

### Dynamic Piece Sourcing (Rule 1.4.1)

All placement operations must follow Rule 1.4.1: take pieces from Available first; if none Available, may take from the map (EXCEPTION: US Troops and US Bases cannot be taken from the map).

When Spec 13a is available, this is the `place-from-available-or-map` macro. Otherwise, inlined.

## Standard Operation Encoding Template

Every operation follows this standard encoding pattern:

```yaml
operationProfiles:
  - id: <op>-profile
    actionId: <op>
    legality:
      when: <minimum resource check + US Joint Ops guard if COIN>
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
              max:
                if:
                  when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
                  then: 1
                  else: 99
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: space
              over: { query: binding, name: targetSpaces }
              effects:
                # Per-space cost with __freeOperation guard
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
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

With template moves, compound SA interleaving is handled as a post-decision wrapping step.

**Detailed flow**:
1. `legalMoves()` emits template moves for each operation the active player can perform
2. Agent selects a template move (e.g., `{ actionId: 'train', params: {} }`)
3. Agent calls `legalChoices(state, def, partialMove)` repeatedly, filling in decisions:
   - First call: returns space selection options
   - Agent picks spaces → updates `partialMove.params.targetSpaces`
   - Next call: returns per-space decisions (piece selection, etc.)
   - Continue until `legalChoices().complete === true`
4. After operation move is complete, if the operation allows SA:
   - Check `__actionClass !== 'limitedOperation'` and `__freeOperation !== true`
   - Read `linkedSpecialActivityWindows` from OperationProfileDef
   - Enumerate legal SA moves for linked SAs
   - Generate compound variants: each legal SA at each valid timing
5. Agent chooses: plain operation move OR one of the compound variants

**Key work**:
- After an agent completes an operation move, enumerate legal SA moves
- Read `linkedSpecialActivityWindows` from the operation's profile to determine which SAs pair with it
- Combine the completed operation move with each legal SA at each valid timing (`before`/`during`/`after`)
- Limited Operations (1 space, no SA) must NOT have compound SA
- Free operations must NOT have compound SA

**Modify**:
- `src/kernel/legal-moves.ts` -- add helper to enumerate compound variants for a completed operation move

**Tests**:
- Compound variants include SA at before/during/after timings
- Free operations cannot have compound SA
- Limited operations do not get compound variants
- Non-compound moves still generated alongside compound variants

### Task 26.2: COIN Operations -- Train

**Rule 3.2.1**: Select any Cities/Provinces (no limit). Per space: place ARVN cubes (City: up to 6, Province: up to 2) or Rangers from Available. Cost: 3 ARVN Resources per space.

**Changes from previous draft**:
- Fixed zone filter: uses `{ ref: zoneProp, zone: $zone, prop: spaceType }` (not `{ ref: zoneCount }`)
- Terrain-conditional placement limits: city = 6, province = 2
- US Joint Operations guard in cost validation
- Pacification exception: costs resources EVEN during free operations (Rule 3.1.2)
- Uses `place-from-available-or-map` macro (or inline equivalent) for Rule 1.4.1

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
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
          min: 1
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: space
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-space cost (skipped for free ops)
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Terrain-conditional placement limit
            - let:
                bind: placementLimit
                value:
                  if:
                    when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'city' }
                    then: 6
                    else: 2
                in:
                  # Place troops/police from Available (actor-aware)
                  # Uses place-from-available-or-map macro (Rule 1.4.1)
                  - macro: place-from-available-or-map
                    args:
                      pieceType: troops
                      faction: { ref: actor }
                      targetSpace: $space
                      limit: { ref: binding, name: placementLimit }

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
            # NOTE: Pacification costs resources EVEN during free operations (Rule 3.1.2 exception).
            # This is intentional -- do NOT wrap in __freeOperation guard.
            - addVar: { scope: global, var: arvnResources, delta: { op: '*', left: { ref: binding, name: pacLevels }, right: -3 } }
            - shiftMarker: { space: $pacSpace, marker: supportOpposition, delta: { ref: binding, name: pacLevels } }
```

### Task 26.3: COIN Operations -- Patrol

**Rule 3.2.2**: Select any LoCs (no limit). Move cubes from adjacent spaces into the LoC. Activate Guerrillas in patrolled LoCs if cube count >= 2. Cost: 3 ARVN Resources per LoC.

**Changes from previous draft**:
- Added cube movement stage (was missing entirely)
- Uses `{ ref: tokenZone, token: $cube }` for moveToken.from (Spec 25c)

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
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

  - stage: resolve-per-loc
    effects:
      - forEach:
          bind: loc
          over: { query: binding, name: targetLoCs }
          effects:
            # Per-LoC cost
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                then:
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Step 1: Move cubes from adjacent spaces into the LoC
            - chooseN:
                bind: movingCubes
                options:
                  query: tokensInAdjacentZones
                  zone: $loc
                  filter:
                    - { prop: faction, eq: { ref: actor } }
                    - { prop: type, op: in, value: ['troops', 'police'] }
                min: 0
                max: 99
            - forEach:
                bind: cube
                over: { query: binding, name: movingCubes }
                effects:
                  - moveToken:
                      token: $cube
                      from: { ref: tokenZone, token: $cube }
                      to: $loc

            # Step 2: Activate guerrillas if cube count >= 2
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

**Changes from previous draft**:
- Added cube movement stage (was missing entirely)
- Uses `{ ref: tokenZone, token: $cube }` for moveToken.from (Spec 25c)
- Terrain-conditional activation uses integer division `{ op: '/' }` (Spec 25c)

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options: { query: zones }
          min: 1
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

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
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Step 1: Move cubes from adjacent spaces into this space
            - chooseN:
                bind: movingCubes
                options:
                  query: tokensInAdjacentZones
                  zone: $space
                  filter:
                    - { prop: faction, eq: { ref: actor } }
                    - { prop: type, op: in, value: ['troops', 'police'] }
                min: 0
                max: 99
            - forEach:
                bind: cube
                over: { query: binding, name: movingCubes }
                effects:
                  - moveToken:
                      token: $cube
                      from: { ref: tokenZone, token: $cube }
                      to: $space

            # Step 2: Count sweeping cubes (actor-aware)
            - let:
                bind: cubeCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                in:
                  # Terrain-dependent activation ratio
                  # Highland/Jungle: 1 guerrilla per 2 cubes (floor division)
                  # Other terrain: 1 guerrilla per 1 cube
                  - let:
                      bind: activationLimit
                      value:
                        if:
                          when:
                            op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'highland' }
                              - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'jungle' }
                          then: { op: '/', left: { ref: binding, name: cubeCount }, right: 2 }
                          else: { ref: binding, name: cubeCount }
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

**Changes from previous draft**:
- Damage tracking uses cascading `let` bindings (no `addVar: { var: damage }`)
- Uses `piece-removal-ordering` macro (Spec 13a) or inline equivalent

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
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

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
                  - addVar: { scope: global, var: arvnResources, delta: -3 }

            # Damage = number of COIN cubes in space
            # Apply piece-removal-ordering macro
            - macro: piece-removal-ordering
              args:
                space: $space
                damageExpr: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
```

If Spec 13a is not available, the macro invocation is replaced with the full inlined pattern from the "Piece Removal Ordering Pattern" section above.

### Task 26.6: Insurgent Operations -- Rally

**Rule 3.3.1**: Select spaces with faction's Base or 2+ faction's Guerrillas. Place Guerrillas from Available. If space has Base, may also: NVA place Troops, VC flip to Underground. Option to place Base (instead of guerrillas) when space has 2+ guerrillas and no faction base. Trail level affects NVA Rally (Trail >= 3: may improve Trail by 1). Cost: 1 Resource per space.

**Changes from previous draft**:
- Added base-building option (place Base when 2+ guerrillas, no faction base)
- Added with-Base extra placement: NVA troops from Available, VC flip guerrilla underground
- Uses `place-from-available-or-map` macro (or inline equivalent) for Rule 1.4.1

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
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

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
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }

            # Option A: Place guerrillas from Available (default)
            # Uses place-from-available-or-map macro (Rule 1.4.1)
            - macro: place-from-available-or-map
              args:
                pieceType: guerrilla
                faction: { ref: actor }
                targetSpace: $space
                limit: 1  # 1 guerrilla per Rally space (without base)

            # Option B: Place Base (if 2+ faction guerrillas AND no faction base in space)
            - if:
                when:
                  op: and
                  args:
                    - { op: '>=', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }] } } }, right: 2 }
                    - { op: '==', left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: base }] } } }, right: 0 }
                then:
                  - chooseN:
                      bind: placeBase
                      options: { query: enums, values: ['yes', 'no'] }
                      min: 1
                      max: 1
                  - if:
                      when: { op: '==', left: { ref: binding, name: placeBase }, right: 'yes' }
                      then:
                        - macro: place-from-available-or-map
                          args:
                            pieceType: base
                            faction: { ref: actor }
                            targetSpace: $space
                            limit: 1

            # With-Base bonus: if space has faction's base
            - if:
                when:
                  op: '>'
                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: base }] } } }
                  right: 0
                then:
                  # NVA: place Troops from Available (up to total guerrillas in space)
                  - if:
                      when: { op: '==', left: { ref: actor }, right: 'NVA' }
                      then:
                        - let:
                            bind: guerrillaCount
                            value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }] } } }
                            in:
                              - macro: place-from-available-or-map
                                args:
                                  pieceType: troops
                                  faction: 'NVA'
                                  targetSpace: $space
                                  limit: { ref: binding, name: guerrillaCount }

                  # VC: flip 1 Active Guerrilla to Underground
                  - if:
                      when: { op: '==', left: { ref: actor }, right: 'VC' }
                      then:
                        - forEach:
                            bind: guerrilla
                            over: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }] }
                            limit: 1
                            effects:
                              - setTokenProp: { token: $guerrilla, prop: activity, value: underground }

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

**Changes from previous draft**:
- `moveToken.from` uses `{ ref: tokenZone, token: $piece }` (Spec 25c) instead of comment placeholder

**Concrete resolution effect pattern**:

```yaml
resolution:
  - stage: select-destination-spaces
    effects:
      - chooseN:
          bind: targetSpaces
          options: { query: zones }
          min: 1
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

  - stage: resolve-per-space
    effects:
      - forEach:
          bind: destSpace
          over: { query: binding, name: targetSpaces }
          effects:
            # Per-destination cost
            - if:
                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
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
                  - moveToken:
                      token: $piece
                      from: { ref: tokenZone, token: $piece }
                      to: $destSpace

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

**Changes from previous draft**:
- Damage formula uses integer division `{ op: '/' }` (Spec 25c)
- Damage tracking uses cascading `let` bindings (no `addVar: { var: damage }`)
- Uses `piece-removal-ordering` macro (Spec 13a) or inline equivalent
- Casualties go to `casualties:<faction>` zone (confirmed correct destination)

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
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

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
                  - addVar: { scope: pvar, player: actor, var: resources, delta: -1 }

            # Damage = floor(active attacking guerrillas / 2)
            # Apply piece-removal-ordering macro
            - macro: piece-removal-ordering
              args:
                space: $space
                damageExpr:
                  op: '/'
                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: { ref: actor } }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }] } } }
                  right: 2

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

**No changes from previous draft** -- Terror was already correct.

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
          max:
            if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then: 1
              else: 99

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
- Per-space cost deduction with `__freeOperation` guard
- Per-space effect resolution produces correct state changes
- Resource exhaustion prevents additional space selection (enforced by `legalChoices()` domain)
- Limited Operations respect `chooseN.max: 1` when `__actionClass == 'limitedOperation'`

### Task 26.11: Piece Removal Ordering Validation

Verify the reusable removal ordering pattern for Assault and Attack:
1. Enemy Troops removed first (decrement remaining damage via cascading let)
2. Attacker chooses faction order for Active Guerrillas via `chooseOne`
3. Active Guerrillas of chosen faction removed (decrement remaining damage)
4. Active Guerrillas of other faction removed (decrement remaining damage)
5. Bases only if no enemy Active Guerrillas remain
6. Underground Guerrillas immune (never targeted)
7. Tunneled Bases: `rollRandom` (1-3 nothing, 4-6 remove tunnel marker)

## Testing Requirements

### Per-Operation Unit Tests (BEFORE integration)

For each of the 8 operations:
1. Unit test: single-space operation with minimal state
2. Unit test: multi-space operation with cost tracking
3. Unit test: edge case (insufficient resources, no valid spaces)
4. Unit test: free operation variant (per-space cost skipped)
5. Unit test: limited operation variant (max 1 space)

### Integration Tests

5. Multi-operation sequences (e.g., Train + Pacification in same turn)
6. Operation + SA interleaving (compound move with before/during/after timing)

### Specific Test Cases

- Each operation: given valid inputs, produces correct state changes
- Multi-space: cost deducted per space, effects applied per space
- Piece removal ordering: correct priority followed (cascading let, no mutable damage)
- Underground Guerrilla immunity in Assault/Attack
- Tunneled Base die roll (deterministic via seeded PRNG)
- Limited Operation: 1 space max, no SA allowed (via `__actionClass` binding)
- Free operation: per-space cost skipped, but Pacification still costs (Rule 3.1.2)
- Casualties tracking: Attack attacker guerrilla goes to casualties zone
- LoC Terror: Sabotage marker placed instead of Terror marker
- Trail improvement: NVA Rally at Trail >= 3 optionally improves Trail
- March activation: Guerrillas entering enemy-occupied spaces become Active
- March uses `tokenZone` for dynamic source zone reference
- Patrol cube movement: cubes move from adjacent spaces before activation
- Patrol activation: Guerrillas in patrolled LoCs with >= 2 cubes become Active
- Sweep cube movement: cubes move from adjacent spaces before activation
- Sweep activation: terrain-conditional ratio using integer division
- Rally base-building: option presented when 2+ guerrillas, no faction base
- Rally with-Base: NVA places troops, VC flips guerrilla underground
- US vs ARVN: correct faction pieces placed based on acting player
- US Joint Operations: ARVN resources minus Total Econ constraint enforced

### Test Files

- Update existing: `test/integration/fitl-coin-operations.test.ts` -- full effects replace stubs
- Update existing: `test/integration/fitl-insurgent-operations.test.ts` -- full effects replace stubs
- New: `test/integration/fitl-removal-ordering.test.ts` -- piece removal ordering
- New: `test/integration/fitl-multi-space-ops.test.ts` -- multi-space targeting
- New: `test/integration/fitl-casualties-tracking.test.ts` -- casualties zone usage
- New: `test/integration/fitl-limited-ops.test.ts` -- limited operation constraints
- New: `test/integration/fitl-cube-movement.test.ts` -- Patrol/Sweep cube movement

## Acceptance Criteria

1. All 8 operations have complete effect implementations -- no stubs remain
2. Multi-space targeting works via decision sequence model (`legalChoices()` + `chooseN` + `forEach`)
3. Piece removal follows ordering constraints using cascading `let` bindings (no mutable damage counter)
4. Operation/SA interleaving model complete (compound move generation + execution)
5. Underground Guerrillas immune to Assault/Attack removal
6. Tunneled Base die roll logic correct (deterministic via PRNG)
7. Per-space cost correctly skipped for free operations (except Pacification)
8. Casualties tracking: attacker guerrilla moved to casualties zone in Attack
9. LoC-specific rules: Sabotage on LoC Terror, Patrol activation on LoCs
10. US/ARVN distinction: operations use `{ ref: actor }` correctly
11. US Joint Operations constraint enforced (ARVN resources - Total Econ >= cost)
12. Limited Operations: max 1 space, no SA compound moves
13. Patrol/Sweep include cube movement stage from adjacent spaces
14. Rally includes base-building option and with-Base extras (NVA troops, VC flip)
15. Train uses terrain-conditional placement limits (city: 6, province: 2)
16. March uses `tokenZone` for source zone reference
17. Sweep uses integer division for Highland/Jungle activation ratio
18. All existing integration tests pass or are updated
19. Build passes (`npm run build`)
20. Typecheck passes (`npm run typecheck`)

## Updated Dependencies

```
Spec 25b (Decision Sequence Model) -- COMPLETED
    |
    v
Spec 25c (Extended Primitives) --- NEW, REQUIRED
    |
    +---> Spec 13a (Effect Macros) --- NEW, OPTIONAL
    |         |
    v         v
Spec 26 (Operations Full Effects) --- THIS SPEC (REVISED)
```

Spec 13a is optional: if not yet implemented, operations inline the macro patterns directly. This adds ~200 lines of duplicated YAML but is functionally identical. The macros can be factored out later when Spec 13a lands.

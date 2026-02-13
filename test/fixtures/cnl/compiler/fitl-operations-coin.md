# FITL COIN Operations Fixture

```yaml
metadata:
  id: fitl-operations-coin
  players:
    min: 2
    max: 2
globalVars:
  - name: coinResources
    type: int
    init: 10
    min: 0
    max: 50
  - name: trainCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: patrolCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: sweepCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: assaultCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: aid
    type: int
    init: 15
    min: 0
    max: 75
  - name: fallbackUsed
    type: int
    init: 0
    min: 0
    max: 200
  - name: terrorSabotageMarkersPlaced
    type: int
    init: 0
    min: 0
    max: 15
  - name: arvnResources
    type: int
    init: 30
    min: 0
    max: 75
  - name: nvaResources
    type: int
    init: 10
    min: 0
    max: 75
  - name: vcResources
    type: int
    init: 5
    min: 0
    max: 75
  - name: trail
    type: int
    init: 1
    min: 0
    max: 4
  - name: patronage
    type: int
    init: 15
    min: 0
    max: 75
  - name: totalEcon
    type: int
    init: 10
    min: 0
    max: 75
effectMacros:
  # Base removal ordering macro (shared dependency)
  - id: piece-removal-ordering
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
      - { name: actorFaction, type: string }
    effects:
      - let:
          bind: $damage
          value: { param: damageExpr }
          in:
            - forEach:
                bind: $target
                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { param: actorFaction } }] }
                limit: { ref: binding, name: $damage }
                effects:
                  - moveToken: { token: $target, from: { param: space }, to: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }] } }
                countBind: $troopsRemoved
                in:
                  - let:
                      bind: $remainingDamage
                      value: { op: '-', left: { ref: binding, name: $damage }, right: { ref: binding, name: $troopsRemoved } }
                      in:
                        - chooseOne:
                            bind: $targetFactionFirst
                            options: { query: enums, values: ['NVA', 'VC'] }
                        - forEach:
                            bind: $target2
                            over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionFirst } }, { prop: activity, eq: active }] }
                            limit: { ref: binding, name: $remainingDamage }
                            effects:
                              - moveToken: { token: $target2, from: { param: space }, to: { concat: ['available-', { ref: binding, name: $targetFactionFirst }] } }
                            countBind: $guerrillas1Removed
                            in:
                              - let:
                                  bind: $remainingDamage2
                                  value: { op: '-', left: { ref: binding, name: $remainingDamage }, right: { ref: binding, name: $guerrillas1Removed } }
                                  in:
                                    - let:
                                        bind: $targetFactionSecond
                                        value: { if: { when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
                                        in:
                                          - forEach:
                                              bind: $target3
                                              over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: activity, eq: active }] }
                                              limit: { ref: binding, name: $remainingDamage2 }
                                              effects:
                                                - moveToken: { token: $target3, from: { param: space }, to: { concat: ['available-', { ref: binding, name: $targetFactionSecond }] } }
                                          - let:
                                              bind: $guerrillasRemaining
                                              value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: neq, value: { param: actorFaction } }, { prop: activity, eq: active }] } } }
                                              in:
                                                - if:
                                                    when: { op: '==', left: { ref: binding, name: $guerrillasRemaining }, right: 0 }
                                                    then:
                                                      - forEach:
                                                          bind: $baseTarget
                                                          over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: neq, value: { param: actorFaction } }] }
                                                          effects:
                                                            - if:
                                                                when: { op: '==', left: { ref: tokenProp, token: $baseTarget, prop: tunnel }, right: 'tunneled' }
                                                                then:
                                                                  - rollRandom:
                                                                      bind: $dieRoll
                                                                      min: 1
                                                                      max: 6
                                                                      in:
                                                                        - if:
                                                                            when: { op: '>=', left: { ref: binding, name: $dieRoll }, right: 4 }
                                                                            then:
                                                                              - setTokenProp: { token: $baseTarget, prop: tunnel, value: 'untunneled' }
                                                                else:
                                                                  - moveToken: { token: $baseTarget, from: { param: space }, to: { concat: ['available-', { ref: tokenProp, token: $baseTarget, prop: faction }] } }

  # COIN Assault removal with +6 Aid per base removed
  - id: coin-assault-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
      - { name: actorFaction, type: string }
    effects:
      - let:
          bind: $basesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
                actorFaction: { param: actorFaction }
            - let:
                bind: $basesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                in:
                  - let:
                      bind: $basesRemoved
                      value: { op: '-', left: { ref: binding, name: $basesBefore }, right: { ref: binding, name: $basesAfter } }
                      in:
                        - if:
                            when: { op: '>', left: { ref: binding, name: $basesRemoved }, right: 0 }
                            then:
                              - addVar:
                                  scope: global
                                  var: aid
                                  delta: { op: '*', left: { ref: binding, name: $basesRemoved }, right: 6 }

  # Per-province/city cost (0 for LoCs)
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

  # Dynamic piece sourcing (Rule 1.4.1): place from Available, then from map if not US
  - id: place-from-available-or-map
    params:
      - { name: pieceType, type: string }
      - { name: faction, type: string }
      - { name: targetSpace, type: string }
      - { name: maxPieces, type: value }
    effects:
      - forEach:
          bind: $piece
          over:
            query: tokensInZone
            zone: { concat: ['available-', { param: faction }] }
            filter: [{ prop: type, eq: { param: pieceType } }]
          limit: { param: maxPieces }
          effects:
            - moveToken:
                token: $piece
                from: { concat: ['available-', { param: faction }] }
                to: { param: targetSpace }
          countBind: $placed
          in:
            - let:
                bind: $remaining
                value: { op: '-', left: { param: maxPieces }, right: { ref: binding, name: $placed } }
                in:
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '!=', left: { param: faction }, right: 'US' }
                          - { op: '>', left: { ref: binding, name: $remaining }, right: 0 }
                      then:
                        - chooseN:
                            bind: $sourceSpaces
                            options:
                              query: zones
                              filter:
                                op: '>'
                                left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }] } } }
                                right: 0
                            min: 0
                            max: 99
                        - forEach:
                            bind: $srcSpace
                            over: { query: binding, name: $sourceSpaces }
                            effects:
                              - forEach:
                                  bind: $mapPiece
                                  over:
                                    query: tokensInZone
                                    zone: $srcSpace
                                    filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }]
                                  limit: 1
                                  effects:
                                    - moveToken:
                                        token: $mapPiece
                                        from: $srcSpace
                                        to: { param: targetSpace }

  # Sweep activation: cubes + SF, jungle halves count
  - id: sweep-activation
    params:
      - { name: space, type: string }
      - { name: cubeFaction, type: string }
      - { name: sfType, type: string }
    effects:
      - let:
          bind: $cubeCount
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
          in:
            - let:
                bind: $sfCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, eq: { param: sfType } }] } } }
                in:
                  - let:
                      bind: $totalSweepers
                      value: { op: '+', left: { ref: binding, name: $cubeCount }, right: { ref: binding, name: $sfCount } }
                      in:
                        - let:
                            bind: $activationLimit
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

zones:
  - id: board
    owner: none
    visibility: public
    ordering: set
  - id: available-US
    owner: none
    visibility: public
    ordering: set
  - id: available-ARVN
    owner: none
    visibility: public
    ordering: set
  - id: available-NVA
    owner: none
    visibility: public
    ordering: set
  - id: available-VC
    owner: none
    visibility: public
    ordering: set
turnStructure:
  phases:
    - id: main
  activePlayerOrder: roundRobin
actions:
  - id: train
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: fallbackUsed
          delta: 100
    limits: []
  - id: patrol
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: fallbackUsed
          delta: 100
    limits: []
  - id: sweep
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: fallbackUsed
          delta: 100
    limits: []
  - id: assault
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: fallbackUsed
          delta: 100
    limits: []
operationProfiles:
  - id: train-us-profile
    actionId: train
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
    legality:
      when: true
    cost:
      spend: []
    targeting: {}
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
    partialExecution:
      mode: forbid
  - id: train-arvn-profile
    actionId: train
    applicability: { op: '==', left: { ref: activePlayer }, right: '1' }
    legality:
      when: true
    cost:
      spend: []
    targeting: {}
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
                            - moveToken: { token: $cube, from: $subSpace, to: available-ARVN }
                      # Place 1 ARVN Base
                      - macro: place-from-available-or-map
                        args:
                          pieceType: base
                          faction: 'ARVN'
                          targetSpace: $subSpace
                          maxPieces: 1
    partialExecution:
      mode: forbid
  - id: patrol-us-profile
    actionId: patrol
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
    legality:
      when: true
    cost:
      spend: []
    targeting: {}
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
              bind: $actLoc
              over: { query: binding, name: targetLoCs }
              effects:
                - let:
                    bind: $usCubeCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $actLoc, filter: [{ prop: faction, eq: 'US' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                    in:
                      - forEach:
                          bind: $guerrilla
                          over:
                            query: tokensInZone
                            zone: $actLoc
                            filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                          limit: { ref: binding, name: $usCubeCount }
                          effects:
                            - setTokenProp: { token: $guerrilla, prop: activity, value: active }

      - stage: free-assault
        effects:
          - chooseN:
              bind: $assaultLoCs
              options: { query: binding, name: targetLoCs }
              min: 0
              max: 1
          - forEach:
              bind: $assaultLoC
              over: { query: binding, name: $assaultLoCs }
              effects:
                - let:
                    bind: $usTroops
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                    in:
                      - let:
                          bind: $hasUSBase
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                          in:
                            - let:
                                bind: $patrolDmg
                                value:
                                  if:
                                    when: { op: '>', left: { ref: binding, name: $hasUSBase }, right: 0 }
                                    then: { op: '*', left: { ref: binding, name: $usTroops }, right: 2 }
                                    else: { ref: binding, name: $usTroops }
                                in:
                                  - macro: coin-assault-removal-order
                                    args:
                                      space: $assaultLoC
                                      damageExpr: { ref: binding, name: $patrolDmg }
                                      actorFaction: 'US'
    partialExecution:
      mode: forbid
  - id: sweep-profile
    actionId: sweep
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: coinResources
            delta: -1
    targeting:
      select: allEligible
      terrainFilter: [lowland, urban]
    resolution:
      - stage: sweep-resolve
        effects:
          - addVar:
              scope: global
              var: sweepCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: assault-profile
    actionId: assault
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 3
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 3
      spend:
        - addVar:
            scope: global
            var: coinResources
            delta: -3
    targeting:
      select: exactlyN
      count: 1
      tieBreak: basesLast
    resolution:
      - stage: assault-resolve
        effects:
          - addVar:
              scope: global
              var: assaultCount
              delta: 1
    partialExecution:
      mode: forbid
endConditions:
  - when:
      op: "=="
      left: 1
      right: 2
    result:
      type: draw
```

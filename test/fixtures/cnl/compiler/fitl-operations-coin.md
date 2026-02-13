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
    effects:
      - let:
          bind: damage
          value: { param: damageExpr }
          in:
            - forEach:
                bind: $target
                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: troops }, { prop: faction, op: neq, value: { ref: actor } }] }
                limit: { ref: binding, name: $damage }
                effects:
                  - moveToken: { token: $target, from: { param: space }, to: { concat: ['available:', { ref: tokenProp, token: $target, prop: faction }] } }
                countBind: $troopsRemoved
                in:
                  - let:
                      bind: remainingDamage
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
                              - moveToken: { token: $target2, from: { param: space }, to: { concat: ['available:', { ref: binding, name: $targetFactionFirst }] } }
                            countBind: $guerrillas1Removed
                            in:
                              - let:
                                  bind: remainingDamage2
                                  value: { op: '-', left: { ref: binding, name: $remainingDamage }, right: { ref: binding, name: $guerrillas1Removed } }
                                  in:
                                    - let:
                                        bind: targetFactionSecond
                                        value: { if: { when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
                                        in:
                                          - forEach:
                                              bind: $target3
                                              over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: activity, eq: active }] }
                                              limit: { ref: binding, name: $remainingDamage2 }
                                              effects:
                                                - moveToken: { token: $target3, from: { param: space }, to: { concat: ['available:', { ref: binding, name: $targetFactionSecond }] } }
                                          - let:
                                              bind: guerrillasRemaining
                                              value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: neq, value: { ref: actor } }, { prop: activity, eq: active }] } } }
                                              in:
                                                - if:
                                                    when: { op: '==', left: { ref: binding, name: $guerrillasRemaining }, right: 0 }
                                                    then:
                                                      - forEach:
                                                          bind: $baseTarget
                                                          over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: neq, value: { ref: actor } }] }
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
                                                                  - moveToken: { token: $baseTarget, from: { param: space }, to: { concat: ['available:', { ref: tokenProp, token: $baseTarget, prop: faction }] } }

  # COIN Assault removal with +6 Aid per base removed
  - id: coin-assault-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
    effects:
      - let:
          bind: basesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
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

  # Sweep activation: cubes + SF, jungle halves count
  - id: sweep-activation
    params:
      - { name: space, type: string }
      - { name: cubeFaction, type: string }
      - { name: sfType, type: string }
    effects:
      - let:
          bind: cubeCount
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
          in:
            - let:
                bind: sfCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, eq: { param: sfType } }] } } }
                in:
                  - let:
                      bind: totalSweepers
                      value: { op: '+', left: { ref: binding, name: $cubeCount }, right: { ref: binding, name: $sfCount } }
                      in:
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

zones:
  - id: board:none
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
  - id: train-profile
    actionId: train
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
      select: upToN
      max: 2
      tieBreak: lexicographicSpaceId
    resolution:
      - stage: train-resolve
        effects:
          - addVar:
              scope: global
              var: trainCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: patrol-profile
    actionId: patrol
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 2
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: coinResources
        right: 2
      spend:
        - addVar:
            scope: global
            var: coinResources
            delta: -2
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    resolution:
      - stage: patrol-resolve
        effects:
          - addVar:
              scope: global
              var: patrolCount
              delta: 1
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

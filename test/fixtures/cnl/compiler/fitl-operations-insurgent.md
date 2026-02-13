# FITL Insurgent Operations Fixture

```yaml
metadata:
  id: fitl-operations-insurgent
  players:
    min: 2
    max: 2
globalVars:
  - name: insurgentResources
    type: int
    init: 7
    min: 0
    max: 50
  - name: rallyCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: marchCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: attackCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: terrorCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: fallbackUsed
    type: int
    init: 0
    min: 0
    max: 200
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

  # Insurgent Attack removal with attrition
  - id: insurgent-attack-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
      - { name: attackerFaction, type: string }
    effects:
      - let:
          bind: usPiecesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
            - let:
                bind: usPiecesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
                in:
                  - let:
                      bind: usRemoved
                      value: { op: '-', left: { ref: binding, name: $usPiecesBefore }, right: { ref: binding, name: $usPiecesAfter } }
                      in:
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
  - id: rally
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
  - id: march
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
  - id: attack
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
  - id: terror
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
  - id: rally-profile
    actionId: rally
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -1
    targeting:
      select: upToN
      max: 2
      placementPolicy: placeUndergroundFirst
    resolution:
      - stage: rally-resolve
        effects:
          - addVar:
              scope: global
              var: rallyCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: march-profile
    actionId: march
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -1
    targeting:
      select: allEligible
      movementOrder: deterministicSpaceOrder
      activationPolicy: activateWhenEnteringCOINControl
    resolution:
      - stage: march-resolve
        effects:
          - addVar:
              scope: global
              var: marchCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: attack-profile
    actionId: attack
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 0
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 2
      spend:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -2
    targeting:
      select: exactlyN
      count: 1
      removalPolicy:
        tieBreak: basesLast
        tunnelConstraint: removeUntunneledBeforeTunneled
    resolution:
      - stage: attack-resolve
        effects:
          - addVar:
              scope: global
              var: attackCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: terror-profile
    actionId: terror
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -1
    targeting:
      select: upToN
      max: 2
      order: lexicographicSpaceId
      supportShiftPolicy: setOppositionTowardActive
    resolution:
      - stage: terror-resolve
        effects:
          - addVar:
              scope: global
              var: terrorCount
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
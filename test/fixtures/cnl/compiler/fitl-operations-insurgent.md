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
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

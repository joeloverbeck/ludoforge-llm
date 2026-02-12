# FITL Joint Operations Fixture

Synthetic game spec for testing Joint Operation Cost Constraint (Rule 1.8.1):
US operations spend ARVN Resources but cannot reduce them below Total Econ.

Players: 0 = US, 1 = ARVN

```yaml
metadata:
  id: fitl-joint-operations
  players:
    min: 2
    max: 2
perPlayerVars:
  - name: resources
    type: int
    init: 20
    min: 0
    max: 50
globalVars:
  - name: totalEcon
    type: int
    init: 10
    min: 0
    max: 50
  - name: usOpCount
    type: int
    init: 0
    min: 0
    max: 50
  - name: arvnOpCount
    type: int
    init: 0
    min: 0
    max: 50
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
  - id: usOp
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
  - id: arvnOp
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
  - id: us-op-profile
    actionId: usOp
    legality:
      when: null
    cost:
      validate:
        op: ">="
        left:
          op: "-"
          left:
            ref: pvar
            player:
              id: 1
            var: resources
          right: 5
        right:
          ref: gvar
          var: totalEcon
      spend:
        - addVar:
            scope: pvar
            player:
              id: 1
            var: resources
            delta: -5
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    resolution:
      - stage: us-resolve
        effects:
          - addVar:
              scope: global
              var: usOpCount
              delta: 1
    partialExecution:
      mode: forbid
  - id: arvn-op-profile
    actionId: arvnOp
    legality:
      when: null
    cost:
      validate:
        op: ">="
        left:
          ref: pvar
          player: active
          var: resources
        right: 5
      spend:
        - addVar:
            scope: pvar
            player: active
            var: resources
            delta: -5
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    resolution:
      - stage: arvn-resolve
        effects:
          - addVar:
              scope: global
              var: arvnOpCount
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

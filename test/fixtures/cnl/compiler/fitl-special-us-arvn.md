# FITL US/ARVN Special Activities Fixture

```yaml
metadata:
  id: fitl-special-us-arvn
  players:
    min: 2
    max: 2
globalVars:
  - name: usResources
    type: int
    init: 7
    min: 0
    max: 50
  - name: arvnResources
    type: int
    init: 7
    min: 0
    max: 50
  - name: adviseCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: airLiftCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: airStrikeCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: governCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: transportCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: raidCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: fallbackUsed
    type: int
    init: 0
    min: 0
    max: 300
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
  - id: advise
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
  - id: airLift
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
  - id: airStrike
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
  - id: govern
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
  - id: transport
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
  - id: raid
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
  - id: advise-profile
    actionId: advise
    legality:
      when:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
    cost:
      validate:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
      spend:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: upToN
      max: 2
    resolution:
      - stage: advise-resolve
        effects:
          - addVar:
              scope: global
              var: adviseCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [us-special-window]
  - id: air-lift-profile
    actionId: airLift
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: usResources
            delta: -1
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    resolution:
      - stage: air-lift-resolve
        effects:
          - addVar:
              scope: global
              var: airLiftCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [us-special-window]
  - id: air-strike-profile
    actionId: airStrike
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 2
    cost:
      validate:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
      spend:
        - addVar:
            scope: global
            var: usResources
            delta: -2
    targeting:
      select: exactlyN
      count: 1
      tieBreak: basesLast
    resolution:
      - stage: air-strike-resolve
        effects:
          - addVar:
              scope: global
              var: airStrikeCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [us-special-window]
  - id: govern-profile
    actionId: govern
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: upToN
      max: 1
    resolution:
      - stage: govern-resolve
        effects:
          - addVar:
              scope: global
              var: governCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [arvn-special-window]
  - id: transport-profile
    actionId: transport
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: allEligible
      movementOrder: deterministicSpaceOrder
    resolution:
      - stage: transport-resolve
        effects:
          - addVar:
              scope: global
              var: transportCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [arvn-special-window]
  - id: raid-profile
    actionId: raid
    legality:
      when:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
    cost:
      validate:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
      spend:
        - addVar:
            scope: global
            var: arvnResources
            delta: -2
    targeting:
      select: upToN
      max: 2
      tieBreak: lexicographicSpaceId
    resolution:
      - stage: raid-resolve
        effects:
          - addVar:
              scope: global
              var: raidCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [arvn-special-window]
endConditions:
  - when:
      op: "=="
      left: 1
      right: 2
    result:
      type: draw
```

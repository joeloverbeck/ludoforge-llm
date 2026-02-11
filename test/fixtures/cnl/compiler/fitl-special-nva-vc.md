# FITL NVA/VC Special Activities Fixture

```yaml
metadata:
  id: fitl-special-nva-vc
  players:
    min: 2
    max: 2
globalVars:
  - name: nvaResources
    type: int
    init: 6
    min: 0
    max: 50
  - name: vcResources
    type: int
    init: 5
    min: 0
    max: 50
  - name: infiltrateCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: bombardCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: nvaAmbushCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: taxCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: subvertCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: vcAmbushCount
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
  - id: infiltrate
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
  - id: bombard
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
  - id: ambushNva
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
  - id: tax
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
  - id: subvert
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
  - id: ambushVc
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
  - id: infiltrate-profile
    actionId: infiltrate
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 2
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 2
      spend:
        - addVar:
            scope: global
            var: nvaResources
            delta: -2
    targeting:
      select: upToN
      max: 2
      placementPolicy: baseThenGuerrilla
    resolution:
      - stage: infiltrate-resolve
        effects:
          - addVar:
              scope: global
              var: infiltrateCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [nva-special-window]
  - id: bombard-profile
    actionId: bombard
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
    cost:
      validate:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 1
      spend:
        - addVar:
            scope: global
            var: nvaResources
            delta: -1
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    resolution:
      - stage: bombard-resolve
        effects:
          - addVar:
              scope: global
              var: bombardCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [nva-special-window]
  - id: nva-ambush-profile
    actionId: ambushNva
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: nvaResources
            delta: -1
    targeting:
      select: exactlyN
      count: 1
      tieBreak: basesLast
      removalPolicy: removeActiveGuerrillasBeforeBases
    resolution:
      - stage: ambush-nva-resolve
        effects:
          - addVar:
              scope: global
              var: nvaAmbushCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [nva-special-window]
  - id: tax-profile
    actionId: tax
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: vcResources
            delta: -1
    targeting:
      select: upToN
      max: 2
      order: lexicographicSpaceId
    resolution:
      - stage: tax-resolve
        effects:
          - addVar:
              scope: global
              var: taxCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [vc-special-window]
  - id: subvert-profile
    actionId: subvert
    legality:
      when:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
    cost:
      validate:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
      spend:
        - addVar:
            scope: global
            var: vcResources
            delta: -2
    targeting:
      select: upToN
      max: 1
      supportShiftPolicy: setTowardOpposition
    resolution:
      - stage: subvert-resolve
        effects:
          - addVar:
              scope: global
              var: subvertCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [vc-special-window]
  - id: vc-ambush-profile
    actionId: ambushVc
    legality:
      when:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    cost:
      validate:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
      spend:
        - addVar:
            scope: global
            var: vcResources
            delta: -1
    targeting:
      select: exactlyN
      count: 1
      tieBreak: lexicographicSpaceId
      removalPolicy: removeUndergroundGuerrillaFirst
    resolution:
      - stage: ambush-vc-resolve
        effects:
          - addVar:
              scope: global
              var: vcAmbushCount
              delta: 1
    partialExecution:
      mode: forbid
    linkedSpecialActivityWindows: [vc-special-window]
endConditions:
  - when:
      op: "=="
      left: 1
      right: 2
    result:
      type: draw
```

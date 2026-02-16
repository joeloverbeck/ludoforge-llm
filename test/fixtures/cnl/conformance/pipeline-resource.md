# Conformance Fixture: Pipeline Resource

```yaml
metadata:
  id: conformance-pipeline-resource
  players:
    min: 2
    max: 2
globalVars:
  - name: energy
    type: int
    init: 2
    min: 0
    max: 10
  - name: score
    type: int
    init: 0
    min: 0
    max: 10
zones:
  - id: board
    owner: none
    visibility: public
    ordering: set
turnStructure:
  phases:
    - id: main
    - id: cleanup
actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
  - id: operate
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
actionPipelines:
  - id: operate-profile
    actionId: operate
    applicability:
      op: "=="
      left:
        ref: activePlayer
      right: "0"
    legality: null
    costValidation:
      op: ">="
      left:
        ref: gvar
        var: energy
      right: 2
    costEffects:
      - addVar:
          scope: global
          var: energy
          delta: -2
    targeting: {}
    stages:
      - effects:
          - addVar:
              scope: global
              var: score
              delta: 1
    atomicity: atomic
terminal:
  conditions:
    - when:
        op: "=="
        left: 1
        right: 2
      result:
        type: draw
```

# Conformance Fixture: Pipeline Legality

```yaml
metadata:
  id: conformance-pipeline-legality
  players:
    min: 2
    max: 2
globalVars:
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
actions:
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
    applicability: null
    legality:
      op: "=="
      left:
        ref: gvar
        var: score
      right: 0
    costValidation: null
    costEffects: []
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

# Conformance Fixture: Turn Phase Progression

```yaml
metadata:
  id: conformance-turn-phase
  players:
    min: 2
    max: 2
globalVars:
  - name: steps
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
  - id: commit
    actor: active
    executor: actor
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: steps
          delta: 1
    limits:
      - scope: phase
        max: 1
terminal:
  conditions:
    - when:
        op: "=="
        left: 1
        right: 2
      result:
        type: draw
```

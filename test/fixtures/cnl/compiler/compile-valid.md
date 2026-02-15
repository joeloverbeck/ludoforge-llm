# Compiler Valid Fixture

```yaml
metadata:
  id: compiler-valid
  players:
    min: 2
    max: 2
zones:
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
  - id: hand
    owner: player
    visibility: owner
    ordering: set
turnStructure:
  phases:
    - id: main
actions:
  - id: drawEach
    actor: active
    executor: actor
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - draw:
          from: deck:none
          to: hand:each
          count: 1
    limits: []
terminal:
  conditions:
    - when:
        op: "=="
        left: 1
        right: 1
      result:
        type: draw
```

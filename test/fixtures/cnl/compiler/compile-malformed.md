# Compiler Malformed Fixture

```yaml
metadata:
  id: ""
  players:
    min: 0
    max: -1
zones:
  - id: deck
    owner: any
    visibility: hidden
    ordering: stack
turnStructure:
  phases:
    - id: main
  activePlayerOrder: zigzag
actions:
  - id: draw
    actor:
      currentPlayer: true
    phase: main
    params: []
    pre: null
    cost: []
    effects: {}
    limits: []
endConditions:
  - when:
      always: false
    result:
      type: draw
```

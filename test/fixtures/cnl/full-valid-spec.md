# Full Valid Game Spec

```yaml
metadata:
  id: fixture-valid
  players:
    min: 2
    max: 4
constants:
  handLimit: 7
zones:
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
turnStructure:
  phases:
    - id: main
  activePlayerOrder: roundRobin
actions:
  - id: draw
    actor:
      currentPlayer: true
    phase: main
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
endConditions:
  - when:
      op: ">="
      left: 1
      right: 999
    result:
      type: draw
```

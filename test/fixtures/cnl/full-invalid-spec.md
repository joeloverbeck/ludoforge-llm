# Full Invalid Game Spec

```yaml
metadata:
  id: ""
  players:
    min: 0
    max: -1
zones:
  - id: deck
    owner: any
    visibility: team
    ordering: ring
turnStructure:
  phases: []
  actions:
  - id: draw
    actor: null
    executor: actor
    phase: mian
    params: []
    pre: null
    cost: []
    effects: {}
    limits: []
terminal:
  conditions:
    - when:
        always: false
      reslt:
        type: draw
```

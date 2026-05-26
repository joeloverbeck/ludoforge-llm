# Generic Control - Rules, Actions & Turn Structure

```yaml
turnStructure:
  phases:
    - id: main

turnOrder:
  type: roundRobin

actions:
  - id: claim
    tags: [claim, control]
    actor: active
    executor: actor
    phase: [main]
    params:
      - name: targetZone
        domain:
          query: zones
          zoneKind: board
    pre: null
    cost: []
    effects:
      - setVar:
          scope: zoneVar
          zone: { zoneExpr: { ref: binding, name: targetZone } }
          var: controller
          value: { ref: activePlayer }
      - addVar:
          scope: pvar
          player: actor
          var: controlScore
          delta: 1
      - addVar:
          scope: global
          var: round
          delta: 1
      - advancePhase: {}
    limits: []

  - id: pass
    tags: [pass]
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: round
          delta: 1
      - advancePhase: {}
    limits: []
```

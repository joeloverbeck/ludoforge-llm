# Runner Bootstrap Default - Rules

```yaml
turnStructure:
  phases:
    - id: main
actions:
  - id: tick
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: tick
          delta: 1
    limits: []
terminal:
  conditions:
    - when:
        op: ">="
        left:
          ref: gvar
          var: tick
        right: 999
      result:
        type: draw
```

# Conformance Fixture: Token Lifecycle

```yaml
metadata:
  id: conformance-token-lifecycle
  players:
    min: 2
    max: 2
zones:
  - id: reserve
    owner: none
    visibility: hidden
    ordering: stack
  - id: board
    owner: none
    visibility: public
    ordering: set
tokenTypes:
  - id: piece
    props:
      value: int
setup:
  - createToken:
      type: piece
      zone: reserve:none
      props:
        value: 1
  - createToken:
      type: piece
      zone: reserve:none
      props:
        value: 2
turnStructure:
  phases:
    - id: main
actions:
  - id: deploy
    actor: active
    executor: actor
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - draw:
          from: reserve:none
          to: board:none
          count: 1
      - createToken:
          type: piece
          zone: board:none
          props:
            value: 99
    limits: []
terminal:
  conditions:
    - when:
        op: "=="
        left: 1
        right: 2
      result:
        type: draw
```

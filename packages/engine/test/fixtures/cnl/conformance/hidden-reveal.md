# Conformance Fixture: Hidden Reveal

```yaml
metadata:
  id: conformance-hidden-reveal
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
    ordering: stack
tokenTypes:
  - id: card
    props:
      rank: int
setup:
  - createToken:
      type: card
      zone: deck:none
      props:
        rank: 1
turnStructure:
  phases:
    - id: main
actions:
  - id: showCard
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - draw:
          from: deck:none
          to: hand:active
          count: 1
      - reveal:
          zone: hand:active
          to: all
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

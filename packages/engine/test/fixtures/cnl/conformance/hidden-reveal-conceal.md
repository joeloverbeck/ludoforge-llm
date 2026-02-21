# Conformance Fixture: Hidden Reveal Conceal

```yaml
metadata:
  id: conformance-hidden-reveal-conceal
  players:
    min: 2
    max: 2
zones:
  - id: hand
    owner: player
    visibility: owner
    ordering: stack
tokenTypes:
  - id: card
    props:
      faction: string
      rank: int
setup:
  - createToken:
      type: card
      zone: hand:active
      props:
        faction: US
        rank: 1
  - createToken:
      type: card
      zone: hand:active
      props:
        faction: ARVN
        rank: 1
turnStructure:
  phases:
    - id: main
actions:
  - id: revealFiltered
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - reveal:
          zone: hand:active
          to:
            id: 1
          filter:
            - prop: faction
              op: eq
              value: US
            - prop: rank
              op: eq
              value: 1
    limits: []
  - id: concealFilteredReordered
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - conceal:
          zone: hand:active
          from:
            id: 1
          filter:
            - prop: rank
              op: eq
              value: 1
            - prop: faction
              op: eq
              value: US
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


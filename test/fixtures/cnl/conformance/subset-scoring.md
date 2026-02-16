# Conformance Fixture: Subset Scoring

```yaml
metadata:
  id: conformance-subset-scoring
  players:
    min: 2
    max: 2
globalVars:
  - name: winner
    type: int
    init: 0
    min: 0
    max: 100
zones:
  - id: pool
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
      zone: pool:none
      props:
        value: 1
  - createToken:
      type: piece
      zone: pool:none
      props:
        value: 4
  - createToken:
      type: piece
      zone: pool:none
      props:
        value: 3
turnStructure:
  phases:
    - id: main
actions:
  - id: scoreBestPair
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects:
      - evaluateSubset:
          source:
            query: tokensInZone
            zone: pool:none
          subsetSize: 2
          subsetBind: $subset
          compute: []
          scoreExpr:
            aggregate:
              op: sum
              query:
                query: binding
                name: $subset
              bind: $token
              valueExpr:
                ref: tokenProp
                token: $token
                prop: value
          resultBind: $bestScore
          in:
            - setVar:
                scope: global
                var: winner
                value:
                  ref: binding
                  name: $bestScore
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

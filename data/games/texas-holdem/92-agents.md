# Texas Hold'em - Agents

```yaml
agents:
  library:
    candidateFeatures:
      isCheck:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - check
      isCall:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - call
      isRaise:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - raise
      isAllIn:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - allIn
      isFold:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - fold
      raiseAmount:
        type: number
        expr:
          coalesce:
            - { ref: candidate.param.raiseAmount }
            - 0

    candidateAggregates: {}

    pruningRules: {}

    scoreTerms:
      preferCheck:
        weight: 100
        value:
          boolToNumber:
            ref: feature.isCheck
      preferCall:
        weight: 80
        value:
          boolToNumber:
            ref: feature.isCall
      preferRaise:
        weight: 60
        value:
          boolToNumber:
            ref: feature.isRaise
      preferSmallerRaise:
        weight: -0.001
        value:
          ref: feature.raiseAmount
      preferAllIn:
        weight: 40
        value:
          boolToNumber:
            ref: feature.isAllIn
      avoidFold:
        weight: -100
        value:
          boolToNumber:
            ref: feature.isFold

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    baseline:
      params: {}
      use:
        pruningRules: []
        scoreTerms:
          - preferCheck
          - preferCall
          - preferRaise
          - preferSmallerRaise
          - preferAllIn
          - avoidFold
        tieBreakers:
          - stableMoveKey

  bindings:
    neutral: baseline
```

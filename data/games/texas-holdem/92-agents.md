# Texas Hold'em - Agents

```yaml
agents:
  library:
    stateFeatures:
      callAmount:
        type: number
        expr:
          max:
            - 0
            - sub:
                - { ref: var.global.currentBet }
                - { ref: var.player.self.streetBet }
      facingBet:
        type: boolean
        expr:
          gt:
            - { ref: feature.callAmount }
            - 0
      potOddsFavorable:
        type: boolean
        expr:
          gte:
            - { ref: var.global.pot }
            - mul:
                - max:
                    - 1
                    - sub:
                        - { ref: var.global.activePlayers }
                        - 1
                - { ref: feature.callAmount }
      handHighCard:
        type: number
        expr:
          zoneTokenAgg:
            zone: hand
            owner: self
            prop: rank
            op: max
      handLowCard:
        type: number
        expr:
          zoneTokenAgg:
            zone: hand
            owner: self
            prop: rank
            op: min
      premiumHand:
        type: boolean
        expr:
          gte:
            - { ref: feature.handHighCard }
            - 13
      isDealer:
        type: boolean
        expr:
          eq:
            - { ref: var.player.self.seatIndex }
            - { ref: var.global.dealerSeat }
      hasPair:
        type: boolean
        expr:
          eq:
            - { ref: feature.handHighCard }
            - { ref: feature.handLowCard }

    candidateAggregates: {}

    pruningRules: {}

    considerations:
      preferCheck:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.check
      preferCall:
        scopes: [move]
        weight: 80
        value:
          boolToNumber:
            ref: candidate.tag.call
      avoidFold:
        scopes: [move]
        weight: -100
        value:
          boolToNumber:
            ref: candidate.tag.fold
      foldWhenBadPotOdds:
        scopes: [move]
        weight: 150
        value:
          boolToNumber:
            and:
              - { ref: candidate.tag.fold }
              - { ref: feature.facingBet }
              - not: { ref: feature.potOddsFavorable }
      alwaysRaise:
        scopes: [move]
        weight: 90
        value:
          boolToNumber:
            ref: candidate.tag.raise
    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    baseline:
      params: {}
      preview:
        mode: disabled
      selection:
        mode: softmaxSample
        temperature: 0.5
      use:
        pruningRules: []
        considerations:
          - preferCheck
          - preferCall
          - avoidFold
          - foldWhenBadPotOdds
          - alwaysRaise
        tieBreakers:
          - stableMoveKey

  bindings:
    neutral: baseline
```

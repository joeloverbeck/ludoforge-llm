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

    scoreTerms:
      # --- shared terms (used by both profiles) ---
      preferCheck:
        weight: 100
        value:
          boolToNumber:
            ref: feature.isCheck
      preferSmallerRaise:
        weight: -0.001
        value:
          ref: feature.raiseAmount

      # --- evolved-only terms ---
      preferCall:
        weight: 80
        value:
          boolToNumber:
            ref: feature.isCall
      avoidFold:
        weight: -100
        value:
          boolToNumber:
            ref: feature.isFold
      foldWhenBadPotOdds:
        weight: 200
        value:
          boolToNumber:
            and:
              - { ref: feature.isFold }
              - { ref: feature.facingBet }
              - not: { ref: feature.potOddsFavorable }
      alwaysRaise:
        weight: 90
        value:
          boolToNumber:
            ref: feature.isRaise
      preferLargerRaise:
        weight: 0.002
        value:
          ref: feature.raiseAmount

      # --- baseline-only terms ---
      baselinePreferCall:
        weight: 55
        value:
          boolToNumber:
            ref: feature.isCall
      baselinePreferRaise:
        weight: 50
        value:
          boolToNumber:
            ref: feature.isRaise
      baselinePreferAllIn:
        weight: 20
        value:
          boolToNumber:
            ref: feature.isAllIn
      baselineAvoidFold:
        weight: -30
        value:
          boolToNumber:
            ref: feature.isFold
      baselineFoldBadOdds:
        weight: 100
        value:
          boolToNumber:
            and:
              - { ref: feature.isFold }
              - { ref: feature.facingBet }
              - lt:
                  - { ref: var.global.pot }
                  - mul:
                      - 3
                      - { ref: feature.callAmount }
      baselineRaiseGoodOdds:
        weight: 15
        value:
          boolToNumber:
            and:
              - { ref: feature.isRaise }
              - gte:
                  - { ref: var.global.pot }
                  - mul:
                      - 3
                      - { ref: feature.callAmount }

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
          - baselinePreferCall
          - baselinePreferRaise
          - preferSmallerRaise
          - baselinePreferAllIn
          - baselineAvoidFold
          - baselineFoldBadOdds
          - baselineRaiseGoodOdds
        tieBreakers:
          - stableMoveKey

    evolved:
      params: {}
      use:
        pruningRules: []
        scoreTerms:
          - preferCheck
          - preferCall
          - avoidFold
          - foldWhenBadPotOdds
          - alwaysRaise
          - preferLargerRaise
        tieBreakers:
          - stableMoveKey

  bindings:
    neutral: baseline
```

# Fire in the Lake - Agents

```yaml
agents:
  parameters:
    eventWeight:
      type: number
      default: 100
      min: -1000
      max: 1000
      tunable: true
    projectedMarginWeight:
      type: number
      default: 100
      min: -1000
      max: 1000
      tunable: true
    resourceWeight:
      type: number
      default: 0
      min: -100
      max: 100
      tunable: true
    rallyWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true
    taxWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true
    governWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true
    trainWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true
    sweepWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true
    assaultWeight:
      type: number
      default: 100
      min: 0
      max: 1000
      tunable: true

  library:
    stateFeatures:
      selfMargin:
        type: number
        expr:
          ref: victory.currentMargin.self
      patronage:
        type: number
        expr:
          ref: var.global.patronage
      coinControlPop:
        type: number
        expr:
          ref: metric.auto:victory:controlledPopulation:coin
      selfResources:
        type: number
        expr:
          ref: var.player.self.resources
      vcGuerrillaCount:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: VC }
                type: { eq: guerrilla }
      vcBaseCount:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: VC }
                type: { eq: base }
      vcFriendlyCapCount:
        type: number
        expr:
          add:
            - boolToNumber:
                eq:
                  - { ref: globalMarker.cap_boobyTraps }
                  - { const: "shaded" }
            - add:
                - boolToNumber:
                    eq:
                      - { ref: globalMarker.cap_mainForceBns }
                      - { const: "shaded" }
                - boolToNumber:
                    eq:
                      - { ref: globalMarker.cap_cadres }
                      - { const: "shaded" }
      arvnTroopCount:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: self }
                type: { eq: troops }
      turnRound:
        type: number
        expr:
          ref: turn.round

    candidateFeatures:
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
      projectedCapabilityGain:
        type: number
        expr:
          coalesce:
            - sub:
                - coalesce:
                    - { ref: preview.feature.vcFriendlyCapCount }
                    - { ref: feature.vcFriendlyCapCount }
                - { ref: feature.vcFriendlyCapCount }
            - 0

    candidateAggregates:
      hasNonPassAlternative:
        op: any
        of:
          not:
            ref: candidate.tag.pass
      maxMarginScore:
        op: max
        of:
          ref: feature.projectedSelfMargin
      minMarginScore:
        op: min
        of:
          ref: feature.projectedSelfMargin

    pruningRules:
      dropPassWhenOtherMovesExist:
        when:
          and:
            - { ref: candidate.tag.pass }
            - { ref: aggregate.hasNonPassAlternative }
        onEmpty: skipRule

    considerations:
      preferProjectedSelfMargin:
        scopes: [move]
        weight:
          param: projectedMarginWeight
        value:
          ref: feature.projectedSelfMargin
      preserveResources:
        scopes: [move]
        weight:
          param: resourceWeight
        value:
          ref: feature.selfResources
      preferEvent:
        scopes: [move]
        weight:
          param: eventWeight
        value:
          boolToNumber:
            ref: candidate.tag.event-play
      preferTrainAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferPatrolAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.patrol
      preferAssaultAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.assault
      preferAdviseAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.advise
      preferSweepAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.sweep
      preferGovernAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.govern
      preferRallyAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.rally
      preferRallyWeighted:
        scopes: [move]
        weight:
          param: rallyWeight
        value:
          boolToNumber:
            ref: candidate.tag.rally
      preferMarchAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.march
      preferAttackAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.attack
      preferTerrorAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.terror
      preferTaxAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.tax
      preferTaxWeighted:
        scopes: [move]
        weight:
          param: taxWeight
        value:
          boolToNumber:
            ref: candidate.tag.tax
      preferGovernWeighted:
        scopes: [move]
        weight:
          param: governWeight
        value:
          boolToNumber:
            ref: candidate.tag.govern
      preferTrainWeighted:
        scopes: [move]
        weight:
          param: trainWeight
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferSweepWeighted:
        scopes: [move]
        weight:
          param: sweepWeight
        value:
          boolToNumber:
            ref: candidate.tag.sweep
      preferAssaultWeighted:
        scopes: [move]
        weight:
          param: assaultWeight
        value:
          boolToNumber:
            ref: candidate.tag.assault
      preferSubvertAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.subvert
      preferInfiltrateAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.infiltrate
      preferBombardAction:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.bombard
      trainWhenFewTroops:
        scopes: [move]
        when:
          lt:
            - { ref: feature.arvnTroopCount }
            - 10
        weight: 200
        value:
          boolToNumber:
            ref: candidate.tag.train
      governWhenPatronageLow:
        scopes: [move]
        when:
          lt:
            - { ref: feature.patronage }
            - 20
        weight: 800
        value:
          boolToNumber:
            ref: candidate.tag.govern
      trainWhenControlLow:
        scopes: [move]
        when:
          lt:
            - { ref: feature.coinControlPop }
            - 25
        weight: 500
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferNormalizedMargin:
        scopes: [move]
        weight: 500
        value:
          div:
            - sub:
                - { ref: feature.projectedSelfMargin }
                - { ref: aggregate.minMarginScore }
            - max:
                - 1
                - sub:
                    - { ref: aggregate.maxMarginScore }
                    - { ref: aggregate.minMarginScore }
      preferStrongNormalizedMargin:
        scopes: [move]
        weight: 800
        value:
          div:
            - sub:
                - { ref: feature.projectedSelfMargin }
                - { ref: aggregate.minMarginScore }
            - max:
                - 1
                - sub:
                    - { ref: aggregate.maxMarginScore }
                    - { ref: aggregate.minMarginScore }
      valueCapabilityGain:
        scopes: [move]
        weight: 300
        value:
          ref: feature.projectedCapabilityGain
      penalizeAttack:
        scopes: [move]
        weight: -10
        value:
          boolToNumber:
            ref: candidate.tag.attack
      observeGameState:
        scopes: [move]
        weight: 0
        value:
          add:
            - { ref: feature.selfResources }
            - add:
                - { ref: feature.vcGuerrillaCount }
                - add:
                    - { ref: feature.vcBaseCount }
                    - { ref: feature.turnRound }
      preferOptionProjectedMargin:
        scopes: [microturn]
        costClass: preview
        weight: 300
        value:
          ref: preview.option.delta.victory.currentMargin.self
        previewFallback:
          onUnavailable: noContribution

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    us-baseline:
      observer: currentPlayer
      params:
        eventWeight: 200
        projectedMarginWeight: 100
        resourceWeight: 2
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferTrainAction
          - preferPatrolAction
          - preferAssaultAction
          - preferAdviseAction
        tieBreakers:
          - stableMoveKey

    arvn-baseline:
      observer: currentPlayer
      preview:
        mode: exactWorld
        budget:
          strategy: balancedCoverage
          fullCandidateCap: 4
          minPerGroup: 1
      params:
        projectedMarginWeight: 800
        governWeight: 500
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preferGovernWeighted
        tieBreakers:
          - stableMoveKey

    arvn-evolved:
      observer: currentPlayer
      preview:
        mode: exactWorld
        budget:
          strategy: balancedCoverage
          fullCandidateCap: 10
          minPerGroup: 1
        inner:
          chooseOne: true
          chooseNStep: true
          maxOptions: 8
          chooseNBeamWidth: 1
          depthCap: 4
      params:
        projectedMarginWeight: 300
        governWeight: 1000
        trainWeight: 300
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preferGovernWeighted
          - trainWhenControlLow
          - preferOptionProjectedMargin
        tieBreakers:
          - stableMoveKey

    nva-baseline:
      observer: currentPlayer
      params:
        eventWeight: 150
        projectedMarginWeight: 100
        resourceWeight: 3
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferRallyAction
          - preferMarchAction
          - preferAttackAction
          - preferTerrorAction
          - preferInfiltrateAction
          - preferBombardAction
        tieBreakers:
          - stableMoveKey

    vc-baseline:
      observer: currentPlayer
      preview:
        mode: tolerateStochastic
      params:
        projectedMarginWeight: 500
        rallyWeight: 500
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferNormalizedMargin
          - preferRallyWeighted
          - valueCapabilityGain
        tieBreakers:
          - stableMoveKey

  bindings:
    us: us-baseline
    arvn: arvn-evolved
    nva: nva-baseline
    vc: vc-baseline
```

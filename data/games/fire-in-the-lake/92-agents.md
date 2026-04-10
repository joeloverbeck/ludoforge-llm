# Fire in the Lake - Agents

```yaml
agents:
  parameters:
    eventWeight:
      type: number
      default: 1
      min: -10
      max: 10
      tunable: true
    projectedMarginWeight:
      type: number
      default: 1
      min: -10
      max: 10
      tunable: true
    resourceWeight:
      type: number
      default: 0
      min: -1
      max: 1
      tunable: true
    rallyWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    taxWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    governWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    trainWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    sweepWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true
    assaultWeight:
      type: number
      default: 1
      min: 0
      max: 10
      tunable: true

  library:
    stateFeatures:
      selfMargin:
        type: number
        expr:
          ref: victory.currentMargin.self
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
      targetSpacePopulation:
        type: number
        expr:
          coalesce:
            - zoneProp:
                zone: { ref: candidate.param.targetSpace }
                prop: population
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
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferPatrolAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.patrol
      preferAssaultAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.assault
      preferAdviseAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.advise
      preferSweepAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.sweep
      preferGovernAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.govern
      preferRallyAction:
        scopes: [move]
        weight: 1
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
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.march
      preferAttackAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.attack
      preferTerrorAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.terror
      preferTaxAction:
        scopes: [move]
        weight: 1
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
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.subvert
      preferInfiltrateAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.infiltrate
      preferBombardAction:
        scopes: [move]
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.bombard
      trainWhenFewTroops:
        scopes: [move]
        when:
          lt:
            - { ref: feature.arvnTroopCount }
            - 10
        weight: 2
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferPopulousTargets:
        scopes: [completion]
        when:
          and:
            - eq:
                - { ref: decision.type }
                - chooseN
            - eq:
                - { ref: decision.name }
                - "$targetSpaces"
            - eq:
                - { ref: decision.targetKind }
                - zone
        weight: 2
        value:
          coalesce:
            - zoneProp:
                zone: { ref: option.value }
                prop: population
            - 0

      preferNormalizedMargin:
        scopes: [move]
        weight: 5
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
        weight: 3
        value:
          ref: feature.projectedCapabilityGain
      penalizeAttack:
        scopes: [move]
        weight: -0.1
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

    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey
      preferCheapTargetSpaces:
        kind: lowerExpr
        value:
          ref: feature.targetSpacePopulation

  profiles:
    us-baseline:
      observer: currentPlayer
      params:
        eventWeight: 2
        projectedMarginWeight: 1
        resourceWeight: 0.02
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
        phase1: true
      params:
        projectedMarginWeight: 8
        governWeight: 5
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferProjectedSelfMargin
          - preferGovernWeighted
          - preferPopulousTargets
        tieBreakers:
          - stableMoveKey

    nva-baseline:
      observer: currentPlayer
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.03
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
        projectedMarginWeight: 5
        rallyWeight: 5
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferNormalizedMargin
          - preferRallyWeighted
          - valueCapabilityGain
          - preferPopulousTargets
        tieBreakers:
          - stableMoveKey

  bindings:
    us: us-baseline
    arvn: arvn-baseline
    nva: nva-baseline
    vc: vc-baseline
```

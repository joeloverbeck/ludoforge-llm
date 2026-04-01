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

    candidateFeatures:
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
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

    pruningRules:
      dropPassWhenOtherMovesExist:
        when:
          and:
            - { ref: candidate.tag.pass }
            - { ref: aggregate.hasNonPassAlternative }
        onEmpty: skipRule

    scoreTerms:
      preferProjectedSelfMargin:
        weight:
          param: projectedMarginWeight
        value:
          ref: feature.projectedSelfMargin
      preserveResources:
        weight:
          param: resourceWeight
        value:
          ref: feature.selfResources
      preferEvent:
        weight:
          param: eventWeight
        value:
          boolToNumber:
            ref: candidate.tag.event-play
      preferTrainAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.train
      preferPatrolAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.patrol
      preferAssaultAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.assault
      preferAdviseAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.advise
      preferSweepAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.sweep
      preferGovernAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.govern
      preferRallyAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.rally
      preferRallyWeighted:
        weight:
          param: rallyWeight
        value:
          boolToNumber:
            ref: candidate.tag.rally
      preferMarchAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.march
      preferAttackAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.attack
      preferTerrorAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.terror
      preferTaxAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.tax
      preferTaxWeighted:
        weight:
          param: taxWeight
        value:
          boolToNumber:
            ref: candidate.tag.tax
      preferSubvertAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.subvert
      preferInfiltrateAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.infiltrate
      preferBombardAction:
        weight: 1
        value:
          boolToNumber:
            ref: candidate.tag.bombard

    completionScoreTerms:
      preferPopulousTargets:
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
        scoreTerms:
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
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.02
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferTrainAction
          - preferPatrolAction
          - preferSweepAction
          - preferAssaultAction
          - preferGovernAction
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
        scoreTerms:
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
      params:
        eventWeight: 1.5
        projectedMarginWeight: 1
        resourceWeight: 0.03
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferProjectedSelfMargin
          - preserveResources
          - preferEvent
          - preferRallyAction
          - preferMarchAction
          - preferAttackAction
          - preferTerrorAction
          - preferTaxAction
          - preferSubvertAction
        tieBreakers:
          - stableMoveKey

    vc-evolved:
      observer: currentPlayer
      preview:
        tolerateRngDivergence: true
      params:
        rallyWeight: 3
        taxWeight: 2
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        scoreTerms:
          - preferRallyWeighted
          - preferTaxWeighted
        completionScoreTerms:
          - preferPopulousTargets
        tieBreakers:
          - preferCheapTargetSpaces
          - stableMoveKey
      completionGuidance:
        enabled: true
        fallback: random

  bindings:
    us: us-baseline
    arvn: arvn-baseline
    nva: nva-baseline
    vc: vc-evolved
```

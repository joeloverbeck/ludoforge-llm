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
      params:
        eventWeight: 1.5
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
          - preferTaxAction
          - preferSubvertAction
        tieBreakers:
          - stableMoveKey

    vc-evolved:
      observer: currentPlayer
      preview:
        mode: tolerateStochastic
      params:
        rallyWeight: 3
        taxWeight: 2
      use:
        pruningRules:
          - dropPassWhenOtherMovesExist
        considerations:
          - preferRallyWeighted
          - preferTaxWeighted
          - preferPopulousTargets
        tieBreakers:
          - preferCheapTargetSpaces
          - stableMoveKey

  bindings:
    us: us-baseline
    arvn: arvn-baseline
    nva: nva-baseline
    vc: vc-evolved
```

# Fire in the Lake - Agents

```yaml
agents:
  visibility:
    perPlayerVars:
      resources:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
    victory:
      currentMargin:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
      currentRank:
        current: public
        preview:
          visibility: public
          allowWhenHiddenSampling: false
    activeCardIdentity:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardTag:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false
    activeCardMetadata:
      current: public
      preview:
        visibility: public
        allowWhenHiddenSampling: false

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
      isPass:
        type: boolean
        expr:
          ref: candidate.isPass
      isEvent:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - event
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
      isTrain:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - train
      isPatrol:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - patrol
      isAssault:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - assault
      isAdvise:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - advise
      isSweep:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - sweep
      isGovern:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - govern
      isRally:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - rally
      isMarch:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - march
      isAttack:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - attack
      isTerror:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - terror
      isTax:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - tax
      isSubvert:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - subvert
      isInfiltrate:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - infiltrate
      isBombard:
        type: boolean
        expr:
          eq:
            - { ref: candidate.actionId }
            - bombard
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
            ref: feature.isPass

    pruningRules:
      dropPassWhenOtherMovesExist:
        when:
          and:
            - { ref: feature.isPass }
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
            ref: feature.isEvent
      preferTrainAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTrain
      preferPatrolAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isPatrol
      preferAssaultAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAssault
      preferAdviseAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAdvise
      preferSweepAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isSweep
      preferGovernAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isGovern
      preferRallyAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isRally
      preferRallyWeighted:
        weight:
          param: rallyWeight
        value:
          boolToNumber:
            ref: feature.isRally
      preferMarchAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isMarch
      preferAttackAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isAttack
      preferTerrorAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTerror
      preferTaxAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isTax
      preferTaxWeighted:
        weight:
          param: taxWeight
        value:
          boolToNumber:
            ref: feature.isTax
      preferSubvertAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isSubvert
      preferInfiltrateAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isInfiltrate
      preferBombardAction:
        weight: 1
        value:
          boolToNumber:
            ref: feature.isBombard

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

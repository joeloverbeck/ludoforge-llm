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
      nvaMargin:
        type: number
        expr:
          ref: victory.currentMargin.nva
      vcMargin:
        type: number
        expr:
          ref: victory.currentMargin.vc
      usMargin:
        type: number
        expr:
          ref: victory.currentMargin.us
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
      selfRank:
        type: number
        expr:
          ref: victory.currentRank.self

    candidateFeatures:
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
      projectedNvaMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.nva }
            - { ref: feature.nvaMargin }
      projectedVcMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.vc }
            - { ref: feature.vcMargin }
      projectedUsMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.us }
            - { ref: feature.usMargin }
      projectedSelfMarginDelta:
        type: number
        expr:
          sub:
            - { ref: feature.projectedSelfMargin }
            - { ref: feature.selfMargin }
      projectedUsMarginDelta:
        type: number
        expr:
          sub:
            - { ref: feature.projectedUsMargin }
            - { ref: feature.usMargin }
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
      projectedSelfRank:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentRank.self }
            - { ref: feature.selfRank }
      projectedCurrentLeaderMargin:
        type: number
        expr:
          seatAgg:
            over: { role: currentLeader }
            expr: { ref: preview.victory.currentMargin.$seat }
            aggOp: sum
            availability: selfAndTargetReady
      projectedNearestThreatMargin:
        type: number
        expr:
          seatAgg:
            over: { role: nearestThreat }
            expr: { ref: preview.victory.currentMargin.$seat }
            aggOp: sum
            availability: selfAndTargetReady

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

    strategicConditions:
      selfPoliticalEngineBehind:
        description: "ARVN needs to build political engine when it is not currently leading."
        target:
          gte:
            - { ref: feature.selfRank }
            - 2
        proximity:
          current: { ref: feature.selfRank }
          threshold: 2
      militaryBoardCollapsing:
        description: "ARVN has no resource base left for political consolidation."
        target:
          lt:
            - { ref: feature.selfResources }
            - 1
        proximity:
          current:
            sub:
              - 1
              - { ref: feature.selfResources }
          threshold: 1
      usNearWin:
        description: "US is close enough to a Support win that ARVN treats US gains as rival gains."
        target:
          gte:
            - { ref: feature.usMargin }
            - -1
        proximity:
          current:
            add:
              - { ref: feature.usMargin }
              - 1
          threshold: 1

    selectors:
      # Spec 181 migration: preferOptionProjectedMargin previously read
      # preview.option.delta.victory.currentMargin.self directly as a flat
      # microturn scalar. The selector keeps the same projected-margin signal
      # but makes the option ranking explicit and traceable.
      arvnMicroturnOptionProjectedMargin:
        scopes: [microturn]
        source:
          kind: microturnOptions
        quality:
          components:
            - id: projectedSelfMargin
              value:
                ref: preview.option.delta.victory.currentMargin.self
              weight: 1
              previewFallback:
                onUnavailable: noContribution
          order: qualityDesc
        result:
          maxItems: 8
          order: [qualityDesc, stableKeyAsc]
          onEmpty: noContribution
      arvnPoliticalTargetOpportunity:
        scopes: [move]
        source:
          collection:
            kind: zones
        quality:
          components:
            - id: projectedMargin
              value:
                ref: feature.projectedSelfMargin
              weight: 2
            - id: controlledPopulation
              value:
                ref: feature.coinControlPop
              weight: 1
          order: qualityDesc
        result:
          maxItems: 8
          order: [qualityDesc, stableKeyAsc]
          onEmpty: noContribution
      arvn.trainSpaceForControlOrPacification: { scopes: [move], source: { collection: { kind: zones } }, quality: { components: [{ id: controlOrPacificationOpportunity, value: 1, weight: 1 }], order: qualityDesc }, result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution } }
      arvn.governPatronageSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: activeSupportGovern
              value:
                boolToNumber:
                  eq:
                    - lookup:
                        surface: policyState
                        collection: zones
                        keyType: ZoneId
                        key: { ref: selector.item.key }
                        path: [markers, supportOpposition]
                        onMissing: { kind: constant, value: neutral }
                    - activeSupport
              weight: 20
            - id: passiveSupportGovern
              value:
                boolToNumber:
                  eq:
                    - lookup:
                        surface: policyState
                        collection: zones
                        keyType: ZoneId
                        key: { ref: selector.item.key }
                        path: [markers, supportOpposition]
                        onMissing: { kind: constant, value: neutral }
                    - passiveSupport
              weight: 10
            - id: governPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 4
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.patrolLocOrCity:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: econProtection
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: econ
                  - 0
              weight: 4
            - id: cityControlRoute
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: category
                    - city
              weight: 2
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.sweepToExposeSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: exposeUndergroundThreat
              value: 1
              weight: 4
            - id: highPopControlSetup
              value:
                ref: feature.coinControlPop
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.raidRemovalTarget:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: baseOrUndergroundRemoval
              value: 1
              weight: 5
            - id: controlSwing
              value:
                ref: feature.projectedSelfMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.transportOrigin:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: overstackedSafeOrigin
              value: 1
              weight: 3
            - id: preserveOriginControl
              value:
                ref: feature.coinControlPop
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.transportDestination:
        scopes: [move]
        source:
          kind: routePairs
          origin: arvn.transportOrigin
          destination: arvn.assaultTargetSpace
          maxPairs: 64
        quality:
          components:
            - id: threatenedReinforcementRoute
              value: 1
              weight: 0
            - id: destinationControlGain
              value:
                ref: feature.projectedSelfMargin
              weight: 0
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.assaultTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: nvaControlRemoval
              value:
                ref: feature.projectedNvaMargin
              weight: -1
            - id: vcBaseOrOppositionThreat
              value:
                ref: feature.projectedVcMargin
              weight: -1
            - id: coinControlGain
              value:
                ref: feature.projectedSelfMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.pieceRemovalPriority:
        scopes: [move]
        source:
          collection: { kind: tokens }
        quality:
          components:
            - id: baseAndControlThreat
              value: 1
              weight: 5
            - id: leaderDenial
              value:
                ref: feature.projectedCurrentLeaderMargin
              weight: -1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }

    planTemplates:
      arvn.trainGovern:
        traceLabel: "ARVN Train then Govern"
        root: { actionTags: [train], compound: { specialTags: [govern], timing: after } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          trainSpace: { selector: arvn.trainSpaceForControlOrPacification, required: true }
          governSpace: { selector: arvn.governPatronageSpace, required: true, constraints: [{ notEqual: role.trainSpace }] }
        steps:
          - { label: train-space, role: trainSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
          - { label: govern-space, role: governSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: govern } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.patrolGovern:
        traceLabel: "ARVN Patrol then Govern"
        root: { actionTags: [patrol], compound: { specialTags: [govern], timing: after } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          patrolSpace: { selector: arvn.patrolLocOrCity, required: true }
          governSpace: { selector: arvn.governPatronageSpace, required: true, constraints: [{ notEqual: role.patrolSpace }] }
        steps:
          - { label: patrol-space, role: patrolSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetLoCs, actionTag: patrol } }
          - { label: govern-space, role: governSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: govern } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.sweepRaid:
        traceLabel: "ARVN Sweep then Raid"
        root: { actionTags: [sweep], compound: { specialTags: [raid], timing: after } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          sweepSpace: { selector: arvn.sweepToExposeSpace, required: true }
          raidSpace: { selector: arvn.raidRemovalTarget, required: true }
          removalPriority: { selector: arvn.pieceRemovalPriority, required: false }
        steps:
          - { label: sweep-space, role: sweepSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: sweep } }
          - { label: raid-space, role: raidSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: raid } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.assaultRaid:
        traceLabel: "ARVN Assault then Raid"
        root: { actionTags: [assault], compound: { specialTags: [raid], timing: after } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          assaultSpace: { selector: arvn.assaultTargetSpace, required: true }
          raidSpace: { selector: arvn.raidRemovalTarget, required: true }
          removalPriority: { selector: arvn.pieceRemovalPriority, required: false }
        steps:
          - { label: assault-space, role: assaultSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault } }
          - { label: raid-space, role: raidSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: raid } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.trainTransport:
        traceLabel: "ARVN Train then Transport"
        root: { actionTags: [train], compound: { specialTags: [transport], timing: after } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          trainSpace: { selector: arvn.trainSpaceForControlOrPacification, required: true }
          transportRoute: { selector: arvn.transportDestination, required: true, constraints: [{ notEqual: role.trainSpace }] }
        steps:
          - { label: train-space, role: trainSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
          - { label: transport-route, role: transportRoute, match: { decisionKind: chooseOne, targetKind: zone, decisionPath: transportDestination, actionTag: transport } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.assaultTransportAssault:
        traceLabel: "ARVN Assault, Transport, Assault"
        root: { actionTags: [assault], compound: { specialTags: [transport], timing: during, interruptAfterStage: 1 } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          firstAssaultSpace: { selector: arvn.assaultTargetSpace, required: true }
          transportRoute: { selector: arvn.transportDestination, required: true, constraints: [{ notEqual: role.firstAssaultSpace }] }
          secondAssaultSpace: { selector: arvn.assaultTargetSpace, required: true, constraints: [{ notEqual: role.firstAssaultSpace }] }
        steps:
          - { label: first-assault-space, role: firstAssaultSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 0 } }
          - { label: transport-route, role: transportRoute, match: { decisionKind: chooseOne, targetKind: zone, decisionPath: transportDestination, actionTag: transport } }
          - { label: second-assault-space, role: secondAssaultSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 2 } }
        caps: { capClass: standard256, maxSteps: 3 }
        fallback: { ifSpecialUnavailable: primitivePolicy, ifRoleTargetUnavailable: primitivePolicy }

    postureEvaluators:
      arvn.preserveAidAndMargin:
        traceLabel: "ARVN preserve Aid/resources and projected margin"
        must:
          - id: resource-floor
            condition:
              gte:
                - { ref: feature.selfResources }
                - 1
            onViolation: demote
            demotePenalty: -500
        prefer:
          - id: own-margin
            value:
              ref: preview.victory.currentMargin.self
            weight: 25
            fallback:
              contribution: 0
          - id: us-rival-risk
            when:
              eq:
                - { ref: relationship.nearWin.seat }
                - { ref: relationship.nominalAlly.seat }
            value:
              ref: relationship.nominalAlly.gainValue
            weight: -25
            fallback:
              contribution: 0

    relationships:
      arvn.usNominalAlly:
        role: nominalAlly
        seat: us
        priority: 10
        gainValue:
          ref: victory.currentMargin.us
      arvn.usNearWin:
        role: nearWin
        seat: us
        condition: usNearWin
        priority: 20
        gainValue:
          ref: victory.currentMargin.us

    strategyModules:
      arvnPursueProjectedMargin:
        traceLabel: "ARVN pursue projected margin"
        when: true
        applies:
          scopes: [move, microturn]
        priority:
          tier: 20
        selectors:
          - role: primaryTarget
            selectorId: arvnMicroturnOptionProjectedMargin
        scoreGroups:
          - id: targetQuality
            summary: sum
            terms:
              - weight: 1
                value: 1
              - weight: 10
                value:
                  ref: selector.arvnMicroturnOptionProjectedMargin.current.quality
        guardrailIds: []
        fallback:
          ifInactive: noContribution
          ifSelectorEmpty: noContribution
      buildPoliticalEngine:
        traceLabel: "build political engine"
        when:
          and:
            - { ref: condition.selfPoliticalEngineBehind.satisfied }
            - not: { ref: condition.militaryBoardCollapsing.satisfied }
            - or:
                - gt:
                    - { ref: feature.coinControlPop }
                    - 20
                - gte:
                    - { ref: feature.projectedSelfMargin }
                    - -7
        applies:
          scopes: [move]
          actionTags: [train]
        priority:
          tier: 30
        selectors:
          - role: primaryTarget
            selectorId: arvnPoliticalTargetOpportunity
        scoreGroups:
          - id: targetQuality
            summary: sum
            terms:
              - weight: 325
                value: 1
          - id: standing
            summary: sum
            terms:
              - weight: 325
                value: 1
        guardrailIds: []
        fallback:
          ifInactive: noContribution
          ifSelectorEmpty: noContribution
      arvn.blockImmediateWin:
        traceLabel: "ARVN block immediate win"
        when: true
        applies:
          scopes: [move]
          actionTags: [govern, patrol, sweep, assault]
        priority:
          tier: 95
        selectors:
          - { role: assaultTarget, selectorId: arvn.assaultTargetSpace }
          - { role: raidTarget, selectorId: arvn.raidRemovalTarget }
        scoreGroups:
          - id: blockThreat
            summary: sum
            terms:
              - { id: enemyMarginReduction, weight: 10, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.harvestPatronage:
        traceLabel: "ARVN harvest Patronage"
        when: true
        applies:
          scopes: [move]
          actionTags: [train, patrol]
        priority:
          tier: 80
        selectors:
          - { role: governTarget, selectorId: arvn.governPatronageSpace }
        scoreGroups:
          - id: patronageEngine
            summary: sum
            terms:
              - { id: governQuality, weight: 12, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.holdHighPopControl:
        traceLabel: "ARVN hold high-pop COIN control"
        when: true
        applies:
          scopes: [move]
          actionTags: [train, patrol, assault, transport]
        priority:
          tier: 70
        selectors:
          - { role: controlTarget, selectorId: arvn.assaultTargetSpace }
          - { role: patrolTarget, selectorId: arvn.patrolLocOrCity }
        scoreGroups:
          - id: controlStability
            summary: sum
            terms:
              - { id: controlQuality, weight: 8, value: 1 }
              - { id: patrolQuality, weight: 4, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.protectAidEcon:
        traceLabel: "ARVN protect Aid and Econ"
        when:
          not: { ref: condition.militaryBoardCollapsing.satisfied }
        applies:
          scopes: [move]
          actionTags: [patrol, train]
        priority:
          tier: 65
        selectors:
          - { role: econTarget, selectorId: arvn.patrolLocOrCity }
          - { role: governTarget, selectorId: arvn.governPatronageSpace }
        scoreGroups:
          - id: resources
            summary: sum
            terms:
              - { id: econPatrol, weight: 7, value: 1 }
              - { id: aidGovern, weight: 3, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.selectiveViolence:
        traceLabel: "ARVN selective violence"
        when: true
        applies:
          scopes: [move]
          actionTags: [sweep, assault]
        priority:
          tier: 60
        selectors:
          - { role: exposeTarget, selectorId: arvn.sweepToExposeSpace }
          - { role: removalTarget, selectorId: arvn.raidRemovalTarget }
          - { role: assaultTarget, selectorId: arvn.assaultTargetSpace }
        scoreGroups:
          - id: surgicalForce
            summary: sum
            terms:
              - { id: exposeBeforeRemoval, weight: 5, value: 1 }
              - { id: removalQuality, weight: 6, value: 1 }
              - { id: assaultQuality, weight: 6, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.denyUSIfNearWin:
        traceLabel: "ARVN deny US if near win"
        when: true
        applies:
          scopes: [move]
          actionTags: [govern]
        priority:
          tier: 55
        selectors:
          - { role: governTarget, selectorId: arvn.governPatronageSpace }
        scoreGroups:
          - id: allyRivalDenial
            summary: sum
            terms:
              - { id: governWithoutUSGift, weight: 5, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      arvn.preCoupRedeployDiscipline:
        traceLabel: "ARVN pre-Coup redeploy discipline"
        when: true
        applies:
          scopes: [move]
          actionTags: [train, transport]
        priority:
          tier: 50
        selectors:
          - { role: trainTarget, selectorId: arvn.trainSpaceForControlOrPacification }
          - { role: transportRoute, selectorId: arvn.transportDestination }
        scoreGroups:
          - id: redeployStability
            summary: sum
            terms:
              - { id: stableTraining, weight: 4, value: 1 }
              - { id: stableTransport, weight: 4, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }

    guardrails:
      dropPassWhenOtherMovesExist:
        traceLabel: "drop pass when other moves exist"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.pass }
            - { ref: aggregate.hasNonPassAlternative }
        severity: prune
        safe: true
        onAllPruned:
          actionId: pass
          traceLabel: "fallback: pass action when no other moves"
        onUnavailable: noFire
      arvn.doNotServeUSWin:
        traceLabel: "ARVN do not serve a US win"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.govern }
            - gt:
                - { ref: feature.projectedUsMarginDelta }
                - 0
            - gte:
                - { ref: feature.projectedUsMargin }
                - -1
        severity: demote
        penalty: 600
        onUnavailable: noFire
      arvn.preserveAidEconFloor:
        traceLabel: "ARVN preserve Aid/Econ floor"
        scopes: [move]
        when:
          and:
            - lte:
                - { ref: feature.selfResources }
                - 2
            - or:
                - { ref: candidate.tag.train }
                - { ref: candidate.tag.govern }
                - { ref: candidate.tag.assault }
                - { ref: candidate.tag.transport }
                - { ref: candidate.tag.raid }
        severity: demote
        penalty: 350
        onUnavailable: noFire
      arvn.doNotGovernAwaySupportEverywhere:
        traceLabel: "ARVN do not Govern away Support everywhere"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.govern }
            - lte:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
            - gte:
                - { ref: feature.patronage }
                - 30
        severity: demote
        penalty: 450
        onUnavailable: noFire
      arvn.doNotLoseOriginControlByTransport:
        traceLabel: "ARVN do not lose origin control by Transport"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.transport }
            - lt:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 550
        onUnavailable: noFire
      arvn.doNotOvercommitTroopsPreCoupWithoutBase:
        traceLabel: "ARVN do not overcommit Troops pre-Coup without a Base"
        scopes: [move]
        when:
          and:
            - lte:
                - { ref: schedule.distance.toBoundary.coupEntry.cards }
                - 1
            - or:
                - { ref: candidate.tag.train }
                - { ref: candidate.tag.transport }
            - lte:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 400
        onUnavailable: noFire
      arvn.doNotFightLowYieldHighlands:
        traceLabel: "ARVN do not fight low-yield Highlands"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.assault }
                - { ref: candidate.tag.sweep }
            - lte:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 300
        onUnavailable: noFire

    turnShapeEvaluators:
      currentTurnImpact:
        traceLabel: "current turn impact"
        source: currentPreviewDrive
        bounds:
          depthCapRef: profile.preview.inner.depthCap
          maxSyntheticDecisions: 8
        objectives:
          - id: self-standing
            delta:
              ref: victory.currentMargin.self
          - id: leader-denial
            delta:
              ref: victory.currentMargin.role:currentLeader
        minimumImpact:
          or:
            - gt:
                - { ref: turnShape.currentTurnImpact.objective.self-standing.delta }
                - 0
            - lt:
                - { ref: turnShape.currentTurnImpact.objective.leader-denial.delta }
                - 0
        fallback:
          onPreviewUnavailable: traceOnly

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
          ref: selector.arvnMicroturnOptionProjectedMargin.current.quality
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
        guardrails:
          - dropPassWhenOtherMovesExist
        strategyModules:
          - arvnPursueProjectedMargin
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
        guardrails:
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
          strategy: continuedDeepening
          capClass: deep1024
          continuedDeepening:
            broad:
              depthCap: 4
            deep:
              depthCap: 16
              trigger:
                - allRequestedRefsDepthCapped
                - allReadyValuesUniform
              rootPolicy: allRootsWithinCap
        grantFlowContinuation:
          enabled: true
          postGrantDepthCap: 4
          postGrantCapClass: postGrant16
          freeOperationDepthCap: 16
          freeOperationCapClass: grantFlow16
      params:
        projectedMarginWeight: 300
        governWeight: 700
        trainWeight: 300
      use:
        guardrails:
          - dropPassWhenOtherMovesExist
          - arvn.doNotServeUSWin
          - arvn.preserveAidEconFloor
          - arvn.doNotGovernAwaySupportEverywhere
          - arvn.doNotLoseOriginControlByTransport
          - arvn.doNotOvercommitTroopsPreCoupWithoutBase
          - arvn.doNotFightLowYieldHighlands
        strategyModules:
          - buildPoliticalEngine
          - arvn.blockImmediateWin
          - arvn.harvestPatronage
          - arvn.holdHighPopControl
          - arvn.protectAidEcon
          - arvn.selectiveViolence
          - arvn.denyUSIfNearWin
          - arvn.preCoupRedeployDiscipline
        turnShapeEvaluators:
          - currentTurnImpact
        considerations:
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
        guardrails:
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
        guardrails:
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

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
      arvnMargin:
        type: number
        expr:
          ref: victory.currentMargin.arvn
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
      distanceToCoup:
        type: number
        expr:
          coalesce:
            - { ref: schedule.distance.toBoundary.coupEntry.cards }
            - 999
      monsoonNow:
        type: boolean
        expr:
          lte:
            - scheduleLowerBound:
                ref: schedule.distance.toBoundary.coupEntry.cards
            - 2
      aid:
        type: number
        expr:
          ref: var.global.aid
      trail:
        type: number
        expr:
          ref: var.global.trail
      totalSupport:
        type: number
        expr:
          ref: metric.auto:victory:markerTotal:supportOpposition:activeSupport:passiveSupport
      totalOpposition:
        type: number
        expr:
          ref: metric.auto:victory:markerTotal:supportOpposition:activeOpposition:passiveOpposition
      nvaBaseCount:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: NVA }
                type: { eq: base }
      availableUsTroops:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: US }
                type: { eq: troops }
            zoneFilter:
              zoneIds:
                - available-US:none
            zoneScope: all
      availableUsBases:
        type: number
        expr:
          globalTokenAgg:
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: US }
                type: { eq: base }
            zoneFilter:
              zoneIds:
                - available-US:none
            zoneScope: all

    candidateFeatures:
      projectedSelfMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.self }
            - { ref: feature.selfMargin }
        previewFallback:
          onUnavailable: noContribution
      projectedNvaMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.nva }
            - { ref: feature.nvaMargin }
        previewFallback:
          onUnavailable: noContribution
      projectedVcMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.vc }
            - { ref: feature.vcMargin }
        previewFallback:
          onUnavailable: noContribution
      projectedUsMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.us }
            - { ref: feature.usMargin }
        previewFallback:
          onUnavailable: noContribution
      projectedArvnMargin:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentMargin.arvn }
            - { ref: feature.arvnMargin }
        previewFallback:
          onUnavailable: noContribution
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
      projectedArvnMarginDelta:
        type: number
        expr:
          sub:
            - { ref: feature.projectedArvnMargin }
            - { ref: feature.arvnMargin }
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
        previewFallback:
          onUnavailable: noContribution
      projectedSelfRank:
        type: number
        expr:
          coalesce:
            - { ref: preview.victory.currentRank.self }
            - { ref: feature.selfRank }
        previewFallback:
          onUnavailable: noContribution
      projectedCurrentLeaderMargin:
        type: number
        expr:
          seatAgg:
            over: { role: currentLeader }
            expr: { ref: preview.victory.currentMargin.$seat }
            aggOp: sum
            availability: selfAndTargetReady
        previewFallback:
          onUnavailable: noContribution
      projectedNearestThreatMargin:
        type: number
        expr:
          seatAgg:
            over: { role: nearestThreat }
            expr: { ref: preview.victory.currentMargin.$seat }
            aggOp: sum
            availability: selfAndTargetReady
        previewFallback:
          onUnavailable: noContribution
      projectedLeaderMarginDelta:
        type: number
        expr:
          coalesce:
            - sub:
                - { ref: feature.projectedCurrentLeaderMargin }
                - seatAgg:
                    over: { role: currentLeader }
                    expr: { ref: victory.currentMargin.$seat }
                    aggOp: sum
                    availability: selfAndTargetReady
            - 0
        previewFallback:
          onUnavailable: noContribution
      projectedAllyMarginDelta:
        type: number
        expr:
          coalesce:
            - { ref: preview.relationship.nominalAlly.gainValueDelta }
            - 0
        previewFallback:
          onUnavailable: noContribution
      projectedAidDelta:
        type: number
        expr:
          coalesce:
            - sub:
                - { ref: preview.var.global.aid }
                - { ref: var.global.aid }
            - 0
        previewFallback:
          onUnavailable: noContribution
      projectedTrailDelta:
        type: number
        expr:
          coalesce:
            - sub:
                - { ref: preview.var.global.trail }
                - { ref: var.global.trail }
            - 0
        previewFallback:
          onUnavailable: noContribution
      projectedSupportDelta:
        type: number
        expr:
          coalesce:
            - sub:
                - { ref: preview.feature.totalSupport }
                - { ref: feature.totalSupport }
            - 0
        previewFallback:
          onUnavailable: noContribution
      projectedOppositionDelta:
        type: number
        expr:
          coalesce:
            - sub:
                - { ref: preview.feature.totalOpposition }
                - { ref: feature.totalOpposition }
            - 0
        previewFallback:
          onUnavailable: noContribution

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
      arvnNearWin:
        description: "ARVN is close enough to a Patronage/control win that US treats ARVN gains as rival gains."
        target:
          gte:
            - { ref: feature.arvnMargin }
            - -1
        proximity:
          current:
            add:
              - { ref: feature.arvnMargin }
              - 1
          threshold: 1
      nvaNearWin:
        description: "NVA is close enough to a population/base win that VC treats NVA gains as rival gains."
        target:
          gte:
            - { ref: feature.nvaMargin }
            - -1
        proximity:
          current:
            add:
              - { ref: feature.nvaMargin }
              - 1
          threshold: 1
      vcNearWin:
        description: "VC is close enough to an Opposition/base win that NVA treats VC gains as rival gains."
        target:
          gte:
            - { ref: feature.vcMargin }
            - -1
        proximity:
          current:
            add:
              - { ref: feature.vcMargin }
              - 1
          threshold: 1
      selfCanWinNow:
        description: "Self projected margin crosses the win threshold under the current plan."
        target:
          gte:
            - { ref: feature.projectedSelfMargin }
            - 0
      currentLeaderNearWin:
        description: "Current leader is within near-win threshold; denial overrides ordinary efficiency."
        target:
          gte:
            - { ref: feature.projectedCurrentLeaderMargin }
            - -2
      coupImminent:
        description: "Coup is one card away or sooner; speculative setup is dominated by concrete swing."
        target:
          lte:
            - { ref: feature.distanceToCoup }
            - 1
      monsoonNow:
        description: "Monsoon is in effect; Sweep/March unavailable, Air Strike/Air Lift restricted."
        target:
          eq:
            - { ref: feature.monsoonNow }
            - true
      resourcesLow:
        description: "Self resources are below the operating floor."
        target:
          lt:
            - { ref: feature.selfResources }
            - 2
      allyNearWin:
        description: "Self's nominal ally is near win; their gains are rival gains."
        target:
          gte:
            - { ref: preview.relationship.nominalAlly.victoryMargin }
            - -1

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
            - id: authoredMapSpace
              value:
                boolToNumber:
                  not:
                    eq:
                      - coalesce:
                          - zoneProp:
                              zone: { ref: selector.item.key }
                              prop: category
                          - none
                      - none
              weight: 5
            - id: overstackedSafeOrigin
              value: 1
              weight: 3
            - id: preserveOriginControl
              value:
                ref: feature.coinControlPop
              weight: 1
          order: qualityDesc
        result: { maxItems: 32, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      arvn.transportDestination:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: authoredMapSpace
              value:
                boolToNumber:
                  not:
                    eq:
                      - coalesce:
                          - zoneProp:
                              zone: { ref: selector.item.key }
                              prop: category
                          - none
                      - none
              weight: 5
            - id: threatenedReinforcementRoute
              value: 1
              weight: 0
            - id: destinationControlGain
              value:
                ref: feature.projectedSelfMargin
              weight: 0
          order: qualityDesc
        result: { maxItems: 32, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
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
      us.trainSupportSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: pacificationPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 5
            - id: supportCanImprove
              value:
                boolToNumber:
                  not:
                    eq:
                      - lookup:
                          surface: policyState
                          collection: zones
                          keyType: ZoneId
                          key: { ref: selector.item.key }
                          path: [markers, supportOpposition]
                          onMissing: { kind: constant, value: neutral }
                      - activeSupport
              weight: 8
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.patrolEconLoc:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: econProtected
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: econ
                  - 0
              weight: 5
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
      us.sweepExposureSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: exposeBeforeAirStrike
              value: 1
              weight: 4
            - id: valuableSupportOrControl
              value:
                ref: feature.coinControlPop
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.assaultTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: nvaControlRemoval
              value:
                ref: feature.projectedNvaMargin
              weight: -1
            - id: vcBaseRemoval
              value:
                ref: feature.projectedVcMargin
              weight: -1
            - id: supportControlGain
              value:
                ref: feature.projectedUsMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.adviseTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: indigenousForceMultiplier
              value: 1
              weight: 5
            - id: aidAndRemovalSwing
              value:
                ref: feature.projectedUsMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftOrigin:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: overcommittedUSPresence
              value: 1
              weight: 4
            - id: preserveSupportControl
              value:
                ref: feature.projectedUsMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftDestination:
        scopes: [move]
        source:
          kind: routePairs
          origin: us.airLiftOrigin
          destination: us.assaultTargetSpace
          maxPairs: 64
        quality:
          components:
            - id: decisiveConcentration
              value: 1
              weight: 5
            - id: targetSupportGain
              value:
                ref: feature.projectedUsMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airStrikeTarget:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: zeroPopulationSafeStrike
              value:
                boolToNumber:
                  eq:
                    - coalesce:
                        - zoneProp:
                            zone: { ref: selector.item.key }
                            prop: population
                        - 0
                    - 0
              weight: 10
            - id: activeOppositionAirStrike
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
                    - activeOpposition
              weight: 4
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      # --- Spec 202 (US completion) item-local selectors. Per the P0 audit
      # (202FITLUSCOMP-001), per-zone faction-token counts are not expressible in
      # the agent-policy selector surface; control/terror are proxied by
      # zoneProp.population + the supportOpposition marker, which are item-local. ---
      us.pacifyTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: pacificationPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 5
            - id: supportCanImprove
              value:
                boolToNumber:
                  not:
                    eq:
                      - lookup:
                          surface: policyState
                          collection: zones
                          keyType: ZoneId
                          key: { ref: selector.item.key }
                          path: [markers, supportOpposition]
                          onMissing: { kind: constant, value: neutral }
                      - activeSupport
              weight: 8
            - id: oppositionReclaim
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
                    - activeOpposition
              weight: 3
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.patrolLocTarget:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: locEconValue
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: econ
                  - 0
              weight: 5
            - id: locCategory
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: category
                    - loc
              weight: 3
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftAssaultOrigin:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: avoidControlCriticalOrigin
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: -5
            - id: avoidStrippingSupportedSpace
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
              weight: -3
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftRouteDestination:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: highValueObjective
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 4
            - id: enemyStronghold
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
                    - activeOpposition
              weight: 6
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftControlOrigin:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: liftFromLowValueOvercommitment
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: -4
            - id: nothingToHold
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
                    - neutral
              weight: 2
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.airLiftControlDestination:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: controlPreservationPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 5
            - id: notLostToOpposition
              value:
                boolToNumber:
                  not:
                    eq:
                      - lookup:
                          surface: policyState
                          collection: zones
                          keyType: ZoneId
                          key: { ref: selector.item.key }
                          path: [markers, supportOpposition]
                          onMissing: { kind: constant, value: neutral }
                      - activeOpposition
              weight: 2
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      us.assaultHighValueTarget:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: enemyControlledHighValue
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
                    - activeOpposition
              weight: 6
            - id: populationStakes
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 3
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.rallyBaseOrTrailSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: trailAndBaseLogistics
              value:
                coalesce:
                  - { ref: feature.projectedNvaMargin }
                  - 0
              weight: 2
            - id: laosCambodiaLogistics
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: country
                    - laosCambodia
              weight: 6
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.marchExpansionSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: populationControl
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 4
            - id: controlSwing
              value:
                ref: feature.projectedNvaMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.infiltrateTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: vcBaseTakeover
              value: 1
              weight: 6
            - id: nvaTroopBuild
              value:
                ref: feature.projectedNvaMargin
              weight: 1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.ambushTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: coinControlBreak
              value:
                ref: feature.projectedNvaMargin
              weight: 1
            - id: usCommitmentDamage
              value:
                ref: feature.projectedUsMargin
              weight: -1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.attackTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: baseOrControlProtection
              value:
                ref: feature.projectedNvaMargin
              weight: 1
            - id: coinThreatReduction
              value:
                ref: feature.projectedUsMargin
              weight: -1
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.terrorSupportDenialSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: supportDenialPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 3
            - id: rallyPreparation
              value: 1
              weight: 4
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      nva.locOccupationSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: econDisruption
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: econ
                  - 0
              weight: 5
            - id: locMobilityThreat
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: category
                    - loc
              weight: 8
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.rallyBaseOrUndergroundSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: baseProtection
              value:
                coalesce:
                  - { ref: feature.projectedVcMargin }
                  - 0
              weight: 2
            - id: undergroundReset
              value: 1
              weight: 6
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.marchPoliticalCellSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: supportInfiltration
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 4
            - id: undergroundCellSpread
              value: 1
              weight: 5
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.terrorAgitationSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: oppositionPopulation
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 5
            - id: supportDenial
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
              weight: 6
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.subvertArvnControlSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: arvnCubeDisruption
              value:
                coalesce:
                  - { ref: feature.projectedArvnMargin }
                  - 0
              weight: -2
            - id: controlBreak
              value: 1
              weight: 7
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.taxFundingSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: locTaxSafe
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: category
                    - loc
              weight: 8
            - id: resourceYield
              value:
                coalesce:
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: econ
                  - zoneProp:
                      zone: { ref: selector.item.key }
                      prop: population
                  - 0
              weight: 3
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.ambushSurgicalTargetSpace:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: surgicalControlRemoval
              value:
                ref: feature.projectedVcMargin
              weight: 1
            - id: coinPieceThreat
              value: 1
              weight: 6
          order: qualityDesc
        result: { maxItems: 8, order: [qualityDesc, stableKeyAsc], onEmpty: noContribution }
      vc.locAmbushPlatform:
        scopes: [move]
        source:
          collection: { kind: zones }
        quality:
          components:
            - id: locPlatform
              value:
                boolToNumber:
                  eq:
                    - zoneProp:
                        zone: { ref: selector.item.key }
                        prop: category
                    - loc
              weight: 8
            - id: adjacentPoliticalThreat
              value: 1
              weight: 4
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
          transportOrigin: { selector: arvn.transportOrigin, required: true }
          transportDestination:
            selector: arvn.transportDestination
            required: true
            constraints:
              - { reachable: { from: role.transportOrigin, to: role.transportDestination, via: routeClass.land } }
              - { distinctOriginDestination: { origin: role.transportOrigin, destination: role.transportDestination } }
              - { notEqual: role.trainSpace }
              - postState:
                  step: transport-destination
                  role: role.transportDestination
                  maxSteps: 8
                  predicate:
                    condition:
                      bindings:
                        origin: role.transportOrigin
                      when:
                        op: '>'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: { zoneExpr: { ref: binding, name: origin } }
                              filter:
                                op: and
                                args:
                                  - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        right:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: { zoneExpr: { ref: binding, name: origin } }
                              filter:
                                op: and
                                args:
                                  - { prop: faction, op: in, value: ['NVA', 'VC'] }
        steps:
          - { label: train-space, role: trainSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
          - { label: transport-destination, role: transportDestination, match: { decisionKind: chooseOne, targetKind: zone, decisionPath: transportDestination, actionTag: transport } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      arvn.assaultTransportAssault:
        traceLabel: "ARVN Assault, Transport, Assault"
        root: { actionTags: [assault], compound: { specialTags: [transport], timing: during, interruptAfterStage: 1 } }
        postureHook: arvn.preserveAidAndMargin
        roles:
          firstAssaultSpace: { selector: arvn.assaultTargetSpace, required: true }
          transportRoute: { selector: arvn.transportDestination, required: true, constraints: [{ notEqual: role.firstAssaultSpace }] }
        steps:
          - { label: first-assault-space, role: firstAssaultSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 0 } }
          - { label: transport-route, role: transportRoute, match: { decisionKind: chooseOne, targetKind: zone, decisionPath: transportDestination, actionTag: transport } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifSpecialUnavailable: primitivePolicy, ifRoleTargetUnavailable: primitivePolicy }
      us.trainAdvise:
        traceLabel: "US Train then Advise"
        root: { actionTags: [train], compound: { specialTags: [advise], timing: after } }
        postureHook: us.preserveSupportAndAvailability
        roles:
          trainSpace: { selector: us.trainSupportSpace, required: true }
          adviseSpace: { selector: us.adviseTargetSpace, required: true, constraints: [{ notEqual: role.trainSpace }] }
        steps:
          - { label: train-support-space, role: trainSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
          - { label: advise-force-multiplier, role: adviseSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: advise } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      us.patrolAdvise:
        traceLabel: "US Patrol then Advise"
        root: { actionTags: [patrol], compound: { specialTags: [advise], timing: after } }
        postureHook: us.preserveSupportAndAvailability
        roles:
          patrolLoc: { selector: us.patrolLocTarget, required: true }
          adviseSpace: { selector: us.adviseTargetSpace, required: true, constraints: [{ notEqual: role.patrolLoc }] }
        steps:
          - { label: patrol-loc, role: patrolLoc, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetLoCs, actionTag: patrol } }
          - { label: advise-space, role: adviseSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: advise } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      us.sweepAirStrike:
        traceLabel: "US Sweep then Air Strike"
        root: { actionTags: [sweep], compound: { specialTags: [air-strike], timing: after } }
        postureHook: us.preserveSupportAndAvailability
        roles:
          sweepSpace: { selector: us.sweepExposureSpace, required: true }
          airStrikeSpace: { selector: us.airStrikeTarget, required: true }
        steps:
          - { label: sweep-expose-space, role: sweepSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: sweep } }
          - { label: air-strike-space, role: airStrikeSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-strike } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      us.assaultAirLiftAssault:
        traceLabel: "US Assault, Air Lift, Assault"
        root: { actionTags: [assault], compound: { specialTags: [air-lift], timing: during, interruptAfterStage: 1 } }
        postureHook: us.preserveSupportAndAvailability
        roles:
          firstAssaultSpace: { selector: us.assaultTargetSpace, required: true }
          airLiftRoute: { selector: us.airLiftDestination, required: true, constraints: [{ notEqual: role.firstAssaultSpace }] }
        steps:
          - { label: first-assault-space, role: firstAssaultSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 0 } }
          - { label: air-lift-route, role: airLiftRoute, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-lift } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifSpecialUnavailable: primitivePolicy, ifRoleTargetUnavailable: primitivePolicy }
      # --- Spec 202 (US completion) plan templates. us.eventDirectSwing is
      # deliberately NOT authored as a plan template (see §4.1 / §11): events share
      # the single `event` action but expose heterogeneous, card-specific decisions
      # with no uniform bindable decisionPath, and the engine requires every template
      # to bind at least one role+step. The event direct-swing doctrine is already
      # encoded by the bound shared.eventDirectSwing strategy module. Reversible. ---
      us.trainPacify:
        traceLabel: "US Train as Pacification carrier"
        root: { actionTags: [train] }
        postureHook: us.preserveSupportAndAvailability
        roles:
          pacifySpace: { selector: us.pacifyTargetSpace, required: true }
        steps:
          - { label: pacify-space, role: pacifySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: train } }
        caps: { capClass: standard256, maxSteps: 1 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      us.airLiftAssault:
        traceLabel: "US Assault, Air Lift, Assault (mass Troops)"
        root: { actionTags: [assault], compound: { specialTags: [air-lift], timing: during, interruptAfterStage: 1 } }
        postureHook: us.preserveSupportAndAvailability
        roles:
          assaultOrigin: { selector: us.airLiftAssaultOrigin, required: true }
          airLiftDestination:
            selector: us.airLiftRouteDestination
            required: true
            constraints:
              - { reachable: { from: role.assaultOrigin, to: role.airLiftDestination, via: routeClass.land } }
              - { distinctOriginDestination: { origin: role.assaultOrigin, destination: role.airLiftDestination } }
        steps:
          - { label: first-assault-space, role: assaultOrigin, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault, stageIndex: 0 } }
          - { label: air-lift-route, role: airLiftDestination, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-lift } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifSpecialUnavailable: primitivePolicy, ifRoleTargetUnavailable: primitivePolicy }
      us.airLiftControlOrWithdrawal:
        traceLabel: "US Air Lift to preserve Control or withdraw"
        root: { actionTags: [air-lift] }
        postureHook: us.preserveSupportAndAvailability
        roles:
          airLiftOrigin: { selector: us.airLiftControlOrigin, required: true }
          airLiftDestination:
            selector: us.airLiftControlDestination
            required: true
            constraints:
              - { reachable: { from: role.airLiftOrigin, to: role.airLiftDestination, via: routeClass.land } }
        steps:
          - { label: air-lift-route, role: airLiftDestination, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: spaces, actionTag: air-lift } }
        caps: { capClass: standard256, maxSteps: 1 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      us.assaultHighValueInfrastructure:
        traceLabel: "US Assault high-value infrastructure (Base / Control removal)"
        root: { actionTags: [assault] }
        postureHook: us.preserveSupportAndAvailability
        roles:
          assaultTarget: { selector: us.assaultHighValueTarget, required: true }
        steps:
          - { label: assault-high-value, role: assaultTarget, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: assault } }
        caps: { capClass: standard256, maxSteps: 1 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      nva.rallyInfiltrate:
        traceLabel: "NVA Rally then Infiltrate"
        root: { actionTags: [rally], compound: { specialTags: [infiltrate], timing: after } }
        postureHook: nva.protectLogisticsAndBases
        roles:
          rallySpace: { selector: nva.rallyBaseOrTrailSpace, required: true }
          infiltrateSpace: { selector: nva.infiltrateTargetSpace, required: true }
        steps:
          - { label: rally-logistics-space, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
          - { label: infiltrate-build-or-takeover, role: infiltrateSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: infiltrate } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      nva.marchInfiltrate:
        traceLabel: "NVA March then Infiltrate"
        root: { actionTags: [march], compound: { specialTags: [infiltrate], timing: after } }
        postureHook: nva.protectLogisticsAndBases
        roles:
          marchSpace: { selector: nva.marchExpansionSpace, required: true }
          infiltrateSpace: { selector: nva.infiltrateTargetSpace, required: true }
        steps:
          - { label: march-expansion-space, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
          - { label: infiltrate-vc-base-or-build, role: infiltrateSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: infiltrate } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      nva.marchAmbush:
        traceLabel: "NVA March then Ambush"
        root: { actionTags: [march], compound: { specialTags: [ambush-nva], timing: after } }
        postureHook: nva.protectLogisticsAndBases
        roles:
          marchSpace: { selector: nva.marchExpansionSpace, required: true }
          ambushSpace: { selector: nva.ambushTargetSpace, required: true }
        steps:
          - { label: march-ambush-position, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
          - { label: ambush-control-piece, role: ambushSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-nva } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      nva.attackAmbush:
        traceLabel: "NVA Attack then Ambush"
        root: { actionTags: [attack], compound: { specialTags: [ambush-nva], timing: after } }
        postureHook: nva.protectLogisticsAndBases
        roles:
          attackSpace: { selector: nva.attackTargetSpace, required: true }
          ambushSpace: { selector: nva.ambushTargetSpace, required: true }
        steps:
          - { label: attack-control-space, role: attackSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: attack } }
          - { label: ambush-high-leverage-piece, role: ambushSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-nva } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      nva.locOccupationBeforeCoup:
        traceLabel: "NVA occupy LoCs before Coup"
        root: { actionTags: [march], compound: { specialTags: [ambush-nva], timing: after } }
        postureHook: nva.protectLogisticsAndBases
        roles:
          locSpace: { selector: nva.locOccupationSpace, required: true }
          ambushSpace: { selector: nva.ambushTargetSpace, required: false }
        steps:
          - { label: loc-occupation-space, role: locSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
          - { label: loc-ambush-threat, role: ambushSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-nva } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      vc.rallySubvert:
        traceLabel: "VC Rally then Subvert"
        root: { actionTags: [rally], compound: { specialTags: [subvert], timing: after } }
        postureHook: vc.protectOppositionAndBases
        roles:
          rallySpace: { selector: vc.rallyBaseOrUndergroundSpace, required: true }
          subvertSpace: { selector: vc.subvertArvnControlSpace, required: true }
        steps:
          - { label: rally-political-network, role: rallySpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: rally } }
          - { label: subvert-arvn-control, role: subvertSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: subvert } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      vc.marchSubvert:
        traceLabel: "VC March then Subvert"
        root: { actionTags: [march], compound: { specialTags: [subvert], timing: after } }
        postureHook: vc.protectOppositionAndBases
        roles:
          marchSpace: { selector: vc.marchPoliticalCellSpace, required: true }
          subvertSpace: { selector: vc.subvertArvnControlSpace, required: true }
        steps:
          - { label: march-underground-cell, role: marchSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
          - { label: subvert-arvn-control, role: subvertSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: subvert } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      vc.terrorSubvert:
        traceLabel: "VC Terror then Subvert"
        root: { actionTags: [terror], compound: { specialTags: [subvert], timing: after } }
        postureHook: vc.protectOppositionAndBases
        roles:
          terrorSpace: { selector: vc.terrorAgitationSpace, required: true }
          subvertSpace: { selector: vc.subvertArvnControlSpace, required: true }
        steps:
          - { label: terror-political-space, role: terrorSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
          - { label: subvert-arvn-control, role: subvertSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: subvert } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      vc.terrorTax:
        traceLabel: "VC Terror then Tax"
        root: { actionTags: [terror], compound: { specialTags: [tax], timing: after } }
        postureHook: vc.protectOppositionAndBases
        roles:
          terrorSpace: { selector: vc.terrorAgitationSpace, required: true }
          taxSpace: { selector: vc.taxFundingSpace, required: true }
        steps:
          - { label: terror-political-space, role: terrorSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: terror } }
          - { label: tax-safe-funding, role: taxSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: tax } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
      vc.marchAmbushFromLoc:
        traceLabel: "VC March then Ambush from LoC"
        root: { actionTags: [march], compound: { specialTags: [ambush-vc], timing: after } }
        postureHook: vc.protectOppositionAndBases
        roles:
          locPlatform: { selector: vc.locAmbushPlatform, required: true }
          ambushSpace: { selector: vc.ambushSurgicalTargetSpace, required: true }
        steps:
          - { label: loc-ambush-platform, role: locPlatform, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: march } }
          - { label: surgical-ambush, role: ambushSpace, match: { decisionKind: chooseNStep, targetKind: zone, decisionPath: targetSpaces, actionTag: ambush-vc } }
        caps: { capClass: standard256, maxSteps: 2 }
        fallback: { ifRoleTargetUnavailable: primitivePolicy }
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
      us.preserveSupportAndAvailability:
        traceLabel: "US preserve Support and US availability"
        must:
          - id: resource-floor
            condition:
              gte:
                - { ref: feature.selfResources }
                - 1
            onViolation: demote
            demotePenalty: -250
        prefer:
          - id: own-margin
            value:
              ref: preview.victory.currentMargin.self
            weight: 30
            fallback:
              contribution: 0
          - id: arvn-rival-risk
            when:
              eq:
                - { ref: relationship.nearWin.seat }
                - { ref: relationship.nominalAlly.seat }
            value:
              ref: relationship.nominalAlly.gainValue
            weight: -20
            fallback:
              contribution: 0
          # Spec 202 (US completion): strengthen with projected-Support and
          # Available-US preference terms (Foundation 20 fallback: contribution 0).
          - id: projected-support-delta
            value:
              ref: feature.projectedSupportDelta
            weight: 4
            fallback:
              contribution: 0
          - id: available-us
            value:
              coalesce:
                - { ref: preview.feature.availableUsTroops }
                - { ref: feature.availableUsTroops }
            weight: 3
            fallback:
              contribution: 0
      nva.protectLogisticsAndBases:
        traceLabel: "NVA protect logistics, Bases, and ally-rival leverage"
        must:
          - id: resource-floor
            condition:
              gte:
                - { ref: feature.selfResources }
                - 1
            onViolation: demote
            demotePenalty: -250
        prefer:
          - id: own-margin
            value:
              ref: preview.victory.currentMargin.self
            weight: 30
            fallback:
              contribution: 0
          - id: vc-rival-risk
            when:
              eq:
                - { ref: relationship.nearWin.seat }
                - { ref: relationship.nominalAlly.seat }
            value:
              ref: relationship.nominalAlly.gainValue
            weight: -20
            fallback:
              contribution: 0
      vc.protectOppositionAndBases:
        traceLabel: "VC protect Opposition, Bases, and NVA ally-rival leverage"
        must:
          - id: resource-floor
            condition:
              gte:
                - { ref: feature.selfResources }
                - 1
            onViolation: demote
            demotePenalty: -250
        prefer:
          - id: own-margin
            value:
              ref: preview.victory.currentMargin.self
            weight: 30
            fallback:
              contribution: 0
          - id: nva-rival-risk
            when:
              eq:
                - { ref: relationship.nearWin.seat }
                - { ref: relationship.nominalAlly.seat }
            value:
              ref: relationship.nominalAlly.gainValue
            weight: -20
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
      us.arvnNominalAlly:
        role: nominalAlly
        seat: arvn
        priority: 10
        gainValue:
          ref: victory.currentMargin.arvn
      us.arvnNearWin:
        role: nearWin
        seat: arvn
        condition: arvnNearWin
        priority: 20
        gainValue:
          ref: victory.currentMargin.arvn
      nva.vcNominalAlly:
        role: nominalAlly
        seat: vc
        priority: 10
        gainValue:
          ref: victory.currentMargin.vc
      nva.vcNearWin:
        role: nearWin
        seat: vc
        condition: vcNearWin
        priority: 20
        gainValue:
          ref: victory.currentMargin.vc
      vc.nvaNominalAlly:
        role: nominalAlly
        seat: nva
        priority: 10
        gainValue:
          ref: victory.currentMargin.nva
      vc.nvaNearWin:
        role: nearWin
        seat: nva
        condition: nvaNearWin
        priority: 20
        gainValue:
          ref: victory.currentMargin.nva

    strategyModules:
      shared.immediateWin:
        traceLabel: "complete immediate win"
        when:
          ref: condition.selfCanWinNow.satisfied
        applies:
          scopes: [move]
        priority:
          tier: 90
        scoreGroups:
          - id: immediateWin
            summary: sum
            terms:
              - weight: 10
                value:
                  ref: feature.projectedSelfMargin
      shared.blockCurrentLeader:
        traceLabel: "block current leader"
        when:
          ref: condition.currentLeaderNearWin.satisfied
        applies:
          scopes: [move]
          actionTags: [govern, patrol, sweep, assault, train, air-strike, march, attack, infiltrate, bombard]
        priority:
          tier: 80
        scoreGroups:
          - id: leaderDenial
            summary: sum
            terms:
              - weight: 10
                value:
                  sub:
                    - 0
                    - { ref: feature.projectedLeaderMarginDelta }
      shared.nearCoupConcreteSwing:
        traceLabel: "concrete coup swing"
        when:
          ref: condition.coupImminent.satisfied
        applies:
          scopes: [move]
        priority:
          tier: 70
        scoreGroups:
          - id: concreteCoupSwing
            summary: sum
            terms:
              - weight: 5
                value:
                  add:
                    - { ref: feature.projectedSelfMarginDelta }
                    - { ref: feature.projectedAidDelta }
      shared.resourceLogistics:
        traceLabel: "preserve resources and logistics"
        when:
          ref: condition.resourcesLow.satisfied
        applies:
          scopes: [move]
        priority:
          tier: 60
        scoreGroups:
          - id: logisticsSwing
            summary: sum
            terms:
              - weight: 4
                value:
                  add:
                    - { ref: feature.projectedAidDelta }
                    - { ref: feature.projectedTrailDelta }
      shared.eventDirectSwing:
        traceLabel: "play event for direct swing"
        when:
          ref: candidate.tag.event-play
        applies:
          scopes: [move]
        priority:
          tier: 50
        scoreGroups:
          - id: eventSwing
            summary: sum
            terms:
              - weight: 8
                value:
                  ref: feature.projectedSelfMargin
      shared.allyRivalThrottle:
        traceLabel: "throttle ally gains when ally near win"
        when:
          ref: condition.allyNearWin.satisfied
        applies:
          scopes: [move]
        priority:
          tier: 65
        scoreGroups:
          - id: allyRivalRisk
            summary: sum
            terms:
              - weight: -6
                value:
                  ref: feature.projectedAllyMarginDelta
      shared.monsoonOperationalRestriction:
        traceLabel: "avoid Sweep and March under Monsoon"
        when:
          ref: condition.monsoonNow.satisfied
        applies:
          scopes: [move]
          actionTags: [sweep, march]
        priority:
          tier: 75
        scoreGroups: []
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
        suppressesPlanTemplates:
          - arvn.sweepRaid
          - us.sweepAirStrike
          - nva.marchInfiltrate
          - nva.marchAmbush
          - nva.locOccupationBeforeCoup
          - vc.marchSubvert
          - vc.marchAmbushFromLoc
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
        enablesPlanTemplates:
          - arvn.trainGovern
          - arvn.patrolGovern
        suppressesPlanTemplates:
          - arvn.assaultRaid
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
      us.createAndDefendSupport:
        traceLabel: "US create and defend Support"
        when: true
        applies:
          scopes: [move]
          actionTags: [train, patrol, sweep]
        priority:
          tier: 80
        selectors:
          - { role: trainTarget, selectorId: us.trainSupportSpace }
          - { role: patrolTarget, selectorId: us.patrolEconLoc }
          - { role: sweepTarget, selectorId: us.sweepExposureSpace }
        scoreGroups:
          - id: supportSecurity
            summary: sum
            terms:
              - { id: pacificationSetup, weight: 6, value: 1 }
              - { id: econProtection, weight: 4, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      us.forceMultiplier:
        traceLabel: "US use Advise and Air Lift as force multipliers"
        when: true
        applies:
          scopes: [move]
          actionTags: [advise, air-lift]
        priority:
          tier: 70
        selectors:
          - { role: adviseTarget, selectorId: us.adviseTargetSpace }
          - { role: airLiftRoute, selectorId: us.airLiftDestination }
        scoreGroups:
          - id: forceMultiplier
            summary: sum
            terms:
              - { id: adviseValue, weight: 7, value: 1 }
              - { id: airLiftValue, weight: 7, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      # --- Spec 202 (US completion) strategy modules. Score via prefer-style terms
      # over existing/authored features; no new tunable parameters. ---
      us.buildSupport:
        traceLabel: "US build Support engine"
        when:
          lt:
            - { ref: feature.totalSupport }
            - 30
        applies:
          scopes: [move]
          actionTags: [train, patrol]
        priority:
          tier: 40
        scoreGroups:
          - id: supportYield
            summary: sum
            terms:
              - { id: projectedSupportGain, weight: 5, value: { ref: feature.projectedSupportDelta } }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
        enablesPlanTemplates:
          - us.trainPacify
          - us.patrolAdvise
          - us.trainAdvise
      us.preserveAvailability:
        traceLabel: "US preserve availability"
        when:
          lt:
            - { ref: feature.availableUsTroops }
            - 4
        applies:
          scopes: [move]
        priority:
          tier: 35
        scoreGroups:
          - id: availability
            summary: sum
            terms:
              - id: preserveAvailableUs
                weight: -3
                value:
                  coalesce:
                    - { ref: preview.feature.availableUsTroops }
                    - { ref: feature.availableUsTroops }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
        suppressesPlanTemplates:
          - us.airLiftAssault
      us.protectAidEcon:
        traceLabel: "US protect Aid and Econ"
        when:
          lt:
            - { ref: var.global.aid }
            - 15
        applies:
          scopes: [move]
          actionTags: [patrol, train]
        priority:
          tier: 30
        scoreGroups:
          - id: aidProtection
            summary: sum
            terms:
              - { id: projectedAidGain, weight: 4, value: { ref: feature.projectedAidDelta } }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
        enablesPlanTemplates:
          - us.patrolAdvise
          - us.trainAdvise
      us.avoidArvnKingmaking:
        traceLabel: "US throttle Support gains that help ARVN near win"
        when:
          ref: condition.arvnNearWin.satisfied
        applies:
          scopes: [move]
        priority:
          tier: 60
        scoreGroups:
          - id: arvnKingmakerRisk
            summary: sum
            terms:
              - id: arvnMarginRisk
                weight: -5
                value: { ref: feature.projectedArvnMarginDelta }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
        suppressesPlanTemplates:
          - us.trainPacify
          - us.patrolAdvise
      nva.logisticsAndTrail:
        traceLabel: "NVA maintain Trail and logistics"
        when: true
        applies:
          scopes: [move]
          actionTags: [rally, march, infiltrate]
        priority:
          tier: 80
        selectors:
          - { role: rallyTarget, selectorId: nva.rallyBaseOrTrailSpace }
          - { role: locTarget, selectorId: nva.locOccupationSpace }
        scoreGroups:
          - id: logistics
            summary: sum
            terms:
              - { id: trailValue, weight: 6, value: 1 }
              - { id: baseNetwork, weight: 6, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      nva.controlAndBases:
        traceLabel: "NVA build control and protect Bases"
        when: true
        applies:
          scopes: [move]
          actionTags: [march, attack, rally]
        priority:
          tier: 70
        selectors:
          - { role: marchTarget, selectorId: nva.marchExpansionSpace }
          - { role: attackTarget, selectorId: nva.attackTargetSpace }
          - { role: rallyTarget, selectorId: nva.rallyBaseOrTrailSpace }
        scoreGroups:
          - id: controlBaseValue
            summary: sum
            terms:
              - { id: populationControl, weight: 7, value: 1 }
              - { id: baseProtection, weight: 5, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      nva.vcRivalLeverage:
        traceLabel: "NVA exploit VC without serving a VC win"
        when: true
        applies:
          scopes: [move]
          actionTags: [infiltrate, march]
        priority:
          tier: 60
        selectors:
          - { role: infiltrateTarget, selectorId: nva.infiltrateTargetSpace }
        scoreGroups:
          - id: allyRival
            summary: sum
            terms:
              - { id: vcBaseTakeover, weight: 7, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      vc.buildPoliticalNetwork:
        traceLabel: "VC build hidden political network"
        when: true
        applies:
          scopes: [move]
          actionTags: [rally, march, terror]
        priority:
          tier: 85
        selectors:
          - { role: rallyTarget, selectorId: vc.rallyBaseOrUndergroundSpace }
          - { role: marchTarget, selectorId: vc.marchPoliticalCellSpace }
          - { role: terrorTarget, selectorId: vc.terrorAgitationSpace }
        scoreGroups:
          - id: politicalNetwork
            summary: sum
            terms:
              - { id: undergroundCells, weight: 6, value: 1 }
              - { id: oppositionPressure, weight: 8, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      vc.subvertRegimeSecurity:
        traceLabel: "VC hollow out ARVN security"
        when: true
        applies:
          scopes: [move]
          actionTags: [subvert, terror, march]
        priority:
          tier: 75
        selectors:
          - { role: subvertTarget, selectorId: vc.subvertArvnControlSpace }
          - { role: terrorTarget, selectorId: vc.terrorAgitationSpace }
        scoreGroups:
          - id: regimeDisruption
            summary: sum
            terms:
              - { id: subvertControlBreak, weight: 8, value: 1 }
              - { id: pacificationDenial, weight: 5, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      vc.fundAndAmbushCarefully:
        traceLabel: "VC tax carefully and ambush surgically"
        when: true
        applies:
          scopes: [move]
          actionTags: [tax, ambush-vc, attack]
        priority:
          tier: 65
        selectors:
          - { role: taxTarget, selectorId: vc.taxFundingSpace }
          - { role: ambushTarget, selectorId: vc.ambushSurgicalTargetSpace }
        scoreGroups:
          - id: carefulViolence
            summary: sum
            terms:
              - { id: locTaxSafety, weight: 6, value: 1 }
              - { id: surgicalRemoval, weight: 7, value: 1 }
        guardrailIds: []
        fallback: { ifInactive: noContribution, ifSelectorEmpty: noContribution }
      vc.denyNvaIfNearWin:
        traceLabel: "VC deny NVA if near win"
        when: true
        applies:
          scopes: [move]
          actionTags: [march, ambush-vc, subvert]
        priority:
          tier: 55
        selectors:
          - { role: ambushTarget, selectorId: vc.ambushSurgicalTargetSpace }
          - { role: marchTarget, selectorId: vc.marchPoliticalCellSpace }
        scoreGroups:
          - id: allyRivalDenial
            summary: sum
            terms:
              - { id: avoidNvaDominance, weight: 6, value: 1 }
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
        # Origin-control admissibility is enforced by arvn.trainTransport postState constraints; this remains posture scoring.
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
      us.avoidPoliticalAirStrike:
        traceLabel: "US avoid Air Strike in populated Support without decisive payoff"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.air-strike }
            - lt:
                - { ref: feature.projectedUsMarginDelta }
                - 2
        severity: demote
        penalty: 700
        onUnavailable: noFire
      # --- Spec 202 (US completion) guardrails. "veto" intent (spec §4.5) is
      # encoded as high-penalty demote — the FITL idiom (cf. arvn.doNotServeUSWin);
      # prune is reserved for the pass-drop guardrail to never eliminate the last
      # legal move. us.airStrikePoliticalCost (spec §4.4) is NOT authored: it
      # duplicates us.avoidPoliticalAirStrike above (both demote Air Strike on
      # negative projected support/margin), and posture evaluators cannot tag-filter
      # to air-strike nor apply without a template postureHook. Dedupe = retain the
      # guardrail, drop the posture (P2 decision). us.aidEconFloor (spec §4.4) is
      # authored as a guardrail (not a posture) so it actually fires per-candidate —
      # an unhooked posture is inert (plan-proposal.ts only applies template hooks). ---
      us.aidEconFloor:
        traceLabel: "US avoid dropping Aid below the floor"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.patrol }
                - { ref: candidate.tag.train }
                - { ref: candidate.tag.assault }
                - { ref: candidate.tag.air-strike }
            - lt:
                - coalesce:
                    - { ref: preview.var.global.aid }
                    - { ref: var.global.aid }
                - 10
        severity: demote
        penalty: 400
        onUnavailable: noFire
      us.avoidOvercommitment:
        traceLabel: "US avoid overcommitment without Support yield"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.air-lift }
                - { ref: candidate.tag.assault }
            - lte:
                - { ref: feature.availableUsTroops }
                - 2
            - lt:
                - { ref: feature.projectedSupportDelta }
                - 1
        severity: demote
        penalty: 800
        onUnavailable: noFire
      us.avoidArvnKingmaking:
        traceLabel: "US do not king-make ARVN near win"
        scopes: [move]
        when:
          and:
            - { ref: condition.arvnNearWin.satisfied }
            - not: { ref: condition.usNearWin.satisfied }
            - or:
                - { ref: candidate.tag.train }
                - { ref: candidate.tag.pacify }
            - gt:
                - { ref: feature.projectedArvnMarginDelta }
                - 0
        severity: demote
        penalty: 600
        onUnavailable: noFire
      nva.doNotServeVcWin:
        traceLabel: "NVA do not serve a VC win"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.infiltrate }
            - gt:
                - { ref: feature.projectedVcMargin }
                - { ref: feature.vcMargin }
        severity: demote
        penalty: 600
        onUnavailable: noFire
      nva.preserveTrailAndBases:
        traceLabel: "NVA preserve Trail and Base logistics"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.march }
                - { ref: candidate.tag.rally }
            - lt:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 500
        onUnavailable: noFire
      nva.avoidLowYieldAttrition:
        traceLabel: "NVA avoid low-yield attrition"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.attack }
                - { ref: candidate.tag.bombard }
            - lte:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 350
        onUnavailable: noFire
      vc.avoidConventionalAttackWithoutAmbush:
        traceLabel: "VC avoid conventional Attack without Ambush payoff"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.attack }
            - lte:
                - { ref: feature.projectedSelfMarginDelta }
                - 0
        severity: demote
        penalty: 550
        onUnavailable: noFire
      vc.protectBasesFromNvaInfiltrate:
        traceLabel: "VC protect Bases from NVA Infiltrate"
        scopes: [move]
        when:
          and:
            - or:
                - { ref: candidate.tag.rally }
                - { ref: candidate.tag.march }
            - gte:
                - { ref: feature.nvaMargin }
                - -2
        severity: demote
        penalty: 400
        onUnavailable: noFire
      vc.avoidHighPopTaxWithoutPoliticalPlan:
        traceLabel: "VC avoid high-pop Tax without political offset"
        scopes: [move]
        when:
          and:
            - { ref: candidate.tag.tax }
            - lt:
                - { ref: feature.projectedSelfMarginDelta }
                - 1
        severity: demote
        penalty: 350
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
          - us.avoidPoliticalAirStrike
          - us.aidEconFloor
          - us.avoidOvercommitment
          - us.avoidArvnKingmaking
        strategyModules:
          - shared.immediateWin
          - shared.blockCurrentLeader
          - shared.nearCoupConcreteSwing
          - shared.resourceLogistics
          - shared.eventDirectSwing
          - shared.allyRivalThrottle
          - shared.monsoonOperationalRestriction
          - us.createAndDefendSupport
          - us.forceMultiplier
          - us.preserveAvailability
          - us.buildSupport
          - us.protectAidEcon
          - us.avoidArvnKingmaking
        planTemplates:
          - us.trainAdvise
          - us.patrolAdvise
          - us.sweepAirStrike
          - us.assaultAirLiftAssault
          - us.trainPacify
          - us.airLiftAssault
          - us.airLiftControlOrWithdrawal
          - us.assaultHighValueInfrastructure
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
          - shared.immediateWin
          - shared.blockCurrentLeader
          - shared.nearCoupConcreteSwing
          - shared.resourceLogistics
          - shared.eventDirectSwing
          - shared.allyRivalThrottle
          - shared.monsoonOperationalRestriction
          - buildPoliticalEngine
          - arvn.harvestPatronage
          - arvn.holdHighPopControl
          - arvn.protectAidEcon
          - arvn.selectiveViolence
          - arvn.denyUSIfNearWin
          - arvn.preCoupRedeployDiscipline
        planTemplates:
          - arvn.trainGovern
          - arvn.patrolGovern
          - arvn.sweepRaid
          - arvn.assaultRaid
          - arvn.trainTransport
          - arvn.assaultTransportAssault
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
          - nva.doNotServeVcWin
          - nva.preserveTrailAndBases
          - nva.avoidLowYieldAttrition
        strategyModules:
          - shared.immediateWin
          - shared.blockCurrentLeader
          - shared.nearCoupConcreteSwing
          - shared.resourceLogistics
          - shared.eventDirectSwing
          - shared.allyRivalThrottle
          - shared.monsoonOperationalRestriction
          - nva.logisticsAndTrail
          - nva.controlAndBases
          - nva.vcRivalLeverage
        planTemplates:
          - nva.rallyInfiltrate
          - nva.marchInfiltrate
          - nva.marchAmbush
          - nva.attackAmbush
          - nva.locOccupationBeforeCoup
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
        taxWeight: 200
      use:
        guardrails:
          - dropPassWhenOtherMovesExist
          - vc.avoidConventionalAttackWithoutAmbush
          - vc.protectBasesFromNvaInfiltrate
          - vc.avoidHighPopTaxWithoutPoliticalPlan
        strategyModules:
          - shared.immediateWin
          - shared.blockCurrentLeader
          - shared.nearCoupConcreteSwing
          - shared.resourceLogistics
          - shared.eventDirectSwing
          - shared.allyRivalThrottle
          - shared.monsoonOperationalRestriction
          - vc.buildPoliticalNetwork
          - vc.subvertRegimeSecurity
          - vc.fundAndAmbushCarefully
          - vc.denyNvaIfNearWin
        planTemplates:
          - vc.rallySubvert
          - vc.marchSubvert
          - vc.terrorSubvert
          - vc.terrorTax
          - vc.marchAmbushFromLoc
        considerations:
          - preferNormalizedMargin
          - preferRallyWeighted
          - preferMarchAction
          - preferTerrorAction
          - preferSubvertAction
          - preferTaxWeighted
          - preferAttackAction
          - valueCapabilityGain
        tieBreakers:
          - stableMoveKey

  bindings:
    us: us-baseline
    arvn: arvn-baseline
    nva: nva-baseline
    vc: vc-baseline
```

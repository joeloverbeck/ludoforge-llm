# Fire in the Lake - Rules and Actions

```yaml
turnStructure:
  phases:
    - id: main
    - id: coupVictory
    - id: coupResources
    - id: coupSupport
    - id: coupRedeploy
    - id: coupCommitment
    - id: coupReset
  interrupts:
    - id: commitment


turnOrder:
  type: cardDriven
  config:
    turnFlow:
      cardLifecycle:
        played: played:none
        lookahead: lookahead:none
        leader: leader:none
      eligibility:
        seats: ['0', '1', '2', '3']
        overrideWindows:
          - id: remain-eligible
            duration: nextTurn
          - id: make-ineligible
            duration: nextTurn
          - id: us-special-window
            duration: turn
          - id: arvn-special-window
            duration: turn
          - id: nva-special-window
            duration: turn
          - id: vc-special-window
            duration: turn
      actionClassByActionId:
        pass: pass
        event: event
        pivotalEvent: event
        usOp: operation
        arvnOp: operation
        coupVictoryCheck: pass
        coupResourcesResolve: pass
        coupPacifyUS: operation
        coupPacifyARVN: operation
        coupAgitateVC: operation
        coupArvnRedeployMandatory: operation
        coupArvnRedeployOptionalTroops: operation
        coupArvnRedeployPolice: operation
        coupNvaRedeployTroops: operation
        coupCommitmentResolve: operation
        coupPacifyPass: pass
        coupAgitatePass: pass
        coupRedeployPass: pass
        coupCommitmentPass: pass
      optionMatrix:
        - first: operation
          second: [limitedOperation]
        - first: operationPlusSpecialActivity
          second: [limitedOperation, event]
        - first: event
          second: [operation, operationPlusSpecialActivity]
      passRewards:
        - { seat: '0', resource: arvnResources, amount: 3 }
        - { seat: '1', resource: arvnResources, amount: 3 }
        - { seat: '2', resource: nvaResources, amount: 1 }
        - { seat: '3', resource: vcResources, amount: 1 }
      freeOperationActionIds: [train, patrol, sweep, assault, rally, march, attack, terror]
      cardSeatOrderMetadataKey: seatOrder
      cardSeatOrderMapping:
        US: '0'
        ARVN: '1'
        NVA: '2'
        VC: '3'
      durationWindows: [turn, nextTurn, round, cycle]
      monsoon:
        restrictedActions:
          - { actionId: sweep }
          - { actionId: march }
          - { actionId: airStrike, maxParam: { name: spaces, max: 2 } }
          - { actionId: airLift, maxParam: { name: spaces, max: 2 } }
        blockPivotal: true
      pivotal:
        actionIds: [pivotalEvent]
        requirePreActionWindow: true
        disallowWhenLookaheadIsCoup: true
        interrupt:
          precedence: ['3', '1', '2', '0']
    coupPlan:
      phases:
        - id: coupVictory
          steps: [check-victory]
        - id: coupResources
          steps: [resolve-resources]
        - id: coupSupport
          steps: [resolve-support]
        - id: coupRedeploy
          steps: [resolve-redeploy]
        - id: coupCommitment
          steps: [resolve-commitment]
        - id: coupReset
          steps: [resolve-reset]
      finalRoundOmitPhases: [coupCommitment, coupReset]
      maxConsecutiveRounds: 1
  
# ══════════════════════════════════════════════════════════════════════════════
# Actions (profile-backed actions keep empty fallback effects)
# ══════════════════════════════════════════════════════════════════════════════

actions:
  - { id: pass, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - id: coupVictoryCheck
    actor: active
    executor: 'actor'
    phase: [coupVictory]
    params: []
    pre: null
    cost: []
    effects: []
    limits: [{ scope: phase, max: 1 }]
  - id: coupResourcesResolve
    actor: active
    executor: 'actor'
    phase: [coupResources]
    params: []
    pre: null
    cost: []
    effects:
      - macro: coup-auto-sabotage
      - macro: coup-trail-degradation
      - macro: coup-arvn-earnings
      - macro: coup-insurgent-earnings
      - macro: coup-casualties-aid
    limits: [{ scope: phase, max: 1 }]
  - id: coupPacifyPass
    actor: active
    executor: 'actor'
    phase: [coupSupport]
    params: []
    pre:
      op: or
      args:
        - { op: '==', left: { ref: activePlayer }, right: 0 }
        - { op: '==', left: { ref: activePlayer }, right: 1 }
    cost: []
    effects: []
    limits: [{ scope: phase, max: 1 }]
  - id: coupAgitatePass
    actor: active
    executor: 'actor'
    phase: [coupSupport]
    params: []
    pre: { op: '==', left: { ref: activePlayer }, right: 3 }
    cost: []
    effects: []
    limits: [{ scope: phase, max: 1 }]
  - id: coupPacifyUS
    actor: active
    executor: '0'
    phase: [coupSupport]
    params:
      - name: targetSpace
        domain:
          query: mapSpaces
          filter:
            op: or
            args:
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
      - name: action
        domain: { query: enums, values: [removeTerror, shiftSupport] }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 0 }
        - op: or
          args:
            - op: '<'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: '=='
                      left: { ref: markerState, space: $zone, marker: coupPacifySpaceUsage }
                      right: used
              right: 4
            - conditionMacro: fitl-space-marker-state-is
              args:
                spaceIdExpr: { ref: binding, name: targetSpace }
                markerId: coupPacifySpaceUsage
                markerStateExpr: used
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['US', 'ARVN'] }
          right:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['NVA', 'VC'] }
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: police }
          right: 0
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: US }
                  - { prop: type, eq: troops }
          right: 0
        - conditionMacro: us-joint-op-arvn-spend-eligible
          args:
            resourceExpr: { ref: gvar, var: arvnResources }
            costExpr:
              if:
                when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: ky }
                then: 4
                else: 3
        - op: or
          args:
            - conditionMacro: fitl-coup-support-remove-terror-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                targetSpaceExpr: { ref: binding, name: targetSpace }
            - conditionMacro: fitl-coup-support-shift-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                requiredActionExpr: shiftSupport
                targetSpaceExpr: { ref: binding, name: targetSpace }
                blockedSupportStateExpr: activeSupport
    cost: []
    effects:
      - macro: rvn-leader-pacification-cost
        args:
          stepCountExpr: 1
      - if:
          when: { op: '==', left: { ref: binding, name: action }, right: removeTerror }
          then:
            - setVar: { scope: zoneVar, zone: { zoneExpr: { ref: binding, name: targetSpace } }, var: terrorCount, value: 0 }
          else:
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: supportOpposition, delta: 1 }
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupSupportShiftCount, delta: 1 }
      - setMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupPacifySpaceUsage, state: used }
    limits: []
  - id: coupPacifyARVN
    actor: active
    executor: '1'
    phase: [coupSupport]
    params:
      - name: targetSpace
        domain:
          query: mapSpaces
          filter:
            op: or
            args:
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
      - name: action
        domain: { query: enums, values: [removeTerror, shiftSupport] }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 1 }
        - op: or
          args:
            - op: '<'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: '=='
                      left: { ref: markerState, space: $zone, marker: coupPacifySpaceUsage }
                      right: used
              right: 4
            - conditionMacro: fitl-space-marker-state-is
              args:
                spaceIdExpr: { ref: binding, name: targetSpace }
                markerId: coupPacifySpaceUsage
                markerStateExpr: used
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['US', 'ARVN'] }
          right:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['NVA', 'VC'] }
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: police }
          right: 0
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: troops }
          right: 0
        - op: '>='
          left: { ref: gvar, var: arvnResources }
          right:
            if:
              when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: ky }
              then: 4
              else: 3
        - op: or
          args:
            - conditionMacro: fitl-coup-support-remove-terror-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                targetSpaceExpr: { ref: binding, name: targetSpace }
            - conditionMacro: fitl-coup-support-shift-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                requiredActionExpr: shiftSupport
                targetSpaceExpr: { ref: binding, name: targetSpace }
                blockedSupportStateExpr: activeSupport
    cost: []
    effects:
      - macro: rvn-leader-pacification-cost
        args:
          stepCountExpr: 1
      - if:
          when: { op: '==', left: { ref: binding, name: action }, right: removeTerror }
          then:
            - setVar: { scope: zoneVar, zone: { zoneExpr: { ref: binding, name: targetSpace } }, var: terrorCount, value: 0 }
          else:
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: supportOpposition, delta: 1 }
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupSupportShiftCount, delta: 1 }
      - setMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupPacifySpaceUsage, state: used }
    limits: []
  - id: coupAgitateVC
    actor: active
    executor: '3'
    phase: [coupSupport]
    params:
      - name: targetSpace
        domain:
          query: mapSpaces
          filter:
            op: or
            args:
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
      - name: action
        domain: { query: enums, values: [removeTerror, shiftOpposition] }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 3 }
        - op: or
          args:
            - op: '<'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: '=='
                      left: { ref: markerState, space: $zone, marker: coupAgitateSpaceUsage }
                      right: used
              right: 4
            - conditionMacro: fitl-space-marker-state-is
              args:
                spaceIdExpr: { ref: binding, name: targetSpace }
                markerId: coupAgitateSpaceUsage
                markerStateExpr: used
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: VC }
          right: 0
        - op: <=
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['US', 'ARVN'] }
          right:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, op: in, value: ['NVA', 'VC'] }
        - op: '>='
          left: { ref: gvar, var: vcResources }
          right: 1
        - op: or
          args:
            - conditionMacro: fitl-coup-support-remove-terror-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                targetSpaceExpr: { ref: binding, name: targetSpace }
            - conditionMacro: fitl-coup-support-shift-action-allowed
              args:
                actionExpr: { ref: binding, name: action }
                requiredActionExpr: shiftOpposition
                targetSpaceExpr: { ref: binding, name: targetSpace }
                blockedSupportStateExpr: activeOpposition
    cost: []
    effects:
      - addVar: { scope: global, var: vcResources, delta: -1 }
      - if:
          when: { op: '==', left: { ref: binding, name: action }, right: removeTerror }
          then:
            - setVar: { scope: zoneVar, zone: { zoneExpr: { ref: binding, name: targetSpace } }, var: terrorCount, value: 0 }
          else:
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: supportOpposition, delta: -1 }
            - shiftMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupSupportShiftCount, delta: 1 }
      - setMarker: { space: { zoneExpr: { ref: binding, name: targetSpace } }, marker: coupAgitateSpaceUsage, state: used }
    limits: []
  - id: coupArvnRedeployMandatory
    actor: active
    executor: '1'
    phase: [coupRedeploy]
    params:
      - name: sourceSpace
        domain: { query: mapSpaces }
      - name: targetSpace
        domain: { query: mapSpaces }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 1 }
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: sourceSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: troops }
          right: 0
        - op: or
          args:
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: sourceSpace } }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
              right: 0
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: sourceSpace } }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
              right: 0
        - op: '=='
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: sourceSpace } }
                filter:
                  - { prop: faction, op: in, value: ['US', 'ARVN'] }
                  - { prop: type, eq: base }
          right: 0
        - op: or
          args:
            - op: and
              args:
                - op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: mapSpaces
                        filter:
                          op: and
                          args:
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                  right: 0
                - op: '<='
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: targetSpace } }
                        filter:
                          - { prop: faction, eq: NVA }
                  right:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: targetSpace } }
                        filter:
                          - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: targetSpace } }
                    filter:
                      - { prop: faction, op: in, value: ['US', 'ARVN'] }
                      - { prop: type, eq: base }
              right: 0
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: saigon:none }
              right: 0
    cost: []
    effects:
      - forEach:
          bind: $movedTroop
          over:
            query: tokensInZone
            zone: { zoneExpr: { ref: binding, name: sourceSpace } }
            filter:
              - { prop: faction, eq: ARVN }
              - { prop: type, eq: troops }
          limit: 1
          effects:
            - moveToken:
                token: $movedTroop
                from: { zoneExpr: { ref: binding, name: sourceSpace } }
                to: { zoneExpr: { ref: binding, name: targetSpace } }
    limits: []
  - id: coupArvnRedeployOptionalTroops
    actor: active
    executor: '1'
    phase: [coupRedeploy]
    params:
      - name: sourceSpace
        domain: { query: mapSpaces }
      - name: targetSpace
        domain: { query: mapSpaces }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 1 }
        - op: '=='
          left:
            aggregate:
              op: count
              query:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - op: or
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - op: '=='
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: ['US', 'ARVN'] }
                              - { prop: type, eq: base }
                      right: 0
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: troops }
                      right: 0
          right: 0
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: sourceSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: troops }
          right: 0
        - op: or
          args:
            - op: and
              args:
                - op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: mapSpaces
                        filter:
                          op: and
                          args:
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                  right: 0
                - op: '<='
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: targetSpace } }
                        filter:
                          - { prop: faction, eq: NVA }
                  right:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: { zoneExpr: { ref: binding, name: targetSpace } }
                        filter:
                          - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: targetSpace } }
                    filter:
                      - { prop: faction, op: in, value: ['US', 'ARVN'] }
                      - { prop: type, eq: base }
              right: 0
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: saigon:none }
              right: 0
    cost: []
    effects:
      - forEach:
          bind: $movedTroop
          over:
            query: tokensInZone
            zone: { zoneExpr: { ref: binding, name: sourceSpace } }
            filter:
              - { prop: faction, eq: ARVN }
              - { prop: type, eq: troops }
          limit: 1
          effects:
            - moveToken:
                token: $movedTroop
                from: { zoneExpr: { ref: binding, name: sourceSpace } }
                to: { zoneExpr: { ref: binding, name: targetSpace } }
    limits: []
  - id: coupArvnRedeployPolice
    actor: active
    executor: '1'
    phase: [coupRedeploy]
    params:
      - name: sourceSpace
        domain: { query: mapSpaces }
      - name: targetSpace
        domain: { query: mapSpaces }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 1 }
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: sourceSpace } }
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, eq: police }
          right: 0
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: southVietnam }
          right: 0
        - op: or
          args:
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
              right: 0
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: targetSpace } }
                    filter:
                      - { prop: faction, op: in, value: ['US', 'ARVN'] }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: { zoneExpr: { ref: binding, name: targetSpace } }
                    filter:
                      - { prop: faction, op: in, value: ['NVA', 'VC'] }
    cost: []
    effects:
      - forEach:
          bind: $movedPolice
          over:
            query: tokensInZone
            zone: { zoneExpr: { ref: binding, name: sourceSpace } }
            filter:
              - { prop: faction, eq: ARVN }
              - { prop: type, eq: police }
          limit: 1
          effects:
            - moveToken:
                token: $movedPolice
                from: { zoneExpr: { ref: binding, name: sourceSpace } }
                to: { zoneExpr: { ref: binding, name: targetSpace } }
    limits: []
  - id: coupNvaRedeployTroops
    actor: active
    executor: '2'
    phase: [coupRedeploy]
    params:
      - name: sourceSpace
        domain: { query: mapSpaces }
      - name: targetSpace
        domain: { query: mapSpaces }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 2 }
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: sourceSpace } }
                filter:
                  - { prop: faction, eq: NVA }
                  - { prop: type, eq: troops }
          right: 0
        - op: '>'
          left:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: { zoneExpr: { ref: binding, name: targetSpace } }
                filter:
                  - { prop: faction, eq: NVA }
                  - { prop: type, eq: base }
          right: 0
    cost: []
    effects:
      - forEach:
          bind: $movedTroop
          over:
            query: tokensInZone
            zone: { zoneExpr: { ref: binding, name: sourceSpace } }
            filter:
              - { prop: faction, eq: NVA }
              - { prop: type, eq: troops }
          limit: 1
          effects:
            - moveToken:
                token: $movedTroop
                from: { zoneExpr: { ref: binding, name: sourceSpace } }
                to: { zoneExpr: { ref: binding, name: targetSpace } }
    limits: []
  - id: coupRedeployPass
    actor: active
    executor: 'actor'
    phase: [coupRedeploy]
    params: []
    pre: null
    cost: []
    effects: []
    limits: [{ scope: phase, max: 1 }]
  - id: coupCommitmentPass
    actor: active
    executor: 'actor'
    phase: [coupCommitment]
    params: []
    pre: null
    cost: []
    effects: []
    limits: [{ scope: phase, max: 1 }]
  - id: coupCommitmentResolve
    actor: active
    executor: '0'
    phase: [coupCommitment]
    params: []
    pre: { op: '==', left: { ref: activePlayer }, right: 0 }
    cost: []
    effects:
      - macro: coup-process-commitment
    limits: [{ scope: phase, max: 1 }]
  - id: pivotalEvent
    actor: active
    executor: 'actor'
    phase: [main]
    params:
      - name: eventCardId
        domain: { query: enums, values: [card-121, card-122, card-123, card-124] }
    pre:
      op: or
      args:
        - op: and
          args:
            - { op: '==', left: { ref: activePlayer }, right: 0 }
            - { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: leader:none
                    filter:
                      - { prop: cardId, eq: card-121 }
              right: 0
        - op: and
          args:
            - { op: '==', left: { ref: activePlayer }, right: 2 }
            - { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: leader:none
                    filter:
                      - { prop: cardId, eq: card-122 }
              right: 0
        - op: and
          args:
            - { op: '==', left: { ref: activePlayer }, right: 1 }
            - { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: leader:none
                    filter:
                      - { prop: cardId, eq: card-123 }
              right: 0
        - op: and
          args:
            - { op: '==', left: { ref: activePlayer }, right: 3 }
            - { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: leader:none
                    filter:
                      - { prop: cardId, eq: card-124 }
              right: 0
    cost: []
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
          then:
            - forEach:
                bind: $pivotalCard
                over:
                  query: tokensInZone
                  zone: leader:none
                  filter:
                    - { prop: cardId, eq: card-121 }
                limit: 1
                effects:
                  - moveToken:
                      token: $pivotalCard
                      from: leader:none
                      to: played:none
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
          then:
            - forEach:
                bind: $pivotalCard
                over:
                  query: tokensInZone
                  zone: leader:none
                  filter:
                    - { prop: cardId, eq: card-122 }
                limit: 1
                effects:
                  - moveToken:
                      token: $pivotalCard
                      from: leader:none
                      to: played:none
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
          then:
            - forEach:
                bind: $pivotalCard
                over:
                  query: tokensInZone
                  zone: leader:none
                  filter:
                    - { prop: cardId, eq: card-123 }
                limit: 1
                effects:
                  - moveToken:
                      token: $pivotalCard
                      from: leader:none
                      to: played:none
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
          then:
            - forEach:
                bind: $pivotalCard
                over:
                  query: tokensInZone
                  zone: leader:none
                  filter:
                    - { prop: cardId, eq: card-124 }
                limit: 1
                effects:
                  - moveToken:
                      token: $pivotalCard
                      from: leader:none
                      to: played:none
    limits: []
  - { id: train, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: patrol, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: sweep, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: assault, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: rally, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: march, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: attack, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: terror, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: advise, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: airLift, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: airStrike, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: govern, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: transport, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: raid, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: infiltrate, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: bombard, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: ambushNva, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: tax, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: subvert, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: ambushVc, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - id: nvaTransferResources
    actor: active
    executor: '2'
    phase: [main]
    params:
      - name: amount
        domain: { query: intsInVarRange, var: nvaResources, min: 1 }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 2 }
        - { op: '>=', left: { ref: gvar, var: nvaResources }, right: { ref: binding, name: amount } }
    cost: []
    effects:
      - addVar:
          scope: global
          var: nvaResources
          delta: { op: '*', left: { ref: binding, name: amount }, right: -1 }
      - addVar: { scope: global, var: vcResources, delta: { ref: binding, name: amount } }
    limits: []
  - id: vcTransferResources
    actor: active
    executor: '3'
    phase: [main]
    params:
      - name: amount
        domain: { query: intsInVarRange, var: vcResources, min: 1 }
    pre:
      op: and
      args:
        - { op: '==', left: { ref: activePlayer }, right: 3 }
        - { op: '>=', left: { ref: gvar, var: vcResources }, right: { ref: binding, name: amount } }
    cost: []
    effects:
      - addVar:
          scope: global
          var: vcResources
          delta: { op: '*', left: { ref: binding, name: amount }, right: -1 }
      - addVar: { scope: global, var: nvaResources, delta: { ref: binding, name: amount } }
    limits: []
  - { id: usOp, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: arvnOp, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
  - id: resolveCommitment
    actor: active
    executor: '0'
    phase: [commitment]
    params: []
    pre: { op: '==', left: { ref: activePlayer }, right: 0 }
    cost: []
    effects:
      - macro: coup-process-commitment
      - popInterruptPhase: {}
    limits: []

# ══════════════════════════════════════════════════════════════════════════════
# Triggers
# ══════════════════════════════════════════════════════════════════════════════

actionPipelines:
  # ── train-us-profile ──────────────────────────────────────────────────────────
  # US Train operation (Rule 3.2.1)
  # Spaces: Provinces/Cities with US pieces; LimOp: max 1 space
  # Cost: 0 for US; 3 ARVN Resources only when placing ARVN pieces
  # Resolution: Per-space choice of place Irregulars or at-Base train (Rangers / ARVN cubes)
  # Sub-action: Pacification or Saigon patronage transfer in 1 selected space
  - id: train-us-profile
    actionId: train
    applicability: { op: '==', left: { ref: activePlayer }, right: 0 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }] } } }
                            right: 0
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }] } } }
                            right: 0
                    min: 1
                    max: 99

      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - chooseOne:
                    bind: $trainChoice
                    options: { query: enums, values: ['place-irregulars', 'place-at-base'] }

                - if:
                    when: { op: '==', left: { ref: binding, name: $trainChoice }, right: 'place-irregulars' }
                    then:
                      - macro: place-from-available-or-map
                        args:
                          pieceType: irregular
                          faction: 'US'
                          targetSpace: $space
                          maxPieces: 2
                      - macro: cap-train-caps-unshaded-bonus-police
                        args:
                          space: $space

                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $trainChoice }, right: 'place-at-base' }
                        - op: '>'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                          right: 0
                    then:
                      - chooseOne:
                          bind: $baseTrainChoice
                          options: { query: enums, values: ['rangers', 'arvn-cubes'] }
                      - if:
                          when: { op: '==', left: { ref: binding, name: $baseTrainChoice }, right: 'rangers' }
                          then:
                            - macro: place-from-available-or-map
                              args:
                                pieceType: ranger
                                faction: 'ARVN'
                                targetSpace: $space
                                maxPieces: 2
                            - macro: cap-train-caps-unshaded-bonus-police
                              args:
                                space: $space
                      - if:
                          when:
                            op: and
                            args:
                              - { op: '==', left: { ref: binding, name: $baseTrainChoice }, right: 'arvn-cubes' }
                              - op: or
                                args:
                                  - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
                                  - conditionMacro: us-joint-op-arvn-spend-eligible
                                    args:
                                      resourceExpr: { ref: gvar, var: arvnResources }
                                      costExpr: 3
                          then:
                            # Cost: 3 ARVN Resources for placing ARVN pieces
                            - if:
                                when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                                then:
                                  - addVar: { scope: global, var: arvnResources, delta: -3 }
                            # Place up to 6 ARVN cubes (any mix of Troops and Police)
                            - chooseN:
                                bind: $arvnCubeTypes
                                options: { query: enums, values: ['troops', 'police'] }
                                min: 1
                                max: 6
                            - forEach:
                                bind: $cubeType
                                over: { query: binding, name: $arvnCubeTypes }
                                effects:
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: { ref: binding, name: $cubeType }
                                      faction: 'ARVN'
                                      targetSpace: $space
                                      maxPieces: 1
                            - macro: cap-train-caps-unshaded-bonus-police
                              args:
                                space: $space

      - stage: sub-action
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_cords }, right: unshaded }
              then:
                - chooseN:
                    bind: $subActionSpaces
                    options:
                      query: binding
                      name: targetSpaces
                    min: 0
                    max: 2
              else:
                - chooseN:
                    bind: $subActionSpaces
                    options:
                      query: binding
                      name: targetSpaces
                    min: 0
                    max: 1
          - forEach:
              bind: $subSpace
              over: { query: binding, name: $subActionSpaces }
              effects:
                - chooseOne:
                    bind: $subAction
                    options: { query: enums, values: ['pacify', 'saigon-transfer', 'none'] }

                # Pacification: needs US piece + COIN Control
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $subAction }, right: 'pacify' }
                        - op: '>'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'US' }] } } }
                          right: 0
                    then:
                      - let:
                          bind: $usPacPerStepCost
                          value:
                            if:
                              when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: ky }
                              then: 4
                              else: 3
                          in:
                            # Remove Terror marker first (if present)
                            - if:
                                when: { op: '>', left: { ref: zoneVar, zone: $subSpace, var: terrorCount }, right: 0 }
                                then:
                                  - if:
                                      when:
                                        conditionMacro: us-joint-op-arvn-spend-eligible
                                        args:
                                          resourceExpr: { ref: gvar, var: arvnResources }
                                          costExpr: { ref: binding, name: $usPacPerStepCost }
                                      then:
                                        # Costs 3 ARVN Resources per Terror removed (even if free op!)
                                        - macro: rvn-leader-pacification-cost
                                          args:
                                            stepCountExpr: 1
                                        - setVar: { scope: zoneVar, zone: $subSpace, var: terrorCount, value: 0 }
                            - if:
                                when: { op: '==', left: { ref: globalMarkerState, marker: cap_cords }, right: shaded }
                                then:
                                  - if:
                                      when:
                                        op: and
                                        args:
                                          - { op: '!=', left: { ref: markerState, space: $subSpace, marker: supportOpposition }, right: passiveSupport }
                                          - { op: '!=', left: { ref: markerState, space: $subSpace, marker: supportOpposition }, right: activeSupport }
                                      then:
                                        - if:
                                            when:
                                              conditionMacro: us-joint-op-arvn-spend-eligible
                                              args:
                                                resourceExpr: { ref: gvar, var: arvnResources }
                                                costExpr: { ref: binding, name: $usPacPerStepCost }
                                            then:
                                              - macro: rvn-leader-pacification-cost
                                                args:
                                                  stepCountExpr: 1
                                              - setMarker: { space: $subSpace, marker: supportOpposition, state: passiveSupport }
                                else:
                                  # Shift up to 2 levels toward Active Support
                                  - chooseOne:
                                      bind: $pacLevels
                                      options: { query: intsInRange, min: 1, max: 2 }
                                  - if:
                                      when:
                                        conditionMacro: us-joint-op-arvn-spend-eligible
                                        args:
                                          resourceExpr: { ref: gvar, var: arvnResources }
                                          costExpr:
                                            op: '*'
                                            left: { ref: binding, name: $pacLevels }
                                            right: { ref: binding, name: $usPacPerStepCost }
                                      then:
                                        # Costs 3 ARVN Resources per level shifted (even if free op!)
                                        - macro: rvn-leader-pacification-cost
                                          args:
                                            stepCountExpr: { ref: binding, name: $pacLevels }
                                        - shiftMarker: { space: $subSpace, marker: supportOpposition, delta: { ref: binding, name: $pacLevels } }

                # Saigon patronage transfer (US only, space must be Saigon)
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $subAction }, right: 'saigon-transfer' }
                        - { op: '==', left: { ref: zoneProp, zone: $subSpace, prop: spaceId }, right: 'saigon' }
                    then:
                      - chooseOne:
                          bind: $transferAmount
                          options: { query: intsInRange, min: 1, max: 3 }
                      - addVar: { scope: global, var: patronage, delta: { op: '*', left: { ref: binding, name: $transferAmount }, right: -1 } }
                      - addVar: { scope: global, var: arvnResources, delta: { ref: binding, name: $transferAmount } }
    atomicity: atomic
  # ── train-arvn-profile ─────────────────────────────────────────────────────────
  # ARVN Train operation (Rule 3.2.1)
  # Spaces: Provinces/Cities without NVA Control; LimOp: max 1 space
  # Cost: 3 ARVN Resources when placing ARVN pieces (including base replacement)
  # Resolution: Per-space choice of Rangers (up to 2) or ARVN cubes (up to 6)
  # Sub-action: Pacification or replace 3 ARVN cubes with 1 ARVN Base
  - id: train-arvn-profile
    actionId: train
    applicability: { op: '==', left: { ref: activePlayer }, right: 1 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          # Without NVA Control (NVA pieces <= COIN+VC pieces)
                          - op: <=
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: eq, value: 'NVA' }
                            right:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - op: <=
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: eq, value: 'NVA' }
                            right:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                    min: 1
                    max: 99

      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                # ARVN Train: place 1-2 Rangers or up to 6 ARVN cubes
                # at Cities or at US/ARVN Bases
                - chooseOne:
                    bind: $trainChoice
                    options: { query: enums, values: ['rangers', 'arvn-cubes'] }

                - if:
                    when: { op: '==', left: { ref: binding, name: $trainChoice }, right: 'rangers' }
                    then:
                      # Cost: 3 ARVN Resources for placing ARVN pieces
                      - if:
                          when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                          then:
                            - addVar: { scope: global, var: arvnResources, delta: -3 }
                      - macro: place-from-available-or-map
                        args:
                          pieceType: ranger
                          faction: 'ARVN'
                          targetSpace: $space
                          maxPieces: 2
                      - macro: cap-train-caps-unshaded-bonus-police
                        args:
                          space: $space

                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $trainChoice }, right: 'arvn-cubes' }
                        # Must be City or have COIN Base
                        - op: or
                          args:
                            - { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: 'city' }
                            - op: '>'
                              left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }, { prop: type, eq: base }] } } }
                              right: 0
                    then:
                      # Cost: 3 ARVN Resources
                      - if:
                          when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                          then:
                            - addVar: { scope: global, var: arvnResources, delta: -3 }
                      # Place up to 6 ARVN cubes
                      - macro: place-from-available-or-map
                        args:
                          pieceType: troops
                          faction: 'ARVN'
                          targetSpace: $space
                          maxPieces: 6
                      - macro: cap-train-caps-unshaded-bonus-police
                        args:
                          space: $space

      - stage: sub-action
        effects:
          # In selected spaces (up to 2 with CORDS unshaded), choose one of:
          # A) Pacification (ARVN needs ARVN Troops AND Police + COIN Control)
          # B) Replace 3 ARVN cubes with 1 ARVN Base
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_cords }, right: unshaded }
              then:
                - chooseN:
                    bind: $subActionSpaces
                    options: { query: binding, name: targetSpaces }
                    min: 0
                    max: 2
              else:
                - chooseN:
                    bind: $subActionSpaces
                    options: { query: binding, name: targetSpaces }
                    min: 0
                    max: 1
          - forEach:
              bind: $subSpace
              over: { query: binding, name: $subActionSpaces }
              effects:
                - chooseOne:
                    bind: $subAction
                    options: { query: enums, values: ['pacify', 'replace-cubes-with-base', 'none'] }

                # Pacification: needs ARVN Troops AND Police + COIN Control
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $subAction }, right: 'pacify' }
                        - op: '>'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: troops }] } } }
                          right: 0
                        - op: '>'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: police }] } } }
                          right: 0
                    then:
                      - if:
                          when: { op: '>', left: { ref: zoneVar, zone: $subSpace, var: terrorCount }, right: 0 }
                          then:
                            - macro: rvn-leader-pacification-cost
                              args:
                                stepCountExpr: 1
                            - setVar: { scope: zoneVar, zone: $subSpace, var: terrorCount, value: 0 }
                      - if:
                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_cords }, right: shaded }
                          then:
                            - if:
                                when:
                                  op: and
                                  args:
                                    - { op: '!=', left: { ref: markerState, space: $subSpace, marker: supportOpposition }, right: passiveSupport }
                                    - { op: '!=', left: { ref: markerState, space: $subSpace, marker: supportOpposition }, right: activeSupport }
                                then:
                                  - macro: rvn-leader-pacification-cost
                                    args:
                                      stepCountExpr: 1
                                  - setMarker: { space: $subSpace, marker: supportOpposition, state: passiveSupport }
                          else:
                            - chooseOne:
                                bind: $pacLevels
                                options: { query: intsInRange, min: 1, max: 2 }
                            - macro: rvn-leader-pacification-cost
                              args:
                                stepCountExpr: { ref: binding, name: $pacLevels }
                            - shiftMarker: { space: $subSpace, marker: supportOpposition, delta: { ref: binding, name: $pacLevels } }

                # Replace 3 ARVN cubes with 1 ARVN Base (costs 3 even if free op)
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: $subAction }, right: 'replace-cubes-with-base' }
                        # Must have 3+ ARVN cubes
                        - op: '>='
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                          right: 3
                        # Stacking: fewer than 2 bases
                        - op: '<'
                          left: { aggregate: { op: count, query: { query: tokensInZone, zone: $subSpace, filter: [{ prop: type, eq: base }] } } }
                          right: 2
                    then:
                      # Cost: 3 ARVN Resources (even if free op)
                      - addVar: { scope: global, var: arvnResources, delta: -3 }
                      # Remove 3 ARVN cubes
                      - forEach:
                          bind: $cube
                          over:
                            query: tokensInZone
                            zone: $subSpace
                            filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }]
                          limit: 3
                          effects:
                            - moveToken: { token: $cube, from: $subSpace, to: available-ARVN:none }
                      # Place 1 ARVN Base
                      - macro: place-from-available-or-map
                        args:
                          pieceType: base
                          faction: 'ARVN'
                          targetSpace: $subSpace
                          maxPieces: 1
      - stage: rvn-leader-minh-aid-bonus
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: minh }
              then:
                - addVar: { scope: global, var: aid, delta: 5 }
    atomicity: atomic
  # ── patrol-us-profile ────────────────────────────────────────────────────────
  # US Patrol operation (Rule 3.2.2)
  # Spaces: LoCs only; LimOp: max 1 LoC
  # Cost: 0 (US pays nothing)
  # Resolution: Move US cubes from adjacent spaces, activate 1 guerrilla per cube (1:1),
  #             free Assault in 1 LoC (US only, no ARVN follow-up)
  - id: patrol-us-profile
    actionId: patrol
    applicability: { op: '==', left: { ref: activePlayer }, right: 0 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-locs
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
                    min: 1
                    max: 99

      - stage: move-cubes
        effects:
          - forEach:
              bind: $loc
              over: { query: binding, name: targetLoCs }
              effects:
                - chooseN:
                    bind: $movingCubes
                    options:
                      query: tokensInMapSpaces
                      spaceFilter:
                        op: or
                        args:
                          - op: adjacent
                            left: $zone
                            right: $loc
                          - op: connected
                            from: $zone
                            to: $loc
                            via:
                              op: or
                              args:
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: $loc }
                                - op: and
                                  args:
                                    - op: or
                                      args:
                                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                                    - op: '=='
                                      left:
                                        aggregate:
                                          op: count
                                          query:
                                            query: tokensInZone
                                            zone: $zone
                                            filter:
                                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                      right: 0
                      filter:
                        - { prop: faction, eq: 'US' }
                        - { prop: type, op: in, value: ['troops', 'police'] }
                    min: 0
                    max:
                      if:
                        when: { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
                        then: 99
                        else: { ref: gvar, var: nvaResources }
                - forEach:
                    bind: $cube
                    over: { query: binding, name: $movingCubes }
                    effects:
                      - moveToken:
                          token: $cube
                          from: { zoneExpr: { ref: tokenZone, token: $cube } }
                          to: $loc
                - macro: cap-patrol-m48-shaded-moved-cube-penalty
                  args:
                    movedCubes: $movingCubes
                    loc: $loc

      - stage: activate-guerrillas
        effects:
          - forEach:
              bind: $actLoc
              over: { query: binding, name: targetLoCs }
              effects:
                - let:
                    bind: $usCubeCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $actLoc, filter: [{ prop: faction, eq: 'US' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                    in:
                      - forEach:
                          bind: $guerrilla
                          over:
                            query: tokensInZone
                            zone: $actLoc
                            filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                          limit: { ref: binding, name: $usCubeCount }
                          effects:
                            - setTokenProp: { token: $guerrilla, prop: activity, value: active }

      - stage: free-assault
        effects:
          - chooseN:
              bind: $assaultLoCs
              options: { query: binding, name: targetLoCs }
              min: 0
              max: 1
          - forEach:
              bind: $assaultLoC
              over: { query: binding, name: $assaultLoCs }
              effects:
                - let:
                    bind: $usTroops
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                    in:
                      - let:
                          bind: $hasUSBase
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                          in:
                            - let:
                                bind: $patrolDmg
                                value:
                                  if:
                                    when: { op: '>', left: { ref: binding, name: $hasUSBase }, right: 0 }
                                    then: { op: '*', left: { ref: binding, name: $usTroops }, right: 2 }
                                    else: { ref: binding, name: $usTroops }
                                in:
                                  - macro: coin-assault-removal-order
                                    args:
                                      space: $assaultLoC
                                      damageExpr: { ref: binding, name: $patrolDmg }
                                      bodyCountEligible: true
    atomicity: atomic
  # ── patrol-arvn-profile ─────────────────────────────────────────────────────
  # ARVN Patrol operation (Rule 3.2.2)
  # Spaces: LoCs only; LimOp: max 1 LoC
  # Cost: 3 ARVN Resources TOTAL (upfront, not per-space)
  # Resolution: Move ARVN cubes from adjacent spaces, activate 1 guerrilla per cube (1:1),
  #             free Assault in 1 LoC using ARVN Assault damage formula
  - id: patrol-arvn-profile
    actionId: patrol
    applicability: { op: '==', left: { ref: activePlayer }, right: 1 }
    legality:
      op: or
      args:
        - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
        - { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costValidation:
      op: or
      args:
        - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
        - { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costEffects:
      - if:
          when: { op: '!=', left: { ref: gvar, var: mom_bodyCount }, right: true }
          then:
            - addVar: { scope: global, var: arvnResources, delta: -3 }
    targeting: {}
    stages:
      - stage: select-locs
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
                    min: 1
                    max: 99

      - stage: move-cubes
        effects:
          - forEach:
              bind: $loc
              over: { query: binding, name: targetLoCs }
              effects:
                - chooseN:
                    bind: $movingCubes
                    options:
                      query: tokensInMapSpaces
                      spaceFilter:
                        op: or
                        args:
                          - op: adjacent
                            left: $zone
                            right: $loc
                          - op: connected
                            from: $zone
                            to: $loc
                            via:
                              op: or
                              args:
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: $loc }
                                - op: and
                                  args:
                                    - op: or
                                      args:
                                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                                    - op: '=='
                                      left:
                                        aggregate:
                                          op: count
                                          query:
                                            query: tokensInZone
                                            zone: $zone
                                            filter:
                                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                      right: 0
                      filter:
                        - { prop: faction, eq: 'ARVN' }
                        - { prop: type, op: in, value: ['troops', 'police'] }
                    min: 0
                    max: 99
                - forEach:
                    bind: $cube
                    over: { query: binding, name: $movingCubes }
                    effects:
                      - moveToken:
                          token: $cube
                          from: { zoneExpr: { ref: tokenZone, token: $cube } }
                          to: $loc
                - macro: cap-patrol-m48-shaded-moved-cube-penalty
                  args:
                    movedCubes: $movingCubes
                    loc: $loc

      - stage: activate-guerrillas
        effects:
          - forEach:
              bind: $actLoc
              over: { query: binding, name: targetLoCs }
              effects:
                - let:
                    bind: $arvnCubeCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $actLoc, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                    in:
                      - forEach:
                          bind: $guerrilla
                          over:
                            query: tokensInZone
                            zone: $actLoc
                            filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                          limit: { ref: binding, name: $arvnCubeCount }
                          effects:
                            - setTokenProp: { token: $guerrilla, prop: activity, value: active }

      - stage: free-assault
        effects:
          - chooseN:
              bind: $assaultLoCs
              options: { query: binding, name: targetLoCs }
              min: 0
              max: 1
          - forEach:
              bind: $assaultLoC
              over: { query: binding, name: $assaultLoCs }
              effects:
                - let:
                    bind: $arvnCubes
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $assaultLoC, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                    in:
                      - let:
                          bind: $patrolDmg
                          value: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                          in:
                            - macro: coin-assault-removal-order
                              args:
                                space: $assaultLoC
                                damageExpr: { ref: binding, name: $patrolDmg }
                                bodyCountEligible: true
    atomicity: atomic
  # ── sweep-us-profile ──────────────────────────────────────────────────────────
  # US Sweep operation (Rule 3.2.3)
  # Spaces: Provinces/Cities only; excludes North Vietnam; LimOp: max 1 space
  # Cost: 0 (US pays nothing)
  # Resolution: move US Troops from adjacent spaces; optional 1-LoC hop if LoC is free of NVA/VC;
  #             activate underground guerrillas via sweep-activation macro (US cubes + irregulars; jungle halving)
  - id: sweep-us-profile
    actionId: sweep
    applicability: { op: '==', left: { ref: activePlayer }, right: 0 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                    min: 1
                    max: 1
              else:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_caps }, right: shaded }
                    then:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: or
                                  args:
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                          min: 1
                          max: 2
                    else:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: or
                                  args:
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                          min: 1
                          max: 99

      - stage: move-troops
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - chooseN:
                    bind: $movingAdjacentTroops
                    options:
                      query: tokensInAdjacentZones
                      zone: $space
                      filter:
                        - { prop: faction, eq: 'US' }
                        - { prop: type, eq: troops }
                    min: 0
                    max: 99
                - forEach:
                    bind: $troop
                    over: { query: binding, name: $movingAdjacentTroops }
                    effects:
                      - moveToken:
                          token: $troop
                          from: { zoneExpr: { ref: tokenZone, token: $troop } }
                          to: $space
                - macro: sweep-loc-hop
                  args:
                    space: $space
                    troopFaction: 'US'

      - stage: activate-guerrillas
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: sweep-activation
                  args:
                    space: $space
                    cubeFaction: 'US'
                    sfType: irregular
      - stage: cap-cobras-bonus-removal
        effects:
          - macro: cap-sweep-cobras-unshaded-removal
            args:
              targetSpaces: targetSpaces
      - stage: cap-booby-traps-troop-cost
        effects:
          - macro: cap-sweep-booby-traps-shaded-cost
            args:
              targetSpaces: targetSpaces
              actorFaction: US
    atomicity: atomic
  - id: sweep-arvn-profile
    actionId: sweep
    applicability: { op: '==', left: { ref: activePlayer }, right: 1 }
    legality: { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costValidation: { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                    min: 1
                    max: 1
              else:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_caps }, right: shaded }
                    then:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: or
                                  args:
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                          min: 1
                          max:
                            op: min
                            left: 2
                            right:
                              op: floorDiv
                              left: { ref: gvar, var: arvnResources }
                              right: 3
                    else:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: or
                                  args:
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                          min: 1
                          max:
                            op: floorDiv
                            left: { ref: gvar, var: arvnResources }
                            right: 3

      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: arvnResources, delta: -3 }
                - chooseN:
                    bind: '$movingTroops@{$space}'
                    options:
                      query: tokensInAdjacentZones
                      zone: $space
                      filter:
                        - { prop: faction, eq: 'ARVN' }
                        - { prop: type, eq: troops }
                    min: 0
                    max: 99
                - forEach:
                    bind: $troop
                    over: { query: binding, name: '$movingTroops@{$space}' }
                    effects:
                      - moveToken:
                          token: $troop
                          from: { zoneExpr: { ref: tokenZone, token: $troop } }
                          to: $space
                - macro: sweep-loc-hop
                  args:
                    space: $space
                    troopFaction: 'ARVN'
                - macro: sweep-activation
                  args:
                    space: $space
                    cubeFaction: 'ARVN'
                    sfType: ranger
      - stage: cap-cobras-bonus-removal
        effects:
          - macro: cap-sweep-cobras-unshaded-removal
            args:
              targetSpaces: targetSpaces
      - stage: cap-booby-traps-troop-cost
        effects:
          - macro: cap-sweep-booby-traps-shaded-cost
            args:
              targetSpaces: targetSpaces
              actorFaction: ARVN
    atomicity: atomic
  - id: assault-us-profile
    actionId: assault
    applicability: { op: '==', left: { ref: activePlayer }, right: 0 }
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_generalLansdale }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                            right: 0
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                            right: 0
                    min: 1
                    max: 1
              else:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_abrams }, right: shaded }
                    then:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                                  right: 0
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                                  right: 0
                          min: 1
                          max: 2
                    else:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                                  right: 0
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                                  right: 0
                          min: 1
                          max: 99
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: cap-assault-cobras-shaded-cost
                  args:
                    space: $space
                - let:
                    bind: $usTroops
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: troops }] } } }
                    in:
                      - let:
                          bind: $hasUSBase
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }] } } }
                          in:
                            - let:
                                bind: $damage
                                value:
                                  if:
                                    when: { op: '>', left: { ref: binding, name: $hasUSBase }, right: 0 }
                                    then: { op: '*', left: { ref: binding, name: $usTroops }, right: 2 }
                                    else:
                                      if:
                                        when: { op: zonePropIncludes, zone: $space, prop: terrainTags, value: 'highland' }
                                        then: { op: '/', left: { ref: binding, name: $usTroops }, right: 2 }
                                        else: { ref: binding, name: $usTroops }
                                in:
                                  - macro: coin-assault-removal-order
                                    args:
                                      space: $space
                                      damageExpr: { ref: binding, name: $damage }
                                      bodyCountEligible: true
                - macro: cap-assault-search-and-destroy
                  args:
                    space: $space
      - stage: cap-abrams-base-first
        effects:
          - macro: cap-assault-abrams-unshaded-base-first
            args:
              targetSpaces: targetSpaces
      - stage: cap-m48-patton-bonus-removal
        effects:
          - macro: cap-assault-m48-unshaded-bonus-removal
            args:
              targetSpaces: targetSpaces
      - stage: arvn-followup
        effects:
          - if:
              when:
                op: or
                args:
                  - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
                  - conditionMacro: us-joint-op-arvn-spend-eligible
                    args:
                      resourceExpr: { ref: gvar, var: arvnResources }
                      costExpr: 3
              then:
                - chooseN:
                    bind: $arvnFollowupSpaces
                    options: { query: binding, name: targetSpaces }
                    min: 0
                    max: 1
                - forEach:
                    bind: $arvnSpace
                    over: { query: binding, name: $arvnFollowupSpaces }
                    effects:
                      - if:
                          when: { op: '!=', left: { ref: gvar, var: mom_bodyCount }, right: true }
                          then:
                            - addVar: { scope: global, var: arvnResources, delta: -3 }
                      - let:
                          bind: $arvnCubes
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $arvnSpace, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                          in:
                            - let:
                                bind: $arvnDamage
                                value:
                                  if:
                                    when: { op: zonePropIncludes, zone: $arvnSpace, prop: terrainTags, value: 'highland' }
                                    then: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                                    else: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                                in:
                                  - macro: coin-assault-removal-order
                                    args:
                                      space: $arvnSpace
                                      damageExpr: { ref: binding, name: $arvnDamage }
                                      bodyCountEligible: true
    atomicity: atomic
  - id: assault-arvn-profile
    actionId: assault
    applicability: { op: '==', left: { ref: activePlayer }, right: 1 }
    legality:
      op: or
      args:
        - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
        - { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costValidation:
      op: or
      args:
        - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
        - { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                            right: 0
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                            right: 0
                    min: 1
                    max: 1
              else:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_abrams }, right: shaded }
                    then:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                                  right: 0
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                                  right: 0
                          min: 1
                          max:
                            if:
                              when: { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
                              then: 99
                              else:
                                op: min
                                left: 2
                                right:
                                  op: floorDiv
                                  left: { ref: gvar, var: arvnResources }
                                  right: 3
                    else:
                      - chooseN:
                          bind: targetSpaces
                          options:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                                  right: 0
                                - op: '>'
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                                  right: 0
                          min: 1
                          max:
                            if:
                              when: { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
                              then: 99
                              else:
                                op: floorDiv
                                left: { ref: gvar, var: arvnResources }
                                right: 3
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when:
                      op: and
                      args:
                        - { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                        - { op: '!=', left: { ref: gvar, var: mom_bodyCount }, right: true }
                    then:
                      - addVar: { scope: global, var: arvnResources, delta: -3 }
                - macro: cap-assault-cobras-shaded-cost
                  args:
                    space: $space
                - let:
                    bind: $isProvince
                    value:
                      if:
                        when: { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: 'province' }
                        then: 1
                        else: 0
                    in:
                      - let:
                          bind: $arvnCubes
                          value:
                            if:
                              when: { op: '==', left: { ref: binding, name: $isProvince }, right: 1 }
                              then: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: troops }] } } }
                              else: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
                          in:
                            - let:
                                bind: $damage
                                value:
                                  if:
                                    when: { op: zonePropIncludes, zone: $space, prop: terrainTags, value: 'highland' }
                                    then: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                                    else: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                                in:
                                  - macro: coin-assault-removal-order
                                    args:
                                      space: $space
                                      damageExpr: { ref: binding, name: $damage }
                                      bodyCountEligible: true
                - macro: cap-assault-search-and-destroy
                  args:
                    space: $space
      - stage: cap-abrams-base-first
        effects:
          - macro: cap-assault-abrams-unshaded-base-first
            args:
              targetSpaces: targetSpaces
      - stage: cap-m48-patton-bonus-removal
        effects:
          - macro: cap-assault-m48-unshaded-bonus-removal
            args:
              targetSpaces: targetSpaces
    atomicity: atomic
  # ── Insurgent profiles (rally) and remaining stubs (march, attack, terror) ──
  - id: rally-nva-profile
    actionId: rally
    applicability: { op: '==', left: { ref: activePlayer }, right: 2 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-rally-select-spaces
            args:
              resourceVar: nvaResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: nvaResources, delta: -1 }
                - let:
                    bind: $nvaBaseCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: base }] } } }
                    in:
                      - if:
                          when: { op: '==', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                          then:
                            - if:
                                when:
                                  op: and
                                  args:
                                    - op: '>='
                                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }] } } }
                                      right: 2
                                    - op: '<'
                                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }] } } }
                                      right: 2
                                then:
                                  - chooseOne:
                                      bind: $noBaseChoice
                                      options: { query: enums, values: ['place-guerrilla', 'replace-with-base'] }
                                else:
                                  - chooseOne:
                                      bind: $noBaseChoice
                                      options: { query: enums, values: ['place-guerrilla'] }
                            - if:
                                when: { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'place-guerrilla' }
                                then:
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: guerrilla
                                      faction: 'NVA'
                                      targetSpace: $space
                                      maxPieces: 1
                            - if:
                                when: { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'replace-with-base' }
                                then:
                                  - forEach:
                                      bind: $g
                                      over:
                                        query: tokensInZone
                                        zone: $space
                                        filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }]
                                      limit: 2
                                      effects:
                                        - moveToken: { token: $g, from: $space, to: { zoneExpr: 'available-NVA:none' } }
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: base
                                      faction: 'NVA'
                                      targetSpace: $space
                                      maxPieces: 1
                      - if:
                          when: { op: '>', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                          then:
                            - let:
                                bind: $rallyLimit
                                value: { op: '+', left: { ref: gvar, var: trail }, right: { ref: binding, name: $nvaBaseCount } }
                                in:
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: guerrilla
                                      faction: 'NVA'
                                      targetSpace: $space
                                      maxPieces: { ref: binding, name: $rallyLimit }
      - stage: trail-improvement
        effects:
          - if:
              when:
                op: and
                args:
                  - { op: '>=', left: { ref: gvar, var: nvaResources }, right: 2 }
                  - { op: '<', left: { ref: gvar, var: trail }, right: 4 }
                  - { op: '!=', left: { ref: gvar, var: mom_mcnamaraLine }, right: true }
              then:
                - chooseOne:
                    bind: $improveTrail
                    options: { query: enums, values: ['yes', 'no'] }
                - if:
                    when: { op: '==', left: { ref: binding, name: $improveTrail }, right: 'yes' }
                    then:
                      - if:
                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_aaa }, right: unshaded }
                          then:
                            - chooseN:
                                bind: $trailImproveSpaces
                                options:
                                  query: mapSpaces
                                  filter:
                                    op: or
                                    args:
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                                min: 1
                                max: 1
                          else:
                            - chooseN:
                                bind: $trailImproveSpaces
                                options:
                                  query: mapSpaces
                                  filter:
                                    op: or
                                    args:
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                                min: 1
                                max: 99
                      - forEach:
                          bind: $trailSpace
                          over: { query: binding, name: $trailImproveSpaces }
                          effects:
                            - if:
                                when:
                                  op: and
                                  args:
                                    - { op: '>=', left: { ref: gvar, var: nvaResources }, right: 2 }
                                    - { op: '<', left: { ref: gvar, var: trail }, right: 4 }
                                then:
                                  - addVar: { scope: global, var: nvaResources, delta: -2 }
                                  - addVar:
                                      scope: global
                                      var: trail
                                      delta:
                                        if:
                                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_sa2s }, right: shaded }
                                          then:
                                            if:
                                              when: { op: '>=', left: { ref: gvar, var: trail }, right: 3 }
                                              then: 1
                                              else: 2
                                          else: 1
    atomicity: atomic
  - id: rally-vc-profile
    actionId: rally
    applicability: { op: '==', left: { ref: activePlayer }, right: 3 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-rally-select-spaces
            args:
              resourceVar: vcResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: vcResources, delta: -1 }
                - let:
                    bind: $vcBaseCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: base }] } } }
                    in:
                      - if:
                          when: { op: '==', left: { ref: binding, name: $vcBaseCount }, right: 0 }
                          then:
                            - if:
                                when:
                                  op: and
                                  args:
                                    - op: '>='
                                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }] } } }
                                      right: 2
                                    - op: '<'
                                      left: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: type, eq: base }] } } }
                                      right: 2
                                then:
                                  - chooseOne:
                                      bind: $noBaseChoice
                                      options: { query: enums, values: ['place-guerrilla', 'replace-with-base'] }
                                else:
                                  - chooseOne:
                                      bind: $noBaseChoice
                                      options: { query: enums, values: ['place-guerrilla'] }
                            - if:
                                when: { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'place-guerrilla' }
                                then:
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: guerrilla
                                      faction: 'VC'
                                      targetSpace: $space
                                      maxPieces: 1
                            - if:
                                when: { op: '==', left: { ref: binding, name: $noBaseChoice }, right: 'replace-with-base' }
                                then:
                                  - forEach:
                                      bind: $g
                                      over:
                                        query: tokensInZone
                                        zone: $space
                                        filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }]
                                      limit: 2
                                      effects:
                                        - moveToken: { token: $g, from: $space, to: { zoneExpr: 'available-VC:none' } }
                                  - macro: place-from-available-or-map
                                    args:
                                      pieceType: base
                                      faction: 'VC'
                                      targetSpace: $space
                                      maxPieces: 1
                      - if:
                          when: { op: '>', left: { ref: binding, name: $vcBaseCount }, right: 0 }
                          then:
                            - chooseOne:
                                bind: $withBaseChoice
                                options: { query: enums, values: ['place-guerrillas', 'flip-underground'] }
                            - if:
                                when: { op: '==', left: { ref: binding, name: $withBaseChoice }, right: 'place-guerrillas' }
                                then:
                                  - let:
                                      bind: $rallyLimit
                                      value: { op: '+', left: { ref: zoneProp, zone: $space, prop: population }, right: { ref: binding, name: $vcBaseCount } }
                                      in:
                                        - macro: place-from-available-or-map
                                          args:
                                            pieceType: guerrilla
                                            faction: 'VC'
                                            targetSpace: $space
                                            maxPieces: { ref: binding, name: $rallyLimit }
                            - if:
                                when: { op: '==', left: { ref: binding, name: $withBaseChoice }, right: 'flip-underground' }
                                then:
                                  - forEach:
                                      bind: $g
                                      over:
                                        query: tokensInZone
                                        zone: $space
                                        filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }, { prop: activity, eq: active }]
                                      effects:
                                        - setTokenProp: { token: $g, prop: activity, value: underground }
      - stage: cap-cadres-rally-agitate
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_cadres }, right: shaded }
              then:
                - chooseN:
                    bind: $cadresAgitateSpaces
                    options: { query: binding, name: targetSpaces }
                    min: 0
                    max: 1
                - forEach:
                    bind: $cadresSpace
                    over: { query: binding, name: $cadresAgitateSpaces }
                    effects:
                      - if:
                          when:
                            op: and
                            args:
                              - op: '>'
                                left:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $cadresSpace
                                      filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: base }]
                                right: 0
                              - op: or
                                args:
                                  - { op: '==', left: { ref: zoneProp, zone: $cadresSpace, prop: category }, right: city }
                                  - { op: '==', left: { ref: zoneProp, zone: $cadresSpace, prop: category }, right: province }
                              - { op: '>', left: { ref: zoneProp, zone: $cadresSpace, prop: population }, right: 0 }
                              - { op: '!=', left: { ref: markerState, space: $cadresSpace, marker: supportOpposition }, right: activeOpposition }
                          then:
                            - shiftMarker:
                                space: $cadresSpace
                                marker: supportOpposition
                                delta: -1
    atomicity: atomic
  - id: march-nva-profile
    actionId: march
    applicability: { op: '==', left: { ref: activePlayer }, right: 2 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-destinations
        effects:
          - macro: insurgent-march-select-destinations
            args:
              faction: 'NVA'
              resourceVar: nvaResources
      - stage: resolve-per-destination
        effects:
          - forEach:
              bind: $destSpace
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: insurgent-march-resolve-destination
                  args:
                    destSpace: $destSpace
                    faction: 'NVA'
                    resourceVar: nvaResources
                    allowTrailCountryFreeCost: true
                    maxActivatedGuerrillas: 99
      - stage: select-trail-chain-destinations
        effects:
          - if:
              when:
                op: and
                args:
                  - { op: '>', left: { ref: gvar, var: trail }, right: 0 }
                  - { op: '!=', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: chainSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'laos' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'cambodia' }
                    min: 0
                    max: 99
      - stage: resolve-trail-chain-destinations
        effects:
          - if:
              when:
                op: and
                args:
                  - { op: '>', left: { ref: gvar, var: trail }, right: 0 }
                  - { op: '!=', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - forEach:
                    bind: $destSpace
                    over: { query: binding, name: chainSpaces }
                    effects:
                      - macro: insurgent-march-resolve-destination
                        args:
                          destSpace: $destSpace
                          faction: 'NVA'
                          resourceVar: nvaResources
                          allowTrailCountryFreeCost: true
                          maxActivatedGuerrillas: 99
    atomicity: atomic
  - id: march-vc-profile
    actionId: march
    applicability: { op: '==', left: { ref: activePlayer }, right: 3 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-destinations
        effects:
          - macro: insurgent-march-select-destinations
            args:
              faction: 'VC'
              resourceVar: vcResources
      - stage: resolve-per-destination
        effects:
          - forEach:
              bind: $destSpace
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: insurgent-march-resolve-destination
                  args:
                    destSpace: $destSpace
                    faction: 'VC'
                    resourceVar: vcResources
                    allowTrailCountryFreeCost: false
                    maxActivatedGuerrillas:
                      if:
                        when: { op: '==', left: { ref: globalMarkerState, marker: cap_mainForceBns }, right: unshaded }
                        then: 99
                        else: 1
    atomicity: atomic
  - id: attack-nva-profile
    actionId: attack
    applicability: { op: '==', left: { ref: activePlayer }, right: 2 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-attack-select-spaces
            args:
              faction: 'NVA'
              resourceVar: nvaResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - if:
                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_pt76 }, right: unshaded }
                          then:
                            - removeByPriority:
                                budget: 1
                                groups:
                                  - bind: $pt76CostTroop
                                    over:
                                      query: tokensInZone
                                      zone: $space
                                      filter:
                                        - { prop: faction, eq: NVA }
                                        - { prop: type, eq: troops }
                                    to:
                                      zoneExpr: 'available-NVA:none'
                          else:
                            - addVar: { scope: global, var: nvaResources, delta: -1 }
                - chooseOne:
                    bind: $attackMode
                    options: { query: enums, values: ['guerrilla-attack', 'troops-attack'] }
                - if:
                    when: { op: '==', left: { ref: binding, name: $attackMode }, right: 'guerrilla-attack' }
                    then:
                      - forEach:
                          bind: $g
                          over:
                            query: tokensInZone
                            zone: $space
                            filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }]
                          effects:
                            - setTokenProp: { token: $g, prop: activity, value: active }
                      - let:
                          bind: $guerrillaCount
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: guerrilla }] } } }
                          in:
                            - rollRandom:
                                bind: $dieRoll
                                min: 1
                                max: 6
                                in:
                                  - if:
                                      when: { op: '<=', left: { ref: binding, name: $dieRoll }, right: { ref: binding, name: $guerrillaCount } }
                                      then:
                                        - macro: insurgent-attack-removal-order
                                          args:
                                            space: $space
                                            damageExpr: 2
                                            attackerFaction: 'NVA'
                - if:
                    when: { op: '==', left: { ref: binding, name: $attackMode }, right: 'troops-attack' }
                    then:
                      - let:
                          bind: $nvaTroops
                          value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'NVA' }, { prop: type, eq: troops }] } } }
                          in:
                            - let:
                                bind: $damage
                                value:
                                  if:
                                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_pt76 }, right: shaded }
                                    then: { ref: binding, name: $nvaTroops }
                                    else: { op: '/', left: { ref: binding, name: $nvaTroops }, right: 2 }
                                in:
                                  - macro: insurgent-attack-removal-order
                                    args:
                                      space: $space
                                      damageExpr: { ref: binding, name: $damage }
                                      attackerFaction: 'NVA'
    atomicity: atomic
  - id: attack-vc-profile
    actionId: attack
    applicability: { op: '==', left: { ref: activePlayer }, right: 3 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-attack-select-spaces
            args:
              faction: 'VC'
              resourceVar: vcResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: vcResources, delta: -1 }
                - forEach:
                    bind: $g
                    over:
                      query: tokensInZone
                      zone: $space
                      filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }]
                    effects:
                      - setTokenProp: { token: $g, prop: activity, value: active }
                - let:
                    bind: $guerrillaCount
                    value: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: 'VC' }, { prop: type, eq: guerrilla }] } } }
                    in:
                      - rollRandom:
                          bind: $dieRoll
                          min: 1
                          max: 6
                          in:
                            - if:
                                when: { op: '<=', left: { ref: binding, name: $dieRoll }, right: { ref: binding, name: $guerrillaCount } }
                                then:
                                  - macro: insurgent-attack-removal-order
                                    args:
                                      space: $space
                                      damageExpr: 2
                                      attackerFaction: 'VC'
    atomicity: atomic
  - id: terror-nva-profile
    actionId: terror
    applicability: { op: '==', left: { ref: activePlayer }, right: 2 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-terror-select-spaces
            args:
              faction: 'NVA'
              includeTroops: true
              resourceVar: nvaResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: insurgent-terror-resolve-space
                  args:
                    space: $space
                    faction: 'NVA'
                    resourceVar: nvaResources
                    shiftFromSupportOnly: true
    atomicity: atomic
  - id: terror-vc-profile
    actionId: terror
    applicability: { op: '==', left: { ref: activePlayer }, right: 3 }
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - macro: insurgent-terror-select-spaces
            args:
              faction: 'VC'
              includeTroops: false
              resourceVar: vcResources
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - macro: insurgent-terror-resolve-space
                  args:
                    space: $space
                    faction: 'VC'
                    resourceVar: vcResources
                    shiftFromSupportOnly: false
    atomicity: atomic
  # ── US/ARVN special-activity profiles ──
  - id: advise-profile
    actionId: advise
    accompanyingOps: [train, patrol]
    compoundParamConstraints:
      - relation: disjoint
        operationParam: targetSpaces
        specialActivityParam: targetSpaces
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
              then:
                - macro: advise-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - macro: advise-select-spaces
                  args:
                    maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - if:
                    when:
                      op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: lookahead:none
                            filter:
                              - { prop: isCoup, eq: true }
                      right: 0
                    then:
                      - chooseOne:
                          bind: '$adviseMode@{$space}'
                          options: { query: enums, values: ['assault', 'activate-remove'] }
                    else:
                      - chooseOne:
                          bind: '$adviseMode@{$space}'
                          options: { query: enums, values: ['sweep', 'assault', 'activate-remove'] }
                - if:
                    when: { op: '==', left: { ref: binding, name: '$adviseMode@{$space}' }, right: sweep }
                    then:
                      - macro: sweep-activation
                        args:
                          space: $space
                          cubeFaction: ARVN
                          sfType: ranger
                - if:
                    when: { op: '==', left: { ref: binding, name: '$adviseMode@{$space}' }, right: assault }
                    then:
                      - let:
                          bind: $isProvince
                          value:
                            if:
                              when: { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: province }
                              then: 1
                              else: 0
                          in:
                            - let:
                                bind: $arvnCubes
                                value:
                                  if:
                                    when: { op: '==', left: { ref: binding, name: $isProvince }, right: 1 }
                                    then: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: ARVN }, { prop: type, eq: troops }] } } }
                                    else: { aggregate: { op: count, query: { query: tokensInZone, zone: $space, filter: [{ prop: faction, eq: ARVN }, { prop: type, op: in, value: [troops, police] }] } } }
                                in:
                                  - let:
                                      bind: $damage
                                      value:
                                        if:
                                          when: { op: zonePropIncludes, zone: $space, prop: terrainTags, value: highland }
                                          then: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                                          else: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 2 }
                                      in:
                                        - macro: coin-assault-removal-order
                                          args:
                                            space: $space
                                            damageExpr: { ref: binding, name: $damage }
                                            bodyCountEligible: false
                - if:
                    when: { op: '==', left: { ref: binding, name: '$adviseMode@{$space}' }, right: activate-remove }
                    then:
                      - forEach:
                          bind: $friendlySF
                          over:
                            query: tokensInZone
                            zone: $space
                            filter:
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
                              - { prop: type, op: in, value: [irregular, ranger] }
                              - { prop: activity, eq: underground }
                          limit: 1
                          effects:
                            - setTokenProp: { token: $friendlySF, prop: activity, value: active }
                      - macro: us-sa-remove-insurgents
                        args:
                          space: $space
                          budgetExpr: 2
                          activeGuerrillasOnly: false
      - stage: optional-aid
        effects:
          - chooseOne:
              bind: $adviseAid
              options: { query: enums, values: ['yes', 'no'] }
          - if:
              when: { op: '==', left: { ref: binding, name: $adviseAid }, right: 'yes' }
              then:
                - addVar:
                    scope: global
                    var: aid
                    delta: 6
      - stage: advise-telemetry
        effects:
          - addVar:
              scope: global
              var: adviseCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: air-lift-profile
    actionId: airLift
    accompanyingOps: any
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - op: and
          args:
            - { op: '!=', left: { ref: gvar, var: mom_medevacShaded }, right: true }
            - { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - chooseN:
              bind: spaces
              options:
                query: mapSpaces
                filter:
                  op: '!='
                  left: { ref: zoneProp, zone: $zone, prop: country }
                  right: northVietnam
              min: 1
              max: 4
      - stage: move-us-troops
        effects:
          - chooseN:
              bind: $usLiftTroops
              options:
                query: tokensInMapSpaces
                spaceFilter:
                  op: in
                  item: { ref: zoneProp, zone: $zone, prop: id }
                  set: { ref: binding, name: spaces }
                filter:
                  - { prop: faction, eq: US }
                  - { prop: type, eq: troops }
              min: 0
              max: 99
          - forEach:
              bind: $usTroop
              over: { query: binding, name: $usLiftTroops }
              effects:
                - chooseOne:
                    bind: '$usLiftDestination@{$usTroop}'
                    options: { query: binding, name: spaces }
                - if:
                    when:
                      op: '!='
                      left: { ref: tokenZone, token: $usTroop }
                      right: { ref: binding, name: '$usLiftDestination@{$usTroop}' }
                    then:
                      - moveToken:
                          token: $usTroop
                          from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                          to: { zoneExpr: { ref: binding, name: '$usLiftDestination@{$usTroop}' } }
      - stage: move-coin-lift-pieces
        effects:
          - chooseN:
              bind: $coinLiftPieces
              options:
                query: concat
                sources:
                  - query: tokensInMapSpaces
                    spaceFilter:
                      op: in
                      item: { ref: zoneProp, zone: $zone, prop: id }
                      set: { ref: binding, name: spaces }
                    filter:
                      - { prop: faction, eq: ARVN }
                      - { prop: type, op: in, value: [troops, ranger] }
                  - query: tokensInMapSpaces
                    spaceFilter:
                      op: in
                      item: { ref: zoneProp, zone: $zone, prop: id }
                      set: { ref: binding, name: spaces }
                    filter:
                      - { prop: faction, eq: US }
                      - { prop: type, eq: irregular }
              min: 0
              max: 4
          - forEach:
              bind: $coinLiftPiece
              over: { query: binding, name: $coinLiftPieces }
              effects:
                - chooseOne:
                    bind: '$coinLiftDestination@{$coinLiftPiece}'
                    options: { query: binding, name: spaces }
                - if:
                    when:
                      op: '!='
                      left: { ref: tokenZone, token: $coinLiftPiece }
                      right: { ref: binding, name: '$coinLiftDestination@{$coinLiftPiece}' }
                    then:
                      - moveToken:
                          token: $coinLiftPiece
                          from: { zoneExpr: { ref: tokenZone, token: $coinLiftPiece } }
                          to: { zoneExpr: { ref: binding, name: '$coinLiftDestination@{$coinLiftPiece}' } }
      - stage: air-lift-telemetry
        effects:
          - addVar:
              scope: global
              var: airLiftCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: air-strike-profile
    actionId: airStrike
    accompanyingOps: any
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - op: and
          args:
            - { op: '!=', left: { ref: gvar, var: mom_rollingThunder }, right: true }
            - { op: '!=', left: { ref: gvar, var: mom_daNang }, right: true }
            - { op: '!=', left: { ref: gvar, var: mom_bombingPause }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - chooseN:
              bind: spaces
              options:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - op: '!='
                      left: { ref: zoneProp, zone: $zone, prop: country }
                      right: northVietnam
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: ['US', 'ARVN'] }
                      right: 0
              min: 0
              max:
                if:
                  when:
                    op: or
                    args:
                      - { op: '==', left: { ref: globalMarkerState, marker: cap_arcLight }, right: unshaded }
                      - { op: '==', left: { ref: gvar, var: mom_wildWeasels }, right: true }
                  then: 1
                  else: 6
      - stage: remove-active-enemy-pieces
        effects:
          - setVar:
              scope: global
              var: airStrikeRemaining
              value:
                if:
                  when: { op: '==', left: { ref: gvar, var: mom_wildWeasels }, right: true }
                  then: 1
                  else:
                    if:
                      when: { op: '==', left: { ref: globalMarkerState, marker: cap_lgbs }, right: shaded }
                      then: 4
                      else: 6
          - let:
              bind: $spaceCount
              value: { aggregate: { op: count, query: { query: binding, name: spaces } } }
              in:
                - forEach:
                    bind: $space
                    over: { query: binding, name: spaces }
                    effects:
                      - let:
                          bind: $enemyBefore
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, op: in, value: ['NVA', 'VC'] }
                          in:
                            - if:
                                when: { op: '>', left: { ref: gvar, var: airStrikeRemaining }, right: 0 }
                                then:
                                  - macro: us-sa-remove-insurgents
                                    args:
                                      space: $space
                                      budgetExpr: { ref: gvar, var: airStrikeRemaining }
                                      activeGuerrillasOnly: true
                            - let:
                                bind: $enemyAfter
                                value:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $space
                                      filter:
                                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                in:
                                  - addVar:
                                      scope: global
                                      var: airStrikeRemaining
                                      delta:
                                        op: "-"
                                        left: { ref: binding, name: $enemyAfter }
                                        right: { ref: binding, name: $enemyBefore }
                                  - let:
                                      bind: $removedInSpace
                                      value:
                                        op: "-"
                                        left: { ref: binding, name: $enemyBefore }
                                        right: { ref: binding, name: $enemyAfter }
                                      in:
                                        - if:
                                            when:
                                              op: and
                                              args:
                                                - op: or
                                                  args:
                                                    - { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: province }
                                                    - { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: city }
                                                - { op: '>', left: { ref: zoneProp, zone: $space, prop: population }, right: 0 }
                                                - { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeOpposition }
                                                - op: or
                                                  args:
                                                    - { op: '!=', left: { ref: globalMarkerState, marker: cap_lgbs }, right: unshaded }
                                                    - { op: '!=', left: { ref: binding, name: $removedInSpace }, right: 1 }
                                            then:
                                              - shiftMarker:
                                                  space: $space
                                                  marker: supportOpposition
                                                  delta:
                                                    if:
                                                      when:
                                                        op: and
                                                        args:
                                                          - { op: '==', left: { ref: globalMarkerState, marker: cap_arcLight }, right: shaded }
                                                          - { op: '>', left: { ref: binding, name: $spaceCount }, right: 1 }
                                                      then: -2
                                                      else: -1
      - stage: optional-trail-degrade
        effects:
          - chooseOne:
              bind: $degradeTrail
              options: { query: enums, values: ['yes', 'no'] }
          - if:
              when:
                op: and
                args:
                  - { op: '==', left: { ref: binding, name: $degradeTrail }, right: 'yes' }
                  - { op: '>', left: { ref: gvar, var: trail }, right: 0 }
                  - { op: '!=', left: { ref: gvar, var: mom_oriskany }, right: true }
                  - op: or
                    args:
                      - { op: '!=', left: { ref: gvar, var: mom_wildWeasels }, right: true }
                      - op: '=='
                        left: { aggregate: { op: count, query: { query: binding, name: spaces } } }
                        right: 0
              then:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: shaded }
                    then:
                      - rollRandom:
                          bind: $topGunDie
                          min: 1
                          max: 6
                          in:
                            - if:
                                when: { op: '>=', left: { ref: binding, name: $topGunDie }, right: 4 }
                                then:
                                  - addVar:
                                      scope: global
                                      var: trail
                                      delta:
                                        op: '-'
                                        left: 0
                                        right:
                                          if:
                                            when: { op: '==', left: { ref: globalMarkerState, marker: cap_aaa }, right: shaded }
                                            then:
                                              if:
                                                when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                                                then: 2
                                                else: 1
                                            else:
                                              if:
                                                when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                                                then: 2
                                                else: 1
                                  - if:
                                      when:
                                        op: and
                                        args:
                                          - { op: '==', left: { ref: globalMarkerState, marker: cap_migs }, right: shaded }
                                          - { op: '!=', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                                      then:
                                        - chooseN:
                                            bind: $migsCostSpaces
                                            options: { query: binding, name: spaces }
                                            min: 0
                                            max: 1
                                        - forEach:
                                            bind: $migsCostSpace
                                            over: { query: binding, name: $migsCostSpaces }
                                            effects:
                                              - forEach:
                                                  bind: $migsCostTroop
                                                  over:
                                                    query: tokensInZone
                                                    zone: $migsCostSpace
                                                    filter: [{ prop: faction, eq: US }, { prop: type, eq: troops }]
                                                  limit: 1
                                                  effects:
                                                    - moveToken:
                                                        token: $migsCostTroop
                                                        from: $migsCostSpace
                                                        to: { zoneExpr: 'casualties-US:none' }
                                  - if:
                                      when: { op: '==', left: { ref: globalMarkerState, marker: cap_sa2s }, right: unshaded }
                                      then:
                                        - chooseN:
                                            bind: $sa2sCostSpaces
                                            options: { query: binding, name: spaces }
                                            min: 0
                                            max: 1
                                        - forEach:
                                            bind: $sa2sCostSpace
                                            over: { query: binding, name: $sa2sCostSpaces }
                                            effects:
                                              - forEach:
                                                  bind: $sa2sCostPiece
                                                  over:
                                                    query: tokensInZone
                                                    zone: $sa2sCostSpace
                                                    filter: [{ prop: faction, eq: NVA }]
                                                  limit: 1
                                                  effects:
                                                    - moveToken:
                                                        token: $sa2sCostPiece
                                                        from: $sa2sCostSpace
                                                        to: { zoneExpr: 'available-NVA:none' }
                    else:
                      - addVar:
                          scope: global
                          var: trail
                          delta:
                            op: '-'
                            left: 0
                            right:
                              if:
                                when: { op: '==', left: { ref: globalMarkerState, marker: cap_aaa }, right: shaded }
                                then:
                                  if:
                                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                                    then: 2
                                    else: 1
                                else:
                                  if:
                                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                                    then: 2
                                    else: 1
                      - if:
                          when:
                            op: and
                            args:
                              - { op: '==', left: { ref: globalMarkerState, marker: cap_migs }, right: shaded }
                              - { op: '!=', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                          then:
                            - chooseN:
                                bind: $migsCostSpaces
                                options: { query: binding, name: spaces }
                                min: 0
                                max: 1
                            - forEach:
                                bind: $migsCostSpace
                                over: { query: binding, name: $migsCostSpaces }
                                effects:
                                  - forEach:
                                      bind: $migsCostTroop
                                      over:
                                        query: tokensInZone
                                        zone: $migsCostSpace
                                        filter: [{ prop: faction, eq: US }, { prop: type, eq: troops }]
                                      limit: 1
                                      effects:
                                        - moveToken:
                                            token: $migsCostTroop
                                            from: $migsCostSpace
                                            to: { zoneExpr: 'casualties-US:none' }
                      - if:
                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_sa2s }, right: unshaded }
                          then:
                            - chooseN:
                                bind: $sa2sCostSpaces
                                options: { query: binding, name: spaces }
                                min: 0
                                max: 1
                            - forEach:
                                bind: $sa2sCostSpace
                                over: { query: binding, name: $sa2sCostSpaces }
                                effects:
                                  - forEach:
                                      bind: $sa2sCostPiece
                                      over:
                                        query: tokensInZone
                                        zone: $sa2sCostSpace
                                        filter: [{ prop: faction, eq: NVA }]
                                      limit: 1
                                      effects:
                                        - moveToken:
                                            token: $sa2sCostPiece
                                            from: $sa2sCostSpace
                                            to: { zoneExpr: 'available-NVA:none' }
      - stage: air-strike-telemetry
        effects:
          - addVar:
              scope: global
              var: airStrikeCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: govern-profile
    actionId: govern
    accompanyingOps: [train, patrol]
    compoundParamConstraints:
      - relation: disjoint
        operationParam: targetSpaces
        specialActivityParam: targetSpaces
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_mandateOfHeaven }, right: shaded }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: mapSpaces
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                          - op: or
                            args:
                              - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: passiveSupport }
                              - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
                          - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: id }, right: saigon:none }
                          - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                          - op: '>'
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: in, value: ['US', 'ARVN'] }
                            right:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    min: 1
                    max: 1
              else:
                - if:
                    when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
                    then:
                      - macro: govern-select-spaces-standard
                        args:
                          maxSpaces: 1
                    else:
                      - macro: govern-select-spaces-standard
                        args:
                          maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_mandateOfHeaven }, right: unshaded }
              then:
                - chooseOne:
                    bind: $mandateNoShiftSpace
                    options: { query: binding, name: targetSpaces }
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - chooseOne:
                    bind: '$governMode@{$space}'
                    options: { query: enums, values: ['aid', 'patronage'] }
                - if:
                    when: { op: '==', left: { ref: binding, name: '$governMode@{$space}' }, right: aid }
                    then:
                      - addVar:
                          scope: global
                          var: aid
                          delta:
                            op: '*'
                            left: { ref: zoneProp, zone: $space, prop: population }
                            right: 3
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: '$governMode@{$space}' }, right: patronage }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, op: in, value: [troops, police] }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: US }
                                  - { prop: type, eq: troops }
                    then:
                      - addVar:
                          scope: global
                          var: aid
                          delta:
                            op: '*'
                            left: { ref: zoneProp, zone: $space, prop: population }
                            right: -1
                      - addVar:
                          scope: global
                          var: patronage
                          delta: { ref: zoneProp, zone: $space, prop: population }
                      - if:
                          when: { op: '==', left: { ref: globalMarkerState, marker: cap_mandateOfHeaven }, right: unshaded }
                          then:
                            - if:
                                when: { op: '!=', left: { ref: binding, name: $mandateNoShiftSpace }, right: { ref: binding, name: $space } }
                                then:
                                  - shiftMarker: { space: $space, marker: supportOpposition, delta: -1 }
                          else:
                            - shiftMarker: { space: $space, marker: supportOpposition, delta: -1 }
      - stage: govern-telemetry
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: youngTurks }
              then:
                - addVar: { scope: global, var: patronage, delta: 2 }
          - addVar:
              scope: global
              var: governCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  - id: transport-profile
    actionId: transport
    accompanyingOps: any
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-origin
        effects:
          - chooseOne:
              bind: $transportOrigin
              options:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, op: in, value: { ref: namedSet, name: ARVNTransportEligibleTypes } }
                      right: 0
      - stage: select-destination
        effects:
          - chooseOne:
              bind: $transportDestination
              options:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                    - op: or
                      args:
                        - op: and
                          args:
                            - { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: khanh }
                            - op: connected
                              from: $transportOrigin
                              to: $zone
                              maxDepth: 2
                              via:
                                op: and
                                args:
                                  - op: or
                                    args:
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                                  - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                                  - op: '=='
                                    left:
                                      aggregate:
                                        op: count
                                        query:
                                          query: tokensInZone
                                          zone: $zone
                                          filter:
                                            - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    right: 0
                        - op: and
                          args:
                            - { op: '!=', left: { ref: globalMarkerState, marker: activeLeader }, right: khanh }
                            - op: connected
                              from: $transportOrigin
                              to: $zone
                              via:
                                op: and
                                args:
                                  - op: or
                                    args:
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                                  - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                                  - op: '=='
                                    left:
                                      aggregate:
                                        op: count
                                        query:
                                          query: tokensInZone
                                          zone: $zone
                                          filter:
                                            - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    right: 0
      - stage: move-selected-pieces
        effects:
          - forEach:
              bind: $piece
              over:
                query: tokensInZone
                zone: $transportOrigin
                filter:
                  - { prop: faction, eq: ARVN }
                  - { prop: type, op: in, value: { ref: namedSet, name: ARVNTransportEligibleTypes } }
              limit: 6
              effects:
                - if:
                    when: { op: '!=', left: { ref: tokenZone, token: $piece }, right: { ref: binding, name: $transportDestination } }
                    then:
                      - moveToken:
                          token: $piece
                          from: { zoneExpr: { ref: tokenZone, token: $piece } }
                          to: { zoneExpr: { ref: binding, name: $transportDestination } }
      - stage: flip-rangers-underground
        effects:
          - forEach:
              bind: $space
              over: { query: mapSpaces }
              effects:
                - forEach:
                    bind: $ranger
                    over:
                      query: tokensInZone
                      zone: $space
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: ranger }
                    effects:
                      - setTokenProp: { token: $ranger, prop: activity, value: underground }
      - stage: cap-armored-cavalry-unshaded-assault
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: unshaded }
              then:
                - macro: us-sa-remove-insurgents
                  args:
                    space: $transportDestination
                    budgetExpr: 1
                    activeGuerrillasOnly: false
      - stage: transport-telemetry
        effects:
          - addVar:
              scope: global
              var: transportCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  - id: raid-profile
    actionId: raid
    accompanyingOps: [patrol, sweep, assault]
    legality: true
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
              then:
                - macro: raid-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - macro: raid-select-spaces
                  args:
                    maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - chooseN:
                    bind: '$raidIncomingFrom@{$space}'
                    options:
                      query: adjacentZones
                      zone: $space
                    min: 0
                    max: 99
                - forEach:
                    bind: $source
                    over: { query: binding, name: '$raidIncomingFrom@{$space}' }
                    effects:
                      - forEach:
                          bind: $ranger
                          over:
                            query: tokensInZone
                            zone: $source
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: ranger }
                          effects:
                            - moveToken:
                                token: $ranger
                                from: { zoneExpr: { ref: tokenZone, token: $ranger } }
                                to: $space
                - chooseOne:
                    bind: '$raidRemove@{$space}'
                    options: { query: enums, values: ['yes', 'no'] }
                - if:
                    when:
                      op: and
                      args:
                        - { op: '==', left: { ref: binding, name: '$raidRemove@{$space}' }, right: yes }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, eq: ranger }
                                  - { prop: activity, eq: underground }
                          right: 0
                    then:
                      - forEach:
                          bind: $activatingRanger
                          over:
                            query: tokensInZone
                            zone: $space
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: ranger }
                              - { prop: activity, eq: underground }
                          limit: 1
                          effects:
                            - setTokenProp: { token: $activatingRanger, prop: activity, value: active }
                      - macro: us-sa-remove-insurgents
                        args:
                          space: $space
                          budgetExpr: 2
                          activeGuerrillasOnly: false
      - stage: raid-telemetry
        effects:
          - addVar:
              scope: global
              var: raidCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  # ── NVA/VC special-activity profiles ──
  - id: infiltrate-profile
    actionId: infiltrate
    accompanyingOps: [rally, march]
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_mcnamaraLine }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when:
                op: or
                args:
                  - { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
                  - { op: '==', left: { ref: gvar, var: mom_559thTransportGrp }, right: true }
              then:
                - macro: infiltrate-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - macro: infiltrate-select-spaces
                  args:
                    maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - let:
                    bind: $nvaBaseCount
                    value:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: $space
                          filter:
                            - { prop: faction, eq: NVA }
                            - { prop: type, eq: base }
                    in:
                      - let:
                          bind: $nvaPieceCount
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: NVA }
                          in:
                            - let:
                                bind: $vcPieceCount
                                value:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $space
                                      filter:
                                        - { prop: faction, eq: VC }
                                in:
                                  - if:
                                      when:
                                        op: and
                                        args:
                                          - { op: '>', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                                          - { op: '>', left: { ref: binding, name: $nvaPieceCount }, right: { ref: binding, name: $vcPieceCount } }
                                      then:
                                        - chooseOne:
                                            bind: '$infiltrateMode@{$space}'
                                            options: { query: enums, values: ['build-up', 'takeover'] }
                                      else:
                                        - if:
                                            when: { op: '>', left: { ref: binding, name: $nvaBaseCount }, right: 0 }
                                            then:
                                              - chooseOne:
                                                  bind: '$infiltrateMode@{$space}'
                                                  options: { query: enums, values: ['build-up'] }
                                            else:
                                              - chooseOne:
                                                  bind: '$infiltrateMode@{$space}'
                                                  options: { query: enums, values: ['takeover'] }
                                  - if:
                                      when: { op: '==', left: { ref: binding, name: '$infiltrateMode@{$space}' }, right: 'build-up' }
                                      then:
                                        - let:
                                            bind: $buildUpLimit
                                            value: { op: '+', left: { ref: gvar, var: trail }, right: { ref: binding, name: $nvaBaseCount } }
                                            in:
                                              - macro: place-from-available-or-map
                                                args:
                                                  pieceType: troops
                                                  faction: NVA
                                                  targetSpace: $space
                                                  maxPieces: { ref: binding, name: $buildUpLimit }
                                        - chooseN:
                                            bind: '$infiltrateGuerrillasToReplace@{$space}'
                                            options:
                                              query: tokensInZone
                                              zone: $space
                                              filter:
                                                - { prop: faction, eq: NVA }
                                                - { prop: type, eq: guerrilla }
                                            min: 0
                                            max: 99
                                        - forEach:
                                            bind: $replacingGuerrilla
                                            over: { query: binding, name: '$infiltrateGuerrillasToReplace@{$space}' }
                                            effects:
                                              - moveToken:
                                                  token: $replacingGuerrilla
                                                  from: { zoneExpr: { ref: tokenZone, token: $replacingGuerrilla } }
                                                  to: { zoneExpr: 'available-NVA:none' }
                                              - macro: place-from-available-or-map
                                                args:
                                                  pieceType: troops
                                                  faction: NVA
                                                  targetSpace: $space
                                                  maxPieces: 1
                                  - if:
                                      when: { op: '==', left: { ref: binding, name: '$infiltrateMode@{$space}' }, right: 'takeover' }
                                      then:
                                        - if:
                                            when:
                                              op: or
                                              args:
                                                - { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeOpposition }
                                                - { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: passiveOpposition }
                                            then:
                                              - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
                                        - chooseOne:
                                            bind: '$infiltrateTakeoverReplace@{$space}'
                                            options: { query: enums, values: ['yes', 'no'] }
                                        - if:
                                            when: { op: '==', left: { ref: binding, name: '$infiltrateTakeoverReplace@{$space}' }, right: yes }
                                            then:
                                              - if:
                                                  when:
                                                    op: and
                                                    args:
                                                      - op: '>'
                                                        left:
                                                          aggregate:
                                                            op: count
                                                            query:
                                                              query: tokensInZone
                                                              zone: $space
                                                              filter:
                                                                - { prop: faction, eq: VC }
                                                                - { prop: type, eq: guerrilla }
                                                        right: 0
                                                      - op: '>'
                                                        left:
                                                          aggregate:
                                                            op: count
                                                            query:
                                                              query: tokensInZone
                                                              zone: $space
                                                              filter:
                                                                - { prop: faction, eq: VC }
                                                                - { prop: type, eq: base }
                                                        right: 0
                                                  then:
                                                    - chooseOne:
                                                        bind: '$infiltrateTakeoverTargetType@{$space}'
                                                        options: { query: enums, values: [guerrilla, base] }
                                                  else:
                                                    - if:
                                                        when:
                                                          op: '>'
                                                          left:
                                                            aggregate:
                                                              op: count
                                                              query:
                                                                query: tokensInZone
                                                                zone: $space
                                                                filter:
                                                                  - { prop: faction, eq: VC }
                                                                  - { prop: type, eq: guerrilla }
                                                          right: 0
                                                        then:
                                                          - chooseOne:
                                                              bind: '$infiltrateTakeoverTargetType@{$space}'
                                                              options: { query: enums, values: [guerrilla] }
                                                        else:
                                                          - chooseOne:
                                                              bind: '$infiltrateTakeoverTargetType@{$space}'
                                                              options: { query: enums, values: [base] }
                                              - if:
                                                  when: { op: '==', left: { ref: binding, name: '$infiltrateTakeoverTargetType@{$space}' }, right: guerrilla }
                                                  then:
                                                    - forEach:
                                                        bind: $vcGuerrillaTarget
                                                        over:
                                                          query: tokensInZone
                                                          zone: $space
                                                          filter:
                                                            - { prop: faction, eq: VC }
                                                            - { prop: type, eq: guerrilla }
                                                        limit: 1
                                                        effects:
                                                          - moveToken:
                                                              token: $vcGuerrillaTarget
                                                              from: $space
                                                              to: { zoneExpr: 'available-VC:none' }
                                                    - macro: place-from-available-or-map
                                                      args:
                                                        pieceType: guerrilla
                                                        faction: NVA
                                                        targetSpace: $space
                                                        maxPieces: 1
                                              - if:
                                                  when: { op: '==', left: { ref: binding, name: '$infiltrateTakeoverTargetType@{$space}' }, right: base }
                                                  then:
                                                    - if:
                                                        when:
                                                          op: '>'
                                                          left:
                                                            aggregate:
                                                              op: count
                                                              query:
                                                                query: tokensInZone
                                                                zone: $space
                                                                filter:
                                                                  - { prop: faction, eq: VC }
                                                                  - { prop: type, eq: base }
                                                                  - { prop: tunnel, eq: tunneled }
                                                          right: 0
                                                        then:
                                                          - forEach:
                                                              bind: $vcTunneledBaseTarget
                                                              over:
                                                                query: tokensInZone
                                                                zone: $space
                                                                filter:
                                                                  - { prop: faction, eq: VC }
                                                                  - { prop: type, eq: base }
                                                                  - { prop: tunnel, eq: tunneled }
                                                              limit: 1
                                                              effects:
                                                                - moveToken:
                                                                    token: $vcTunneledBaseTarget
                                                                    from: $space
                                                                    to: { zoneExpr: 'available-VC:none' }
                                                          - macro: place-from-available-or-map
                                                            args:
                                                              pieceType: base
                                                              faction: NVA
                                                              targetSpace: $space
                                                              maxPieces: 1
                                                          - forEach:
                                                              bind: $nvaTunneledBase
                                                              over:
                                                                query: tokensInZone
                                                                zone: $space
                                                                filter:
                                                                  - { prop: faction, eq: NVA }
                                                                  - { prop: type, eq: base }
                                                              limit: 1
                                                              effects:
                                                                - setTokenProp: { token: $nvaTunneledBase, prop: tunnel, value: tunneled }
                                                        else:
                                                          - forEach:
                                                              bind: $vcUntunneledBaseTarget
                                                              over:
                                                                query: tokensInZone
                                                                zone: $space
                                                                filter:
                                                                  - { prop: faction, eq: VC }
                                                                  - { prop: type, eq: base }
                                                              limit: 1
                                                              effects:
                                                                - moveToken:
                                                                    token: $vcUntunneledBaseTarget
                                                                    from: $space
                                                                    to: { zoneExpr: 'available-VC:none' }
                                                          - macro: place-from-available-or-map
                                                            args:
                                                              pieceType: base
                                                              faction: NVA
                                                              targetSpace: $space
                                                              maxPieces: 1
      - stage: infiltrate-telemetry
        effects:
          - addVar:
              scope: global
              var: infiltrateCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: bombard-profile
    actionId: bombard
    accompanyingOps: any
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_longRangeGuns }, right: unshaded }
              then:
                - macro: bombard-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: cap_longRangeGuns }, right: shaded }
                    then:
                      - macro: bombard-select-spaces
                        args:
                          maxSpaces: 3
                    else:
                      - macro: bombard-select-spaces
                        args:
                          maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - let:
                    bind: $usTroopCount
                    value:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: $space
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: troops }
                    in:
                      - let:
                          bind: $arvnTroopCount
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, eq: troops }
                          in:
                            - if:
                                when:
                                  op: '>'
                                  left:
                                    op: '+'
                                    left: { ref: binding, name: $usTroopCount }
                                    right: { ref: binding, name: $arvnTroopCount }
                                  right: 0
                                then:
                                  - if:
                                      when:
                                        op: and
                                        args:
                                          - { op: '>', left: { ref: binding, name: $usTroopCount }, right: 0 }
                                          - { op: '>', left: { ref: binding, name: $arvnTroopCount }, right: 0 }
                                      then:
                                        - chooseOne:
                                            bind: '$bombardFaction@{$space}'
                                            options: { query: enums, values: [US, ARVN] }
                                      else:
                                        - if:
                                            when: { op: '>', left: { ref: binding, name: $usTroopCount }, right: 0 }
                                            then:
                                              - chooseOne:
                                                  bind: '$bombardFaction@{$space}'
                                                  options: { query: enums, values: [US] }
                                            else:
                                              - chooseOne:
                                                  bind: '$bombardFaction@{$space}'
                                                  options: { query: enums, values: [ARVN] }
                                  - if:
                                      when: { op: '==', left: { ref: binding, name: '$bombardFaction@{$space}' }, right: US }
                                      then:
                                        - chooseN:
                                            bind: '$bombardTroops@{$space}'
                                            options:
                                              query: tokensInZone
                                              zone: $space
                                              filter:
                                                - { prop: faction, eq: US }
                                                - { prop: type, eq: troops }
                                            min: 1
                                            max: 1
                                        - forEach:
                                            bind: $bombardTroop
                                            over: { query: binding, name: '$bombardTroops@{$space}' }
                                            effects:
                                              - moveToken:
                                                  token: $bombardTroop
                                                  from: { zoneExpr: { ref: tokenZone, token: $bombardTroop } }
                                                  to: { zoneExpr: 'casualties-US:none' }
                                      else:
                                        - chooseN:
                                            bind: '$bombardTroops@{$space}'
                                            options:
                                              query: tokensInZone
                                              zone: $space
                                              filter:
                                                - { prop: faction, eq: ARVN }
                                                - { prop: type, eq: troops }
                                            min: 1
                                            max: 1
                                        - forEach:
                                            bind: $bombardTroop
                                            over: { query: binding, name: '$bombardTroops@{$space}' }
                                            effects:
                                              - moveToken:
                                                  token: $bombardTroop
                                                  from: { zoneExpr: { ref: tokenZone, token: $bombardTroop } }
                                                  to: { zoneExpr: 'available-ARVN:none' }
      - stage: bombard-telemetry
        effects:
          - addVar:
              scope: global
              var: bombardCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: nva-ambush-profile
    actionId: ambushNva
    accompanyingOps: [march, attack]
    compoundParamConstraints:
      - relation: subset
        operationParam: targetSpaces
        specialActivityParam: targetSpaces
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_claymores }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_boobyTraps }, right: unshaded }
              then:
                - macro: insurgent-ambush-select-spaces-base
                  args:
                    faction: NVA
                    maxSpaces: 1
              else:
                - if:
                    when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
                    then:
                      - macro: insurgent-ambush-select-spaces-base
                        args:
                          faction: NVA
                          maxSpaces: 1
                    else:
                      - macro: insurgent-ambush-select-spaces-base
                        args:
                          faction: NVA
                          maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - macro: insurgent-ambush-resolve-spaces
            args:
              faction: NVA
              removalBudgetExpr: 1
      - stage: ambush-nva-telemetry
        effects:
          - addVar:
              scope: global
              var: nvaAmbushCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: tax-profile
    actionId: tax
    accompanyingOps: any
    legality: null
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
              then:
                - macro: tax-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - macro: tax-select-spaces
                  args:
                    maxSpaces: 4
      - stage: resolve-per-space
        effects:
          - forEach:
              bind: $space
              over: { query: binding, name: targetSpaces }
              effects:
                - forEach:
                    bind: $taxingGuerrilla
                    over:
                      query: tokensInZone
                      zone: $space
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                        - { prop: activity, eq: underground }
                    limit: 1
                    effects:
                      - setTokenProp: { token: $taxingGuerrilla, prop: activity, value: active }
                - if:
                    when: { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: loc }
                    then:
                      - addVar:
                          scope: global
                          var: vcResources
                          delta: { ref: zoneProp, zone: $space, prop: econ }
                    else:
                      - addVar:
                          scope: global
                          var: vcResources
                          delta:
                            op: '*'
                            left: { ref: zoneProp, zone: $space, prop: population }
                            right: 2
                      - if:
                          when: { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
                          then:
                            - shiftMarker: { space: $space, marker: supportOpposition, delta: 1 }
      - stage: tax-telemetry
        effects:
          - addVar:
              scope: global
              var: taxCount
              delta: 1
    atomicity: atomic
    linkedWindows: [vc-special-window]
  - id: subvert-profile
    actionId: subvert
    accompanyingOps: [rally, march, terror]
    legality:
      op: '>'
      left:
        aggregate:
          op: count
          query:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                - op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: $zone
                        filter:
                          - { prop: faction, eq: VC }
                          - { prop: type, eq: guerrilla }
                          - { prop: activity, eq: underground }
                  right: 0
                - op: or
                  args:
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, op: in, value: [troops, police] }
                      right: 1
                    - op: and
                      args:
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, op: in, value: [troops, police] }
                          right: 0
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: 'available-VC:none'
                                filter:
                                  - { prop: faction, eq: VC }
                                  - { prop: type, eq: guerrilla }
                          right: 0
      right: 0
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
              then:
                - macro: subvert-select-spaces
                  args:
                    maxSpaces: 1
              else:
                - macro: subvert-select-spaces
                  args:
                    maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - let:
              bind: $arvnCubesInAvailableBefore
              value:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: 'available-ARVN:none'
                    filter:
                      - { prop: faction, eq: ARVN }
                      - { prop: type, op: in, value: [troops, police] }
              in:
                - forEach:
                    bind: $space
                    over: { query: binding, name: targetSpaces }
                    effects:
                      - let:
                          bind: $arvnCubeCount
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $space
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, op: in, value: [troops, police] }
                          in:
                            - let:
                                bind: $availableVcGuerrillaCount
                                value:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: 'available-VC:none'
                                      filter:
                                        - { prop: faction, eq: VC }
                                        - { prop: type, eq: guerrilla }
                                in:
                                  - if:
                                      when:
                                        op: and
                                        args:
                                          - { op: '>', left: { ref: binding, name: $arvnCubeCount }, right: 1 }
                                          - { op: '>', left: { ref: binding, name: $availableVcGuerrillaCount }, right: 0 }
                                      then:
                                        - chooseOne:
                                            bind: '$subvertMode@{$space}'
                                            options: { query: enums, values: ['remove-2', 'replace-1'] }
                                      else:
                                        - if:
                                            when: { op: '>', left: { ref: binding, name: $arvnCubeCount }, right: 1 }
                                            then:
                                              - chooseOne:
                                                  bind: '$subvertMode@{$space}'
                                                  options: { query: enums, values: ['remove-2'] }
                                            else:
                                              - chooseOne:
                                                  bind: '$subvertMode@{$space}'
                                                  options: { query: enums, values: ['replace-1'] }
                                  - if:
                                      when: { op: '==', left: { ref: binding, name: '$subvertMode@{$space}' }, right: 'remove-2' }
                                      then:
                                        - chooseN:
                                            bind: '$subvertRemovedCubes@{$space}'
                                            options:
                                              query: tokensInZone
                                              zone: $space
                                              filter:
                                                - { prop: faction, eq: ARVN }
                                                - { prop: type, op: in, value: [troops, police] }
                                            min: 2
                                            max: 2
                                        - forEach:
                                            bind: $removedCube
                                            over: { query: binding, name: '$subvertRemovedCubes@{$space}' }
                                            effects:
                                              - moveToken:
                                                  token: $removedCube
                                                  from: { zoneExpr: { ref: tokenZone, token: $removedCube } }
                                                  to: { zoneExpr: 'available-ARVN:none' }
                                  - if:
                                      when: { op: '==', left: { ref: binding, name: '$subvertMode@{$space}' }, right: 'replace-1' }
                                      then:
                                        - chooseN:
                                            bind: '$subvertReplacedCube@{$space}'
                                            options:
                                              query: tokensInZone
                                              zone: $space
                                              filter:
                                                - { prop: faction, eq: ARVN }
                                                - { prop: type, op: in, value: [troops, police] }
                                            min: 1
                                            max: 1
                                        - forEach:
                                            bind: $replacedCube
                                            over: { query: binding, name: '$subvertReplacedCube@{$space}' }
                                            effects:
                                              - moveToken:
                                                  token: $replacedCube
                                                  from: { zoneExpr: { ref: tokenZone, token: $replacedCube } }
                                                  to: { zoneExpr: 'available-ARVN:none' }
                                        - forEach:
                                            bind: $replacementVcGuerrilla
                                            over:
                                              query: tokensInZone
                                              zone: 'available-VC:none'
                                              filter:
                                                - { prop: faction, eq: VC }
                                                - { prop: type, eq: guerrilla }
                                            limit: 1
                                            effects:
                                              - moveToken:
                                                  token: $replacementVcGuerrilla
                                                  from: { zoneExpr: 'available-VC:none' }
                                                  to: { zoneExpr: $space }
                - let:
                    bind: $arvnCubesInAvailableAfter
                    value:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: 'available-ARVN:none'
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, op: in, value: [troops, police] }
                    in:
                      - let:
                          bind: $arvnCubesAffected
                          value:
                            op: '-'
                            left: { ref: binding, name: $arvnCubesInAvailableAfter }
                            right: { ref: binding, name: $arvnCubesInAvailableBefore }
                          in:
                            - if:
                                when: { op: '>', left: { ref: binding, name: $arvnCubesAffected }, right: 0 }
                                then:
                                  - addVar:
                                      scope: global
                                      var: patronage
                                      delta:
                                        op: '*'
                                        left: -1
                                        right:
                                          op: floorDiv
                                          left: { ref: binding, name: $arvnCubesAffected }
                                          right: 2
      - stage: subvert-telemetry
        effects:
          - addVar:
              scope: global
              var: subvertCount
              delta: 1
    atomicity: atomic
    linkedWindows: [vc-special-window]
  - id: vc-ambush-profile
    actionId: ambushVc
    accompanyingOps: [march, attack]
    compoundParamConstraints:
      - relation: subset
        operationParam: targetSpaces
        specialActivityParam: targetSpaces
    legality:
      op: or
      args:
        - { op: '==', left: { ref: binding, name: __freeOperation }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_claymores }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_boobyTraps }, right: unshaded }
              then:
                - macro: insurgent-ambush-select-spaces-base
                  args:
                    faction: VC
                    maxSpaces: 1
              else:
                - if:
                    when: { op: '==', left: { ref: gvar, var: mom_typhoonKate }, right: true }
                    then:
                      - macro: insurgent-ambush-select-spaces-base
                        args:
                          faction: VC
                          maxSpaces: 1
                    else:
                      - macro: insurgent-ambush-select-spaces-base
                        args:
                          faction: VC
                          maxSpaces: 2
      - stage: resolve-per-space
        effects:
          - macro: insurgent-ambush-resolve-spaces
            args:
              faction: VC
              removalBudgetExpr:
                if:
                  when: { op: '==', left: { ref: globalMarkerState, marker: cap_mainForceBns }, right: shaded }
                  then: 2
                  else: 1
      - stage: ambush-vc-telemetry
        effects:
          - addVar:
              scope: global
              var: vcAmbushCount
              delta: 1
    atomicity: atomic
    linkedWindows: [vc-special-window]
  # ── Joint operation stub profiles ──
  - id: us-op-profile
    actionId: usOp
    legality: null
    costValidation:
        conditionMacro: us-joint-op-arvn-spend-eligible
        args:
          resourceExpr:
            ref: pvar
            player:
              id: 1
            var: resources
          costExpr: 5
    costEffects:
        - addVar:
            scope: pvar
            player:
              id: 1
            var: resources
            delta: -5
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    stages:
      - stage: us-resolve
        effects:
          - addVar:
              scope: global
              var: usOpCount
              delta: 1
    atomicity: atomic
  - id: arvn-op-profile
    actionId: arvnOp
    legality: null
    costValidation:
        op: ">="
        left:
          ref: pvar
          player: active
          var: resources
        right: 5
    costEffects:
        - addVar:
            scope: pvar
            player: active
            var: resources
            delta: -5
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    stages:
      - stage: arvn-resolve
        effects:
          - addVar:
              scope: global
              var: arvnOpCount
              delta: 1
    atomicity: atomic

# ══════════════════════════════════════════════════════════════════════════════
# Global / Per-Player Variables
# ══════════════════════════════════════════════════════════════════════════════

triggers:
  - id: on-coup-support-enter
    event:
      type: phaseEnter
      phase: coupSupport
    effects:
      - macro: coup-support-reset-trackers
  - id: on-coup-redeploy-enter
    event:
      type: phaseEnter
      phase: coupRedeploy
    effects:
      - macro: coup-laos-cambodia-removal
  - id: on-coup-reset-enter
    event:
      type: phaseEnter
      phase: coupReset
    effects:
      - macro: coup-reset-markers
  - id: mom-adsid-on-trail-change
    event:
      type: varChanged
      scope: global
      var: trail
    when:
      op: and
      args:
        - { op: '==', left: { ref: gvar, var: mom_adsid }, right: true }
        - { op: '!=', left: { ref: binding, name: $oldValue }, right: { ref: binding, name: $newValue } }
    effects:
      - addVar: { scope: global, var: nvaResources, delta: -6 }

# ══════════════════════════════════════════════════════════════════════════════
# Terminal (stub — to be replaced by real victory conditions)
# ══════════════════════════════════════════════════════════════════════════════

```

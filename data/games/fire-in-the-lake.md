# Fire in the Lake Production Game Data (Scaffold)

```yaml
metadata:
  id: fire-in-the-lake
  players:
    min: 2
    max: 4
  defaultScenarioAssetId: fitl-scenario-full

effectMacros:
  # ── rvn-leader-pacification-cost ───────────────────────────────────────────
  # Shared ARVN pacification resource cost helper.
  # Ky modifies per-step/per-terror cost from 3 to 4.
  - id: rvn-leader-pacification-cost
    params:
      - { name: stepCountExpr, type: value }
    exports: []
    effects:
      - addVar:
          scope: global
          var: arvnResources
          delta:
            op: '*'
            left: { param: stepCountExpr }
            right:
              if:
                when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: ky }
                then: -4
                else: -3

  # ── rvn-leader-failed-attempt-desertion ────────────────────────────────────
  # Deferred-use helper for cards 129-130 (Spec 29 wiring):
  # remove floor(ARVN cubes / 3) in each map space.
  - id: rvn-leader-failed-attempt-desertion
    params: []
    exports: []
    effects:
      - forEach:
          bind: $space
          over: { query: mapSpaces }
          effects:
            - let:
                bind: $arvnCubes
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
                  - forEach:
                      bind: $desertingCube
                      over:
                        query: tokensInZone
                        zone: $space
                        filter:
                          - { prop: faction, eq: ARVN }
                          - { prop: type, op: in, value: [troops, police] }
                      limit: { op: '/', left: { ref: binding, name: $arvnCubes }, right: 3 }
                      effects:
                        - moveToken:
                            token: $desertingCube
                            from: $space
                            to: { zoneExpr: 'available-ARVN:none' }

  # ── piece-removal-ordering ────────────────────────────────────────────────
  # Core removal-ordering macro shared by COIN Assault and Insurgent Attack.
  # Priority: enemy troops → active guerrillas (first-faction chosen, then other) → untunneled bases (tunneled roll ≥4 to flip).
  - id: piece-removal-ordering
    params:
      - { name: space, type: zoneSelector }
      - { name: damageExpr, type: value }
      - { name: bodyCountEligible, type: value }
    exports: [$damage, $targetFactionFirst]
    effects:
      - let:
          bind: $damage
          value: { param: damageExpr }
          in:
            - if:
                when: { op: '>', left: { ref: binding, name: $damage }, right: 0 }
                then:
                  - chooseOne:
                      bind: $targetFactionFirst
                      options: { query: enums, values: ['NVA', 'VC'] }
                  - let:
                      bind: $targetFactionSecond
                      value: { if: { when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'NVA' }, then: 'VC', else: 'NVA' } }
                      in:
                        - removeByPriority:
                            budget: { ref: binding, name: $damage }
                            groups:
                              - bind: $target
                                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: troops }, { prop: faction, op: in, value: ['NVA', 'VC'] }] }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                                countBind: $troopsRemoved
                              - bind: $target
                                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionFirst } }, { prop: activity, eq: active }] }
                                to: { zoneExpr: { concat: ['available-', { ref: binding, name: $targetFactionFirst }, ':none'] } }
                                countBind: $guerrillas1Removed
                              - bind: $target
                                over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: activity, eq: active }] }
                                to: { zoneExpr: { concat: ['available-', { ref: binding, name: $targetFactionSecond }, ':none'] } }
                                countBind: $guerrillas2Removed
                            remainingBind: $remainingDamage
                            in:
                              - let:
                                  bind: $guerrillasRemoved
                                  value:
                                    op: '+'
                                    left: { ref: binding, name: $guerrillas1Removed }
                                    right: { ref: binding, name: $guerrillas2Removed }
                                  in:
                                    - if:
                                        when:
                                          op: and
                                          args:
                                            - { op: '==', left: { param: bodyCountEligible }, right: true }
                                            - { op: '==', left: { ref: gvar, var: mom_bodyCount }, right: true }
                                        then:
                                          - addVar:
                                              scope: global
                                              var: aid
                                              delta:
                                                op: '*'
                                                left: { ref: binding, name: $guerrillasRemoved }
                                                right: 3
                              - if:
                                  when: { op: '>', left: { ref: binding, name: $remainingDamage }, right: 0 }
                                  then:
                                    - let:
                                        bind: $guerrillasRemaining
                                        value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: in, value: ['NVA', 'VC'] }, { prop: activity, eq: active }] } } }
                                        in:
                                          - if:
                                              when: { op: '==', left: { ref: binding, name: $guerrillasRemaining }, right: 0 }
                                              then:
                                                - forEach:
                                                    bind: $baseTarget
                                                    over: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] }
                                                    limit: { ref: binding, name: $remainingDamage }
                                                    effects:
                                                      - if:
                                                          when: { op: '==', left: { ref: tokenProp, token: $baseTarget, prop: tunnel }, right: 'tunneled' }
                                                          then:
                                                            - rollRandom:
                                                                bind: $dieRoll
                                                                min: 1
                                                                max: 6
                                                                in:
                                                                  - if:
                                                                      when: { op: '>=', left: { ref: binding, name: $dieRoll }, right: 4 }
                                                                      then:
                                                                        - setTokenProp: { token: $baseTarget, prop: tunnel, value: 'untunneled' }
                                                          else:
                                                            - moveToken: { token: $baseTarget, from: { param: space }, to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $baseTarget, prop: faction }, ':none'] } } }

  # ── coin-assault-removal-order ─────────────────────────────────────────────
  # Wraps piece-removal-ordering with COIN-specific behavior:
  # each insurgent Base removed adds +6 Aid.
  - id: coin-assault-removal-order
    params:
      - { name: space, type: zoneSelector }
      - { name: damageExpr, type: value }
      - { name: bodyCountEligible, type: value }
    exports: []
    effects:
      - let:
          bind: $basesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
                bodyCountEligible: { param: bodyCountEligible }
            - let:
                bind: $basesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
                in:
                  - let:
                      bind: $basesRemoved
                      value: { op: '-', left: { ref: binding, name: $basesBefore }, right: { ref: binding, name: $basesAfter } }
                      in:
                        - if:
                            when: { op: '>', left: { ref: binding, name: $basesRemoved }, right: 0 }
                            then:
                              - addVar:
                                  scope: global
                                  var: aid
                                  delta: { op: '*', left: { ref: binding, name: $basesRemoved }, right: 6 }

  # ── insurgent-attack-removal-order ─────────────────────────────────────────
  # Wraps piece-removal-ordering with Attack-specific behavior:
  # US pieces to Casualties, attacker attrition per US piece removed.
  - id: insurgent-attack-removal-order
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
      - { name: attackerFaction, type: { kind: enum, values: [NVA, VC] } }
    exports: []
    effects:
      - let:
          bind: $usPiecesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
          in:
            - removeByPriority:
                budget: { param: damageExpr }
                groups:
                  # Non-base COIN pieces are removed before any base.
                  # Deterministic order: US first, then ARVN.
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter: [{ prop: faction, eq: 'US' }, { prop: type, op: neq, value: base }]
                    to:
                      zoneExpr: 'casualties-US:none'
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: neq, value: base }]
                    to:
                      zoneExpr: 'available-ARVN:none'
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }]
                    to:
                      zoneExpr: 'casualties-US:none'
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: base }]
                    to:
                      zoneExpr: 'available-ARVN:none'
            - let:
                bind: $usPiecesAfter
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
                in:
                  - let:
                      bind: $usRemoved
                      value: { op: '-', left: { ref: binding, name: $usPiecesBefore }, right: { ref: binding, name: $usPiecesAfter } }
                      in:
                        - if:
                            when: { op: '>', left: { ref: binding, name: $usRemoved }, right: 0 }
                            then:
                              - forEach:
                                  bind: $attritionPiece
                                  over:
                                    query: tokensInZone
                                    zone: { param: space }
                                    filter: [{ prop: faction, eq: { param: attackerFaction } }]
                                  limit: { ref: binding, name: $usRemoved }
                                  effects:
                                    - moveToken:
                                        token: $attritionPiece
                                        from: { param: space }
                                        to: { zoneExpr: { concat: ['available-', { param: attackerFaction }, ':none'] } }

  # ── insurgent-ambush-remove-coin-piece ───────────────────────────────────
  # Ambush removal helper: remove exactly 1 COIN piece with bases last.
  # US removals route to Casualties; ARVN removals route to Available.
  - id: insurgent-ambush-remove-coin-piece
    params:
      - { name: targetSpace, type: zoneSelector }
      - { name: removalBudgetExpr, type: value }
    exports: []
    effects:
      - removeByPriority:
          budget: { param: removalBudgetExpr }
          groups:
            - bind: $target
              over:
                query: tokensInZone
                zone: { param: targetSpace }
                filter: [{ prop: faction, eq: 'US' }, { prop: type, op: neq, value: base }]
              to:
                zoneExpr: 'casualties-US:none'
            - bind: $target
              over:
                query: tokensInZone
                zone: { param: targetSpace }
                filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: neq, value: base }]
              to:
                zoneExpr: 'available-ARVN:none'
            - bind: $target
              over:
                query: tokensInZone
                zone: { param: targetSpace }
                filter: [{ prop: faction, eq: 'US' }, { prop: type, eq: base }]
              to:
                zoneExpr: 'casualties-US:none'
            - bind: $target
              over:
                query: tokensInZone
                zone: { param: targetSpace }
                filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, eq: base }]
              to:
                zoneExpr: 'available-ARVN:none'

  # ── insurgent-ambush-select-spaces-base ──────────────────────────────────
  # Shared ambush selector body (NVA/VC):
  # - 1-N spaces
  # - underground attacker guerrilla required
  # - either enemy in space OR LoC with adjacent enemy
  - id: insurgent-ambush-select-spaces-base
    params:
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
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
                          - { prop: faction, eq: { param: faction } }
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
                              - { prop: faction, op: in, value: [US, ARVN] }
                      right: 0
                    - op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: loc }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInAdjacentZones
                                zone: $zone
                                filter:
                                  - { prop: faction, op: in, value: [US, ARVN] }
                          right: 0
          min: 1
          max: { param: maxSpaces }

  # ── insurgent-ambush-resolve-spaces ──────────────────────────────────────
  # Shared ambush resolver (NVA/VC):
  # - activate exactly 1 underground attacker guerrilla per selected space
  # - remove exactly 1 COIN piece (bases last), with LoC-adjacent option
  # - canonical decision bindings:
  #   $ambushTargetMode@{space}, $ambushAdjacentTargets@{space}
  - id: insurgent-ambush-resolve-spaces
    exports:
      - '$ambushTargetMode@{$space}'
      - '$ambushAdjacentTargets@{$space}'
    params:
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
      - { name: removalBudgetExpr, type: value }
    effects:
      - forEach:
          bind: $space
          over: { query: binding, name: targetSpaces }
          effects:
            - forEach:
                bind: $ambushingGuerrilla
                over:
                  query: tokensInZone
                  zone: $space
                  filter:
                    - { prop: faction, eq: { param: faction } }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: underground }
                limit: 1
                effects:
                  - setTokenProp: { token: $ambushingGuerrilla, prop: activity, value: active }
            - let:
                bind: $enemyInSpace
                value:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: $space
                      filter:
                        - { prop: faction, op: in, value: [US, ARVN] }
                in:
                  - let:
                      bind: $enemyInAdjacent
                      value:
                        aggregate:
                          op: count
                          query:
                            query: tokensInAdjacentZones
                            zone: $space
                            filter:
                              - { prop: faction, op: in, value: [US, ARVN] }
                      in:
                        - if:
                            when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: loc }
                            then:
                              - if:
                                  when:
                                    op: and
                                    args:
                                      - { op: '>', left: { ref: binding, name: $enemyInSpace }, right: 0 }
                                      - { op: '>', left: { ref: binding, name: $enemyInAdjacent }, right: 0 }
                                  then:
                                    - chooseOne:
                                        bind: '$ambushTargetMode@{$space}'
                                        options: { query: enums, values: ['self', 'adjacent'] }
                                  else:
                                    - if:
                                        when: { op: '>', left: { ref: binding, name: $enemyInAdjacent }, right: 0 }
                                        then:
                                          - chooseOne:
                                              bind: '$ambushTargetMode@{$space}'
                                              options: { query: enums, values: ['adjacent'] }
                                        else:
                                          - chooseOne:
                                              bind: '$ambushTargetMode@{$space}'
                                              options: { query: enums, values: ['self'] }
                            else:
                              - chooseOne:
                                  bind: '$ambushTargetMode@{$space}'
                                  options: { query: enums, values: ['self'] }
                        - if:
                            when: { op: '==', left: { ref: binding, name: '$ambushTargetMode@{$space}' }, right: self }
                            then:
                              - macro: insurgent-ambush-remove-coin-piece
                                args:
                                  targetSpace: $space
                                  removalBudgetExpr: { param: removalBudgetExpr }
                        - if:
                            when: { op: '==', left: { ref: binding, name: '$ambushTargetMode@{$space}' }, right: adjacent }
                            then:
                              - chooseN:
                                  bind: '$ambushAdjacentTargets@{$space}'
                                  options:
                                    query: mapSpaces
                                    filter:
                                      op: and
                                      args:
                                        - op: adjacent
                                          left: $space
                                          right: $zone
                                        - op: '>'
                                          left:
                                            aggregate:
                                              op: count
                                              query:
                                                query: tokensInZone
                                                zone: $zone
                                                filter:
                                                  - { prop: faction, op: in, value: [US, ARVN] }
                                          right: 0
                                  n: 1
                              - forEach:
                                  bind: $adjacentAmbushTarget
                                  over: { query: binding, name: '$ambushAdjacentTargets@{$space}' }
                                  effects:
                                    - macro: insurgent-ambush-remove-coin-piece
                                      args:
                                        targetSpace: $adjacentAmbushTarget
                                        removalBudgetExpr: { param: removalBudgetExpr }

  # ── us-sa-remove-insurgents ────────────────────────────────────────────────
  # Shared US SA piece-removal ordering helper:
  # - troops before guerrillas before bases
  # - tunelled bases are never removed
  # - when activeGuerrillasOnly=true, underground enemy guerrillas block base removal
  - id: us-sa-remove-insurgents
    params:
      - { name: space, type: string }
      - { name: budgetExpr, type: value }
      - { name: activeGuerrillasOnly, type: value }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { param: activeGuerrillasOnly }, right: true }
          then:
            - let:
                bind: $undergroundEnemyCount
                value:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: { param: space }
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                        - { prop: activity, eq: underground }
                in:
                  - if:
                      when: { op: '>', left: { ref: binding, name: $undergroundEnemyCount }, right: 0 }
                      then:
                        - removeByPriority:
                            budget: { param: budgetExpr }
                            groups:
                              - bind: $target
                                over:
                                  query: tokensInZone
                                  zone: { param: space }
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    - { prop: type, eq: troops }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                              - bind: $target
                                over:
                                  query: tokensInZone
                                  zone: { param: space }
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    - { prop: type, eq: guerrilla }
                                    - { prop: activity, eq: active }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                      else:
                        - removeByPriority:
                            budget: { param: budgetExpr }
                            groups:
                              - bind: $target
                                over:
                                  query: tokensInZone
                                  zone: { param: space }
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    - { prop: type, eq: troops }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                              - bind: $target
                                over:
                                  query: tokensInZone
                                  zone: { param: space }
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    - { prop: type, eq: guerrilla }
                                    - { prop: activity, eq: active }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                              - bind: $target
                                over:
                                  query: tokensInZone
                                  zone: { param: space }
                                  filter:
                                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                    - { prop: type, eq: base }
                                    - { prop: tunnel, op: neq, value: tunneled }
                                to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
          else:
            - removeByPriority:
                budget: { param: budgetExpr }
                groups:
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: troops }
                    to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                    to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                  - bind: $target
                    over:
                      query: tokensInZone
                      zone: { param: space }
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: base }
                        - { prop: tunnel, op: neq, value: tunneled }
                    to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }

  # ── insurgent-attack-select-spaces ────────────────────────────────────────
  # Shared insurgent Attack map-space selector:
  # - requires attacker faction presence
  # - requires COIN (US/ARVN) presence
  # - LimOp max=1, normal max=99
  - id: insurgent-attack-select-spaces
    params:
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
    exports: [targetSpaces]
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
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { param: faction } }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
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
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { param: faction } }] } } }
                        right: 0
                      - op: '>'
                        left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
                        right: 0
                min: 1
                max: 99

  # ── insurgent-terror-select-spaces ────────────────────────────────────────
  # Shared insurgent Terror map-space selector:
  # - requires faction underground guerrilla presence
  # - optionally allows troops-only eligibility (NVA rule)
  # - LimOp max=1, normal max=99
  - id: insurgent-terror-select-spaces
    params:
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
      - { name: includeTroops, type: value }
    exports: [targetSpaces]
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
                          - op: '>'
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter: [{ prop: faction, eq: { param: faction } }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                            right: 0
                          - op: and
                            args:
                              - { op: '==', left: { param: includeTroops }, right: true }
                              - op: '>'
                                left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { param: faction } }, { prop: type, eq: troops }] } } }
                                right: 0
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
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
                          - op: '>'
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter: [{ prop: faction, eq: { param: faction } }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                            right: 0
                          - op: and
                            args:
                              - { op: '==', left: { param: includeTroops }, right: true }
                              - op: '>'
                                left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: { param: faction } }, { prop: type, eq: troops }] } } }
                                right: 0
                      - op: or
                        args:
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                min: 1
                max: 99

  # ── insurgent-terror-resolve-space ────────────────────────────────────────
  # Shared insurgent Terror space resolution:
  # - Cost: 1 per Province/City, 0 LoC
  # - Activate one underground guerrilla
  # - Place sabotage on LoC, terror on Province/City with shared cap/idempotency
  # - Support/opposition shift policy configurable by faction rule
  - id: insurgent-terror-resolve-space
    params:
      - { name: space, type: string }
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
      - { name: resourceVar, type: string }
      - { name: shiftFromSupportOnly, type: value }
    exports: []
    effects:
      - macro: per-province-city-cost
        args:
          space: { param: space }
          resource: { param: resourceVar }
          amount: -1
      - if:
          when:
            op: or
            args:
              - { op: '!=', left: { param: faction }, right: VC }
              - { op: '!=', left: { ref: globalMarkerState, marker: cap_cadres }, right: unshaded }
          then:
            - forEach:
                bind: $g
                over:
                  query: tokensInZone
                  zone: { param: space }
                  filter: [{ prop: faction, eq: { param: faction } }, { prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                limit: 1
                effects:
                  - setTokenProp: { token: $g, prop: activity, value: active }
      - if:
          when: { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: 'loc' }
          then:
            - if:
                when:
                  op: and
                  args:
                    - { op: '!=', left: { ref: markerState, space: { param: space }, marker: sabotage }, right: 'sabotage' }
                    - { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
                then:
                  - setMarker: { space: { param: space }, marker: sabotage, state: sabotage }
                  - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
          else:
            - if:
                when:
                  op: and
                  args:
                    - { op: '!=', left: { ref: markerState, space: { param: space }, marker: terror }, right: 'terror' }
                    - { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
                then:
                  - setMarker: { space: { param: space }, marker: terror, state: terror }
                  - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
            - if:
                when: { op: '==', left: { param: shiftFromSupportOnly }, right: true }
                then:
                  - if:
                      when:
                        op: or
                        args:
                          - { op: '==', left: { ref: markerState, space: { param: space }, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '==', left: { ref: markerState, space: { param: space }, marker: supportOpposition }, right: 'activeSupport' }
                      then:
                        - shiftMarker: { space: { param: space }, marker: supportOpposition, delta: -1 }
                else:
                  - if:
                      when: { op: '!=', left: { ref: markerState, space: { param: space }, marker: supportOpposition }, right: 'activeOpposition' }
                      then:
                        - shiftMarker: { space: { param: space }, marker: supportOpposition, delta: -1 }

  # ── per-province-city-cost ─────────────────────────────────────────────────
  # Faction-conditional per-space cost that charges 0 for LoCs.
  - id: per-province-city-cost
    params:
      - { name: space, type: string }
      - { name: resource, type: string }
      - { name: amount, type: number }
    exports: []
    effects:
      - if:
          when:
            op: and
            args:
              - { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
              - { op: '!=', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: 'loc' }
          then:
            - addVar: { scope: global, var: { param: resource }, delta: { param: amount } }

  # ── insurgent-march-resolve-destination ────────────────────────────────────
  # Shared insurgent March destination resolution:
  # - Cost: 1 per Province/City, 0 LoC.
  # - Optional Trail=4 Laos/Cambodia free-cost rule (NVA-only).
  # - Move insurgent guerrillas/troops from adjacent spaces.
  # - Activate moved guerrillas if (LoC or Support) and (moving + COIN pieces > 3).
  - id: insurgent-march-resolve-destination
    exports: [$movingGuerrillas, $movingTroops]
    params:
      - { name: destSpace, type: string }
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
      - { name: resourceVar, type: string }
      - { name: allowTrailCountryFreeCost, type: value }
      - { name: maxActivatedGuerrillas, type: value }
    effects:
      - chooseN:
          bind: $movingGuerrillas
          options:
            query: tokensInAdjacentZones
            zone: { param: destSpace }
            filter:
              - { prop: faction, eq: { param: faction } }
              - { prop: type, eq: guerrilla }
          min: 0
          max: 99
      - chooseN:
          bind: $movingTroops
          options:
            query: tokensInAdjacentZones
            zone: { param: destSpace }
            filter:
              - { prop: faction, eq: { param: faction } }
              - { prop: type, eq: troops }
          min: 0
          max: 99
      - let:
          bind: $movingCount
          value:
            op: '+'
            left: { aggregate: { op: count, query: { query: binding, name: $movingGuerrillas } } }
            right: { aggregate: { op: count, query: { query: binding, name: $movingTroops } } }
          in:
            - if:
                when: { op: '>', left: { ref: binding, name: $movingCount }, right: 0 }
                then:
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '==', left: { param: allowTrailCountryFreeCost }, right: true }
                          - { op: '==', left: { ref: gvar, var: trail }, right: 4 }
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: { param: destSpace }, prop: country }, right: 'laos' }
                              - { op: '==', left: { ref: zoneProp, zone: { param: destSpace }, prop: country }, right: 'cambodia' }
                      then: []
                      else:
                        - macro: per-province-city-cost
                          args:
                            space: { param: destSpace }
                            resource: { param: resourceVar }
                            amount: -1
                  - forEach:
                      bind: $piece
                      over: { query: binding, name: $movingGuerrillas }
                      effects:
                        - moveToken:
                            token: $piece
                            from: { zoneExpr: { ref: tokenZone, token: $piece } }
                            to: { param: destSpace }
                  - forEach:
                      bind: $piece
                      over: { query: binding, name: $movingTroops }
                      effects:
                        - moveToken:
                            token: $piece
                            from: { zoneExpr: { ref: tokenZone, token: $piece } }
                            to: { param: destSpace }
                  - let:
                      bind: $isLocOrSupport
                      value:
                        if:
                          when:
                            op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: { param: destSpace }, prop: spaceType }, right: 'loc' }
                              - op: or
                                args:
                                  - { op: '==', left: { ref: markerState, space: { param: destSpace }, marker: supportOpposition }, right: 'passiveSupport' }
                                  - { op: '==', left: { ref: markerState, space: { param: destSpace }, marker: supportOpposition }, right: 'activeSupport' }
                          then: true
                          else: false
                      in:
                        - let:
                            bind: $coinCount
                            value:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: { param: destSpace }
                                  filter:
                                    - { prop: faction, op: in, value: ['US', 'ARVN'] }
                                    - { prop: type, op: in, value: ['troops', 'police', 'irregular', 'ranger'] }
                            in:
                              - if:
                                  when:
                                    op: and
                                    args:
                                      - { op: '==', left: { ref: binding, name: $isLocOrSupport }, right: true }
                                      - op: '>'
                                        left:
                                          op: '+'
                                          left: { ref: binding, name: $movingCount }
                                          right: { ref: binding, name: $coinCount }
                                        right: 3
                                  then:
                                    - forEach:
                                        bind: $movedPiece
                                        over: { query: binding, name: $movingGuerrillas }
                                        limit: { param: maxActivatedGuerrillas }
                                        effects:
                                          - setTokenProp: { token: $movedPiece, prop: activity, value: active }
                                    - if:
                                        when:
                                          op: and
                                          args:
                                            - { op: '==', left: { ref: gvar, var: mom_claymores }, right: true }
                                            - op: '>'
                                              left: { aggregate: { op: count, query: { query: binding, name: $movingGuerrillas } } }
                                              right: 0
                                        then:
                                          - forEach:
                                              bind: $claymoresRemoved
                                              over: { query: binding, name: $movingGuerrillas }
                                              limit: 1
                                              effects:
                                                - moveToken:
                                                    token: $claymoresRemoved
                                                    from: { zoneExpr: { ref: tokenZone, token: $claymoresRemoved } }
                                                    to:
                                                      zoneExpr:
                                                        if:
                                                          when: { op: '==', left: { param: faction }, right: NVA }
                                                          then: 'available-NVA:none'
                                                          else: 'available-VC:none'

  # ── insurgent-march-select-destinations ────────────────────────────────────
  # Shared insurgent March destination selection:
  # - Destination space types: Province/City/LoC.
  # - Must have at least one adjacent insurgent (guerrilla or troops).
  # - LimOp-aware max selection (1 for limitedOperation, else 99).
  - id: insurgent-march-select-destinations
    params:
      - { name: faction, type: { kind: enum, values: [NVA, VC] } }
    exports: [targetSpaces]
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                      - op: '>'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInAdjacentZones
                              zone: $zone
                              filter:
                                - { prop: faction, eq: { param: faction } }
                                - { prop: type, op: in, value: ['guerrilla', 'troops'] }
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                      - op: '>'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInAdjacentZones
                              zone: $zone
                              filter:
                                - { prop: faction, eq: { param: faction } }
                                - { prop: type, op: in, value: ['guerrilla', 'troops'] }
                        right: 0
                min: 1
                max: 99

  # ── bombard-select-spaces ──────────────────────────────────────────────────
  # Shared Bombard target-space selector with capability-conditioned max spaces.
  - id: bombard-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                - op: or
                  args:
                    - op: '>='
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: [US, ARVN] }
                              - { prop: type, eq: troops }
                      right: 3
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: [US, ARVN] }
                              - { prop: type, eq: base }
                      right: 0
                - op: or
                  args:
                    - op: '>='
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: NVA }
                              - { prop: type, eq: troops }
                      right: 3
                    - op: '>='
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInAdjacentZones
                            zone: $zone
                            filter:
                              - { prop: faction, eq: NVA }
                              - { prop: type, eq: troops }
                      right: 3
          min: 1
          max: { param: maxSpaces }

  # ── advise-select-spaces ──────────────────────────────────────────────────
  - id: advise-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: mapSpaces
            filter:
              op: and
              args:
                - op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: province }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: city }
                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
          min: 1
          max: { param: maxSpaces }

  # ── govern-select-spaces-standard ─────────────────────────────────────────
  - id: govern-select-spaces-standard
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: mapSpaces
            filter:
              op: and
              args:
                - op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: province }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: city }
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
          max: { param: maxSpaces }

  # ── raid-select-spaces ────────────────────────────────────────────────────
  - id: raid-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: mapSpaces
            filter:
              op: '!='
              left: { ref: zoneProp, zone: $zone, prop: country }
              right: northVietnam
          min: 1
          max: { param: maxSpaces }

  # ── infiltrate-select-spaces ──────────────────────────────────────────────
  - id: infiltrate-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
          options:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
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
                              - { prop: faction, eq: NVA }
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
                              - { prop: faction, eq: NVA }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: VC }
          min: 1
          max: { param: maxSpaces }

  # ── tax-select-spaces ─────────────────────────────────────────────────────
  - id: tax-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
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
                          - { prop: faction, eq: VC }
                          - { prop: type, eq: guerrilla }
                          - { prop: activity, eq: underground }
                  right: 0
                - op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: loc }
                    - op: <=
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: [US, ARVN] }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: [NVA, VC] }
          min: 1
          max: { param: maxSpaces }

  # ── subvert-select-spaces ─────────────────────────────────────────────────
  - id: subvert-select-spaces
    params:
      - { name: maxSpaces, type: number }
    exports: [targetSpaces]
    effects:
      - chooseN:
          bind: targetSpaces
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
          min: 1
          max: { param: maxSpaces }

  # ── place-from-available-or-map ────────────────────────────────────────────
  # Dynamic piece sourcing (Rule 1.4.1): place from Available, then from map if not US.
  - id: place-from-available-or-map
    params:
      - { name: pieceType, type: { kind: tokenTraitValue, prop: type } }
      - { name: faction, type: { kind: enum, values: [US, ARVN, NVA, VC] } }
      - { name: targetSpace, type: string }
      - { name: maxPieces, type: value }
    exports: []
    effects:
      - forEach:
          bind: $piece
          over:
            query: tokensInZone
            zone: { concat: ['available-', { param: faction }, ':none'] }
            filter: [{ prop: type, eq: { param: pieceType } }]
          limit: { param: maxPieces }
          effects:
            - moveToken:
                token: $piece
                from: { zoneExpr: { concat: ['available-', { param: faction }, ':none'] } }
                to: { param: targetSpace }
          countBind: $placed
          in:
            - let:
                bind: $remaining
                value: { op: '-', left: { param: maxPieces }, right: { ref: binding, name: $placed } }
                in:
                  - if:
                      when:
                        op: and
                        args:
                          - { op: '!=', left: { param: faction }, right: 'US' }
                          - { op: '>', left: { ref: binding, name: $remaining }, right: 0 }
                      then:
                        - chooseN:
                            bind: $sourceSpaces
                            options:
                              query: mapSpaces
                              filter:
                                op: '>'
                                left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }] } } }
                                right: 0
                            min: 0
                            max: 99
                        - forEach:
                            bind: $srcSpace
                            over: { query: binding, name: $sourceSpaces }
                            effects:
                              - forEach:
                                  bind: $mapPiece
                                  over:
                                    query: tokensInZone
                                    zone: $srcSpace
                                    filter: [{ prop: type, eq: { param: pieceType } }, { prop: faction, eq: { param: faction } }]
                                  limit: 1
                                  effects:
                                    - moveToken:
                                        token: $mapPiece
                                        from: $srcSpace
                                        to: { param: targetSpace }

  # ── sweep-activation ───────────────────────────────────────────────────────
  # Guerrilla activation counting cubes + Special Forces, with Jungle terrain ratio.
  - id: sweep-activation
    params:
      - { name: space, type: string }
      - { name: cubeFaction, type: { kind: enum, values: [US, ARVN] } }
      - { name: sfType, type: { kind: tokenTraitValue, prop: type } }
    exports: []
    effects:
      - let:
          bind: $cubeCount
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
          in:
            - let:
                bind: $sfCount
                value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: { param: cubeFaction } }, { prop: type, eq: { param: sfType } }] } } }
                in:
                  - let:
                      bind: $totalSweepers
                      value: { op: '+', left: { ref: binding, name: $cubeCount }, right: { ref: binding, name: $sfCount } }
                      in:
                        - let:
                            bind: $activationLimit
                            value:
                              if:
                                when: { op: zonePropIncludes, zone: { param: space }, prop: terrainTags, value: 'jungle' }
                                then: { op: '/', left: { ref: binding, name: $totalSweepers }, right: 2 }
                                else: { ref: binding, name: $totalSweepers }
                            in:
                              - if:
                                  when: { op: '>', left: { ref: binding, name: $activationLimit }, right: 0 }
                                  then:
                                    - forEach:
                                        bind: $guerrilla
                                        over:
                                          query: tokensInZone
                                          zone: { param: space }
                                          filter: [{ prop: type, eq: guerrilla }, { prop: activity, eq: underground }]
                                        limit: { ref: binding, name: $activationLimit }
                                        effects:
                                          - setTokenProp: { token: $guerrilla, prop: activity, value: active }

  # ── cap-sweep-cobras-unshaded-removal ─────────────────────────────────────
  # Cobras unshaded: up to 2 selected Sweep spaces each remove 1 active/untunneled enemy.
  - id: cap-sweep-cobras-unshaded-removal
    params:
      - { name: targetSpaces, type: value }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_cobras }, right: unshaded }
          then:
            - chooseN:
                bind: $cobrasSpaces
                options: { query: binding, name: { param: targetSpaces } }
                min: 0
                max: 2
            - forEach:
                bind: $cobrasSpace
                over: { query: binding, name: $cobrasSpaces }
                effects:
                  - removeByPriority:
                      budget: 1
                      groups:
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: $cobrasSpace
                            filter: [{ prop: type, eq: troops }, { prop: faction, op: in, value: ['NVA', 'VC'] }]
                          to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: $cobrasSpace
                            filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: in, value: ['NVA', 'VC'] }, { prop: activity, eq: active }]
                          to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: $cobrasSpace
                            filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }, { prop: tunnel, eq: untunneled }]
                          to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $target, prop: faction }, ':none'] } }

  # ── cap-sweep-booby-traps-shaded-cost ─────────────────────────────────────
  # Booby Traps shaded: each selected Sweep space costs 1 troop from acting faction.
  - id: cap-sweep-booby-traps-shaded-cost
    params:
      - { name: targetSpaces, type: value }
      - { name: actorFaction, type: { kind: enum, values: [US, ARVN] } }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_boobyTraps }, right: shaded }
          then:
            - forEach:
                bind: $space
                over: { query: binding, name: { param: targetSpaces } }
                effects:
                  - forEach:
                      bind: $lossTroop
                      over:
                        query: tokensInZone
                        zone: $space
                        filter: [{ prop: faction, eq: { param: actorFaction } }, { prop: type, eq: troops }]
                      limit: 1
                      effects:
                        - if:
                            when: { op: '==', left: { param: actorFaction }, right: US }
                            then:
                              - moveToken:
                                  token: $lossTroop
                                  from: $space
                                  to: { zoneExpr: 'casualties-US:none' }
                            else:
                              - moveToken:
                                  token: $lossTroop
                                  from: $space
                                  to: { zoneExpr: 'available-ARVN:none' }

  # ── cap-assault-cobras-shaded-cost ────────────────────────────────────────
  # Cobras shaded: each Assault space, on roll 1-3, loses 1 US troop to Casualties.
  - id: cap-assault-cobras-shaded-cost
    params:
      - { name: space, type: string }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_cobras }, right: shaded }
          then:
            - rollRandom:
                bind: $cobrasDie
                min: 1
                max: 6
                in:
                  - if:
                      when: { op: '<=', left: { ref: binding, name: $cobrasDie }, right: 3 }
                      then:
                        - forEach:
                            bind: $cobrasLossTroop
                            over:
                              query: tokensInZone
                              zone: { param: space }
                              filter: [{ prop: faction, eq: US }, { prop: type, eq: troops }]
                            limit: 1
                            effects:
                              - moveToken:
                                  token: $cobrasLossTroop
                                  from: { param: space }
                                  to: { zoneExpr: 'casualties-US:none' }

  # ── cap-assault-search-and-destroy ────────────────────────────────────────
  # Search and Destroy branches: unshaded remove 1 underground guerrilla; shaded +1 opposition shift.
  - id: cap-assault-search-and-destroy
    params:
      - { name: space, type: zoneSelector }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_searchAndDestroy }, right: unshaded }
          then:
            - forEach:
                bind: $sndUnderground
                over:
                  query: tokensInZone
                  zone: { param: space }
                  filter: [{ prop: type, eq: guerrilla }, { prop: faction, op: in, value: ['NVA', 'VC'] }, { prop: activity, eq: underground }]
                limit: 1
                effects:
                  - moveToken:
                      token: $sndUnderground
                      from: { param: space }
                      to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $sndUnderground, prop: faction }, ':none'] } }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: globalMarkerState, marker: cap_searchAndDestroy }, right: shaded }
              - op: or
                args:
                  - { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: province }
                  - { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: city }
              - { op: '>', left: { ref: zoneProp, zone: { param: space }, prop: population }, right: 0 }
              - { op: '!=', left: { ref: markerState, space: { param: space }, marker: supportOpposition }, right: activeOpposition }
          then:
            - shiftMarker: { space: { param: space }, marker: supportOpposition, delta: -1 }

  # ── cap-assault-abrams-unshaded-base-first ────────────────────────────────
  # Abrams unshaded: one selected Assault space removes untunneled base first.
  - id: cap-assault-abrams-unshaded-base-first
    params:
      - { name: targetSpaces, type: value }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_abrams }, right: unshaded }
          then:
            - chooseN:
                bind: $abramsSpace
                options: { query: binding, name: { param: targetSpaces } }
                min: 0
                max: 1
            - forEach:
                bind: $abramsTargetSpace
                over: { query: binding, name: $abramsSpace }
                effects:
                  - forEach:
                      bind: $abramsBase
                      over:
                        query: tokensInZone
                        zone: $abramsTargetSpace
                        filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }, { prop: tunnel, eq: untunneled }]
                      limit: 1
                      effects:
                        - moveToken:
                            token: $abramsBase
                            from: $abramsTargetSpace
                            to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $abramsBase, prop: faction }, ':none'] } }

  # ── cap-assault-m48-unshaded-bonus-removal ───────────────────────────────
  # M48 Patton unshaded: up to 2 selected Assault spaces each remove 2 enemy.
  - id: cap-assault-m48-unshaded-bonus-removal
    params:
      - { name: targetSpaces, type: bindingName }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_m48Patton }, right: unshaded }
          then:
            - chooseN:
                bind: $m48Spaces
                options: { query: binding, name: { param: targetSpaces } }
                min: 0
                max: 2
            - forEach:
                bind: $m48Space
                over: { query: binding, name: $m48Spaces }
                effects:
                  - macro: coin-assault-removal-order
                    args:
                      space: $m48Space
                      damageExpr: 2
                      bodyCountEligible: false

  # ── cap-train-caps-unshaded-bonus-police ─────────────────────────────────
  # CAPs unshaded: each Train space places +1 ARVN Police.
  - id: cap-train-caps-unshaded-bonus-police
    params:
      - { name: space, type: zoneSelector }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_caps }, right: unshaded }
          then:
            - macro: place-from-available-or-map
              args:
                pieceType: police
                faction: 'ARVN'
                targetSpace: { param: space }
                maxPieces: 1

  # ── cap-patrol-m48-shaded-moved-cube-penalty ─────────────────────────────
  # M48 Patton shaded: on roll 1-3, remove one moved cube to Available.
  - id: cap-patrol-m48-shaded-moved-cube-penalty
    params:
      - { name: movedCubes, type: bindingName }
      - { name: loc, type: zoneSelector }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: globalMarkerState, marker: cap_m48Patton }, right: shaded }
          then:
            - rollRandom:
                bind: $m48PatrolDie
                min: 1
                max: 6
                in:
                  - if:
                      when: { op: '<=', left: { ref: binding, name: $m48PatrolDie }, right: 3 }
                      then:
                        - chooseN:
                            bind: $m48PenaltyCube
                            options: { query: binding, name: { param: movedCubes } }
                            min: 0
                            max: 1
                        - forEach:
                            bind: $m48Cube
                            over: { query: binding, name: $m48PenaltyCube }
                            effects:
                              - moveToken:
                                  token: $m48Cube
                                  from: { param: loc }
                                  to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $m48Cube, prop: faction }, ':none'] } }

dataAssets:
  - id: fitl-map-production
    kind: map
    payload:
      # FITLFULMAPANDPIEDAT-002 city ID mapping:
      # Hue -> hue:none
      # DaNang -> da-nang:none
      # Kontum -> kontum:none
      # QuiNhon -> qui-nhon:none
      # CamRanh -> cam-ranh:none
      # AnLoc -> an-loc:none
      # Saigon -> saigon:none
      # CanTho -> can-tho:none
      spaces:
        - id: hue:none
          spaceType: city
          population: 2
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: [quang-tri-thua-thien:none, loc-hue-khe-sanh:none, loc-hue-da-nang:none]
        - id: da-nang:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: [quang-nam:none, quang-tin-quang-ngai:none, loc-hue-da-nang:none, loc-da-nang-qui-nhon:none, loc-da-nang-dak-to:none]
        - id: kontum:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: [binh-dinh:none, pleiku-darlac:none, phu-bon-phu-yen:none, loc-kontum-dak-to:none, loc-kontum-ban-me-thuot:none, loc-kontum-qui-nhon:none]
        - id: qui-nhon:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: [binh-dinh:none, phu-bon-phu-yen:none, loc-da-nang-qui-nhon:none, loc-kontum-qui-nhon:none, loc-qui-nhon-cam-ranh:none]
        - id: cam-ranh:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: [khanh-hoa:none, binh-tuy-binh-thuan:none, loc-qui-nhon-cam-ranh:none, loc-saigon-cam-ranh:none, loc-cam-ranh-da-lat:none]
        - id: an-loc:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: [phuoc-long:none, tay-ninh:none, the-fishhook:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: saigon:none
          spaceType: city
          population: 6
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: [binh-tuy-binh-thuan:none, quang-duc-long-khanh:none, tay-ninh:none, kien-phong:none, kien-hoa-vinh-binh:none, loc-saigon-cam-ranh:none, loc-saigon-da-lat:none, loc-saigon-an-loc-ban-me-thuot:none, loc-saigon-can-tho:none]
        - id: can-tho:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: [kien-phong:none, kien-hoa-vinh-binh:none, ba-xuyen:none, kien-giang-an-xuyen:none, loc-saigon-can-tho:none, loc-can-tho-chau-doc:none, loc-can-tho-bac-lieu:none, loc-can-tho-long-phu:none]
      # FITLFULMAPANDPIEDAT-003 province and LoC ID mapping:
      # CentralLaos -> central-laos:none
      # SouthernLaos -> southern-laos:none
      # NortheastCambodia -> northeast-cambodia:none
      # TheFishhook -> the-fishhook:none
      # TheParrotsBeak -> the-parrots-beak:none
      # Sihanoukville -> sihanoukville:none
      # NorthVietnam -> north-vietnam:none
      # QuangTri_ThuaThien -> quang-tri-thua-thien:none
      # QuangNam -> quang-nam:none
      # QuangTin_QuangNgai -> quang-tin-quang-ngai:none
      # BinhDinh -> binh-dinh:none
      # Pleiku_Darlac -> pleiku-darlac:none
      # PhuBon_PhuYen -> phu-bon-phu-yen:none
      # KhanhHoa -> khanh-hoa:none
      # PhuocLong -> phuoc-long:none
      # QuangDuc_LongKhanh -> quang-duc-long-khanh:none
      # BinhTuy_BinhThuan -> binh-tuy-binh-thuan:none
      # TayNinh -> tay-ninh:none
      # KienPhong -> kien-phong:none
      # KienHoa_VinhBinh -> kien-hoa-vinh-binh:none
      # BaXuyen -> ba-xuyen:none
      # KienGiang_AnXuyen -> kien-giang-an-xuyen:none
      # LOC_Hue_KheSanh -> loc-hue-khe-sanh:none
      # LOC_Hue_DaNang -> loc-hue-da-nang:none
      # LOC_DaNang_DakTo -> loc-da-nang-dak-to:none
      # LOC_DaNang_QuiNhon -> loc-da-nang-qui-nhon:none
      # LOC_Kontum_DakTo -> loc-kontum-dak-to:none
      # LOC_Kontum_QuiNhon -> loc-kontum-qui-nhon:none
      # LOC_Kontum_BanMeThuot -> loc-kontum-ban-me-thuot:none
      # LOC_QuiNhon_CamRanh -> loc-qui-nhon-cam-ranh:none
      # LOC_CamRanh_DaLat -> loc-cam-ranh-da-lat:none
      # LOC_BanMeThuot_DaLat -> loc-ban-me-thuot-da-lat:none
      # LOC_Saigon_CamRanh -> loc-saigon-cam-ranh:none
      # LOC_Saigon_DaLat -> loc-saigon-da-lat:none
      # LOC_Saigon_AnLoc_BanMeThuot -> loc-saigon-an-loc-ban-me-thuot:none
      # LOC_Saigon_CanTho -> loc-saigon-can-tho:none
      # LOC_CanTho_ChauDoc -> loc-can-tho-chau-doc:none
      # LOC_CanTho_BacLieu -> loc-can-tho-bac-lieu:none
      # LOC_CanTho_LongPhu -> loc-can-tho-long-phu:none
        - id: central-laos:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: laos
          coastal: false
          adjacentTo: [north-vietnam:none, quang-tri-thua-thien:none, quang-nam:none, southern-laos:none, loc-hue-khe-sanh:none]
        - id: southern-laos:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: laos
          coastal: false
          adjacentTo: [central-laos:none, quang-nam:none, quang-tin-quang-ngai:none, binh-dinh:none, pleiku-darlac:none, northeast-cambodia:none, loc-da-nang-dak-to:none, loc-kontum-dak-to:none]
        - id: northeast-cambodia:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: [southern-laos:none, the-fishhook:none, pleiku-darlac:none]
        - id: the-fishhook:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: [an-loc:none, northeast-cambodia:none, the-parrots-beak:none, pleiku-darlac:none, quang-duc-long-khanh:none, phuoc-long:none, tay-ninh:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: the-parrots-beak:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: [the-fishhook:none, sihanoukville:none, tay-ninh:none, kien-phong:none, kien-giang-an-xuyen:none, loc-can-tho-chau-doc:none]
        - id: sihanoukville:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: true
          adjacentTo: [the-parrots-beak:none, kien-giang-an-xuyen:none]
        - id: north-vietnam:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [highland]
          country: northVietnam
          coastal: true
          adjacentTo: [central-laos:none, quang-tri-thua-thien:none, loc-hue-khe-sanh:none]
        - id: quang-tri-thua-thien:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: [hue:none, central-laos:none, north-vietnam:none, quang-nam:none, loc-hue-khe-sanh:none, loc-hue-da-nang:none]
        - id: quang-nam:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: [da-nang:none, central-laos:none, southern-laos:none, quang-tri-thua-thien:none, quang-tin-quang-ngai:none, loc-hue-da-nang:none, loc-da-nang-dak-to:none]
        - id: quang-tin-quang-ngai:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: [da-nang:none, southern-laos:none, quang-nam:none, binh-dinh:none, loc-da-nang-dak-to:none, loc-da-nang-qui-nhon:none]
        - id: binh-dinh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: [kontum:none, qui-nhon:none, southern-laos:none, quang-tin-quang-ngai:none, phu-bon-phu-yen:none, pleiku-darlac:none, loc-da-nang-dak-to:none, loc-da-nang-qui-nhon:none, loc-kontum-dak-to:none, loc-kontum-qui-nhon:none]
        - id: pleiku-darlac:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: false
          adjacentTo: [kontum:none, southern-laos:none, northeast-cambodia:none, the-fishhook:none, binh-dinh:none, phu-bon-phu-yen:none, khanh-hoa:none, quang-duc-long-khanh:none, loc-kontum-dak-to:none, loc-kontum-ban-me-thuot:none, loc-da-nang-dak-to:none, loc-ban-me-thuot-da-lat:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: phu-bon-phu-yen:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: [kontum:none, qui-nhon:none, binh-dinh:none, pleiku-darlac:none, khanh-hoa:none, loc-kontum-qui-nhon:none, loc-qui-nhon-cam-ranh:none, loc-kontum-ban-me-thuot:none]
        - id: khanh-hoa:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: [cam-ranh:none, pleiku-darlac:none, phu-bon-phu-yen:none, binh-tuy-binh-thuan:none, quang-duc-long-khanh:none, loc-qui-nhon-cam-ranh:none, loc-cam-ranh-da-lat:none, loc-ban-me-thuot-da-lat:none, loc-kontum-ban-me-thuot:none, loc-saigon-da-lat:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: phuoc-long:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: [an-loc:none, the-fishhook:none, quang-duc-long-khanh:none, tay-ninh:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: quang-duc-long-khanh:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: [saigon:none, the-fishhook:none, pleiku-darlac:none, khanh-hoa:none, phuoc-long:none, binh-tuy-binh-thuan:none, tay-ninh:none, loc-kontum-ban-me-thuot:none, loc-saigon-an-loc-ban-me-thuot:none, loc-ban-me-thuot-da-lat:none, loc-saigon-da-lat:none, loc-cam-ranh-da-lat:none]
        - id: binh-tuy-binh-thuan:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: true
          adjacentTo: [cam-ranh:none, saigon:none, khanh-hoa:none, quang-duc-long-khanh:none, loc-ban-me-thuot-da-lat:none, loc-cam-ranh-da-lat:none, loc-saigon-da-lat:none, loc-saigon-cam-ranh:none]
        - id: tay-ninh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: [an-loc:none, saigon:none, the-fishhook:none, the-parrots-beak:none, phuoc-long:none, quang-duc-long-khanh:none, kien-phong:none, loc-saigon-an-loc-ban-me-thuot:none]
        - id: kien-phong:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: false
          adjacentTo: [saigon:none, can-tho:none, the-parrots-beak:none, tay-ninh:none, kien-hoa-vinh-binh:none, kien-giang-an-xuyen:none, loc-can-tho-chau-doc:none, loc-saigon-can-tho:none]
        - id: kien-hoa-vinh-binh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: [saigon:none, can-tho:none, kien-phong:none, ba-xuyen:none, loc-saigon-can-tho:none, loc-can-tho-long-phu:none]
        - id: ba-xuyen:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: [can-tho:none, kien-hoa-vinh-binh:none, kien-giang-an-xuyen:none, loc-can-tho-bac-lieu:none, loc-can-tho-long-phu:none]
        - id: kien-giang-an-xuyen:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: [can-tho:none, the-parrots-beak:none, sihanoukville:none, kien-phong:none, ba-xuyen:none, loc-can-tho-chau-doc:none, loc-can-tho-bac-lieu:none]
        - id: loc-hue-khe-sanh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: [hue:none, central-laos:none, north-vietnam:none, quang-tri-thua-thien:none]
        - id: loc-hue-da-nang:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: [hue:none, da-nang:none, quang-tri-thua-thien:none, quang-nam:none]
        - id: loc-da-nang-dak-to:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [da-nang:none, southern-laos:none, quang-nam:none, quang-tin-quang-ngai:none, binh-dinh:none, pleiku-darlac:none, loc-kontum-dak-to:none]
        - id: loc-da-nang-qui-nhon:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: [da-nang:none, qui-nhon:none, quang-tin-quang-ngai:none, binh-dinh:none]
        - id: loc-kontum-dak-to:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [kontum:none, southern-laos:none, binh-dinh:none, pleiku-darlac:none, loc-da-nang-dak-to:none]
        - id: loc-kontum-qui-nhon:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [kontum:none, qui-nhon:none, binh-dinh:none, phu-bon-phu-yen:none]
        - id: loc-kontum-ban-me-thuot:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [kontum:none, pleiku-darlac:none, phu-bon-phu-yen:none, khanh-hoa:none, quang-duc-long-khanh:none, loc-saigon-an-loc-ban-me-thuot:none, loc-ban-me-thuot-da-lat:none]
        - id: loc-qui-nhon-cam-ranh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: [qui-nhon:none, cam-ranh:none, phu-bon-phu-yen:none, khanh-hoa:none]
        - id: loc-cam-ranh-da-lat:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [cam-ranh:none, khanh-hoa:none, binh-tuy-binh-thuan:none, quang-duc-long-khanh:none, loc-saigon-da-lat:none, loc-ban-me-thuot-da-lat:none]
        - id: loc-ban-me-thuot-da-lat:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [pleiku-darlac:none, khanh-hoa:none, quang-duc-long-khanh:none, binh-tuy-binh-thuan:none, loc-kontum-ban-me-thuot:none, loc-cam-ranh-da-lat:none, loc-saigon-an-loc-ban-me-thuot:none, loc-saigon-da-lat:none]
        - id: loc-saigon-cam-ranh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: [cam-ranh:none, saigon:none, binh-tuy-binh-thuan:none]
        - id: loc-saigon-da-lat:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [saigon:none, khanh-hoa:none, quang-duc-long-khanh:none, binh-tuy-binh-thuan:none, loc-cam-ranh-da-lat:none, loc-ban-me-thuot-da-lat:none]
        - id: loc-saigon-an-loc-ban-me-thuot:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: [an-loc:none, saigon:none, the-fishhook:none, pleiku-darlac:none, phuoc-long:none, quang-duc-long-khanh:none, tay-ninh:none, loc-kontum-ban-me-thuot:none, loc-ban-me-thuot-da-lat:none, khanh-hoa:none]
        - id: loc-saigon-can-tho:none
          spaceType: loc
          population: 0
          econ: 2
          terrainTags: [mekong]
          country: southVietnam
          coastal: false
          adjacentTo: [saigon:none, can-tho:none, kien-phong:none, kien-hoa-vinh-binh:none]
        - id: loc-can-tho-chau-doc:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [mekong]
          country: southVietnam
          coastal: false
          adjacentTo: [can-tho:none, the-parrots-beak:none, kien-phong:none, kien-giang-an-xuyen:none]
        - id: loc-can-tho-bac-lieu:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [mekong]
          country: southVietnam
          coastal: true
          adjacentTo: [can-tho:none, ba-xuyen:none, kien-giang-an-xuyen:none]
        - id: loc-can-tho-long-phu:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [mekong]
          country: southVietnam
          coastal: true
          adjacentTo: [can-tho:none, kien-hoa-vinh-binh:none, ba-xuyen:none]
      tracks:
        - id: nvaResources
          scope: faction
          faction: nva
          min: 0
          max: 75
          initial: 0
        - id: vcResources
          scope: faction
          faction: vc
          min: 0
          max: 75
          initial: 0
        - id: arvnResources
          scope: faction
          faction: arvn
          min: 0
          max: 75
          initial: 0
        - id: aid
          scope: global
          min: 0
          max: 75
          initial: 0
        - id: patronage
          scope: global
          min: 0
          max: 75
          initial: 0
        - id: trail
          scope: global
          min: 0
          max: 4
          initial: 0
        - id: totalEcon
          scope: global
          min: 0
          max: 75
          initial: 0
        - id: terrorSabotageMarkersPlaced
          scope: global
          min: 0
          max: 15
          initial: 0
      markerLattices:
        - id: supportOpposition
          states: [activeOpposition, passiveOpposition, neutral, passiveSupport, activeSupport]
          defaultState: neutral
          constraints:
            - spaceTypes: [loc]
              allowedStates: [neutral]
            - populationEquals: 0
              allowedStates: [neutral]
        - id: terror
          states: [none, terror]
          defaultState: none
          constraints:
            - spaceTypes: [loc]
              allowedStates: [none]
        - id: sabotage
          states: [none, sabotage]
          defaultState: none
          constraints:
            - spaceTypes: [city, province]
              allowedStates: [none]
  - id: fitl-piece-catalog-production
    kind: pieceCatalog
    payload:
      pieceTypes:
        - id: us-troops
          faction: us
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: US, type: troops }
          visual:
            color: olive
            shape: cube
        - id: us-bases
          faction: us
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: US, type: base }
          visual:
            color: olive
            shape: round-disk
        - id: us-irregulars
          faction: us
          statusDimensions: [activity]
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps: { faction: US, type: irregular, activity: underground }
          visual:
            color: olive
            shape: cylinder
            activeSymbol: star
        - id: arvn-troops
          faction: arvn
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: ARVN, type: troops }
          visual:
            color: yellow
            shape: cube
        - id: arvn-police
          faction: arvn
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: ARVN, type: police }
          visual:
            color: orange
            shape: cube
        - id: arvn-rangers
          faction: arvn
          statusDimensions: [activity]
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps: { faction: ARVN, type: ranger, activity: underground }
          visual:
            color: yellow
            shape: cylinder
            activeSymbol: star
        - id: arvn-bases
          faction: arvn
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: ARVN, type: base }
          visual:
            color: yellow
            shape: round-disk
        - id: nva-troops
          faction: nva
          statusDimensions: []
          transitions: []
          runtimeProps: { faction: NVA, type: troops }
          visual:
            color: red
            shape: cube
        - id: nva-guerrillas
          faction: nva
          statusDimensions: [activity]
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps: { faction: NVA, type: guerrilla, activity: underground }
          visual:
            color: red
            shape: cylinder
            activeSymbol: star
        - id: nva-bases
          faction: nva
          statusDimensions: [tunnel]
          transitions:
            - dimension: tunnel
              from: untunneled
              to: tunneled
            - dimension: tunnel
              from: tunneled
              to: untunneled
          runtimeProps: { faction: NVA, type: base, tunnel: untunneled }
          visual:
            color: red
            shape: round-disk
        - id: vc-guerrillas
          faction: vc
          statusDimensions: [activity]
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps: { faction: VC, type: guerrilla, activity: underground }
          visual:
            color: bright-blue
            shape: cylinder
            activeSymbol: star
        - id: vc-bases
          faction: vc
          statusDimensions: [tunnel]
          transitions:
            - dimension: tunnel
              from: untunneled
              to: tunneled
            - dimension: tunnel
              from: tunneled
              to: untunneled
          runtimeProps: { faction: VC, type: base, tunnel: untunneled }
          visual:
            color: bright-blue
            shape: round-disk
      inventory:
        - pieceTypeId: us-troops
          faction: us
          total: 40
        - pieceTypeId: us-bases
          faction: us
          total: 6
        - pieceTypeId: us-irregulars
          faction: us
          total: 6
        - pieceTypeId: arvn-troops
          faction: arvn
          total: 30
        - pieceTypeId: arvn-police
          faction: arvn
          total: 30
        - pieceTypeId: arvn-rangers
          faction: arvn
          total: 6
        - pieceTypeId: arvn-bases
          faction: arvn
          total: 3
        - pieceTypeId: nva-troops
          faction: nva
          total: 40
        - pieceTypeId: nva-guerrillas
          faction: nva
          total: 20
        - pieceTypeId: nva-bases
          faction: nva
          total: 9
        - pieceTypeId: vc-guerrillas
          faction: vc
          total: 30
        - pieceTypeId: vc-bases
          faction: vc
          total: 9
  - id: fitl-scenario-full
    kind: scenario
    payload:
      mapAssetId: "fitl-map-production"
      pieceCatalogAssetId: "fitl-piece-catalog-production"
      scenarioName: "Full"
      yearRange: "1964-1972"
      usPolicy: "jfk"
      startingLeader: "duong-van-minh"
      leaderStack: []
      deckComposition:
        pileCount: 6
        eventsPerPile: 12
        coupsPerPile: 1
      startingEligibility:
        - { faction: "us", eligible: true }
        - { faction: "arvn", eligible: true }
        - { faction: "nva", eligible: true }
        - { faction: "vc", eligible: true }
      initialTrackValues:
        - { trackId: "aid", value: 15 }
        - { trackId: "patronage", value: 15 }
        - { trackId: "trail", value: 1 }
        - { trackId: "totalEcon", value: 10 }
        - { trackId: "vcResources", value: 5 }
        - { trackId: "nvaResources", value: 10 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-bases", faction: "us", count: 2 }
        - { pieceTypeId: "us-troops", faction: "us", count: 10 }
        - { pieceTypeId: "arvn-bases", faction: "arvn", count: 2 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
      factionPools:
        - { faction: "us", availableZoneId: "available-US:none", outOfPlayZoneId: "out-of-play-US:none" }
        - { faction: "arvn", availableZoneId: "available-ARVN:none", outOfPlayZoneId: "out-of-play-ARVN:none" }
        - { faction: "nva", availableZoneId: "available-NVA:none" }
        - { faction: "vc", availableZoneId: "available-VC:none" }
      initialMarkers:
        # Passive Support spaces
        - { spaceId: "saigon:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "qui-nhon:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "cam-ranh:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "an-loc:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "can-tho:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "phu-bon-phu-yen:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "khanh-hoa:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "kien-hoa-vinh-binh:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "ba-xuyen:none", markerId: "supportOpposition", state: "passiveSupport" }
        # Active Opposition spaces
        - { spaceId: "quang-tin-quang-ngai:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "quang-duc-long-khanh:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "binh-tuy-binh-thuan:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "tay-ninh:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "kien-phong:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "kien-giang-an-xuyen:none", markerId: "supportOpposition", state: "activeOpposition" }
      initialPlacements:
        # Saigon: US 1 Base, 2 Troops; ARVN 2 Troops, 3 Police
        - { spaceId: "saigon:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 3 }
        # Hue: ARVN 2 Troops, 2 Police
        - { spaceId: "hue:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "hue:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Qui Nhon: ARVN 2 Troops, 2 Police
        - { spaceId: "qui-nhon:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "qui-nhon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Cam Ranh: ARVN 2 Troops, 2 Police
        - { spaceId: "cam-ranh:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "cam-ranh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # An Loc: ARVN 2 Troops, 2 Police
        - { spaceId: "an-loc:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "an-loc:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Can Tho: ARVN 2 Troops, 2 Police
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Da Nang: US 2 Troops; ARVN 1 Police
        - { spaceId: "da-nang:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "da-nang:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kontum: US 2 Troops; ARVN 1 Police
        - { spaceId: "kontum:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "kontum:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Quang Tri-Thua Thien: US 1 Irregular, 1 Troop; VC 1 Base, 2 Guerrillas
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Binh Dinh: US 1 Irregular, 1 Troop; VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Quang Nam: ARVN 1 Ranger, 1 Police
        - { spaceId: "quang-nam:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        - { spaceId: "quang-nam:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Pleiku-Darlac: US 1 Base, 1 Irregular, 1 Troop; VC 1 Base, 2 Guerrillas
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Quang Tin-Quang Ngai: VC 1 Base, 2 Guerrillas
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Quang Duc-Long Khanh: VC 1 Base, 2 Guerrillas
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Binh Tuy-Binh Thuan: VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Tay Ninh: VC 1 Tunneled Base, 2 Guerrillas
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1, status: { tunnel: "tunneled" } }
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Phu Bon-Phu Yen: ARVN 1 Police
        - { spaceId: "phu-bon-phu-yen:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Khanh Hoa: ARVN 1 Police
        - { spaceId: "khanh-hoa:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kien Hoa-Vinh Binh: ARVN 1 Police
        - { spaceId: "kien-hoa-vinh-binh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Ba Xuyen: ARVN 1 Police
        - { spaceId: "ba-xuyen:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kien Phong: VC 1 Guerrilla
        - { spaceId: "kien-phong:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Kien Giang-An Xuyen: VC 1 Guerrilla
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # North Vietnam: NVA 1 Base, 3 Guerrillas
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 3 }
        # Central Laos: NVA 1 Base, 3 Guerrillas
        - { spaceId: "central-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "central-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 3 }
        # Southern Laos: NVA 1 Base, 3 Guerrillas
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 3 }
        # The Parrot's Beak: NVA 1 Base, 3 Guerrillas
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 3 }
  - id: fitl-scenario-short
    kind: scenario
    payload:
      mapAssetId: "fitl-map-production"
      pieceCatalogAssetId: "fitl-piece-catalog-production"
      scenarioName: "Short"
      yearRange: "1965-1967"
      usPolicy: "lbj"
      startingLeader: "young-turks"
      leaderStack: ["khanh"]
      deckComposition:
        pileCount: 3
        eventsPerPile: 8
        coupsPerPile: 1
      startingCapabilities:
        - { capabilityId: "aaa", side: "shaded" }
      startingEligibility:
        - { faction: "us", eligible: true }
        - { faction: "arvn", eligible: true }
        - { faction: "nva", eligible: true }
        - { faction: "vc", eligible: true }
      initialTrackValues:
        - { trackId: "aid", value: 15 }
        - { trackId: "patronage", value: 18 }
        - { trackId: "trail", value: 2 }
        - { trackId: "totalEcon", value: 10 }
        - { trackId: "vcResources", value: 10 }
        - { trackId: "nvaResources", value: 15 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-troops", faction: "us", count: 6 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
      factionPools:
        - { faction: "us", availableZoneId: "available-US:none", outOfPlayZoneId: "out-of-play-US:none" }
        - { faction: "arvn", availableZoneId: "available-ARVN:none", outOfPlayZoneId: "out-of-play-ARVN:none" }
        - { faction: "nva", availableZoneId: "available-NVA:none" }
        - { faction: "vc", availableZoneId: "available-VC:none" }
      initialMarkers:
        # Active Support spaces
        - { spaceId: "da-nang:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "kontum:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "saigon:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "can-tho:none", markerId: "supportOpposition", state: "activeSupport" }
        # Passive Support spaces
        - { spaceId: "binh-dinh:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "an-loc:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "qui-nhon:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "cam-ranh:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "binh-tuy-binh-thuan:none", markerId: "supportOpposition", state: "passiveSupport" }
        # Active Opposition spaces
        - { spaceId: "quang-tri-thua-thien:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "quang-duc-long-khanh:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "tay-ninh:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "kien-phong:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "kien-giang-an-xuyen:none", markerId: "supportOpposition", state: "activeOpposition" }
      initialPlacements:
        # Da Nang: US 3 Troops; ARVN 1 Police
        - { spaceId: "da-nang:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "da-nang:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kontum: US 3 Troops; ARVN 1 Police
        - { spaceId: "kontum:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "kontum:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Saigon: US 1 Base, 3 Troops; ARVN 4 Troops, 2 Police, 1 Ranger
        - { spaceId: "saigon:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 4 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        # Can Tho: US 1 Base, 3 Troops; ARVN 4 Troops, 2 Police, 1 Ranger
        - { spaceId: "can-tho:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "can-tho:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 4 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        # Quang Tri: ARVN 1 Base, 2 Troops; NVA 1 Base, 4 Guerrillas
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "arvn-bases", faction: "arvn", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 4 }
        # Quang Nam: ARVN 1 Ranger, 1 Police
        - { spaceId: "quang-nam:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        - { spaceId: "quang-nam:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Quang Tin: US 2 Troops; ARVN 1 Police
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Binh Dinh: US 1 Base, 1 Irregular, 4 Troops; ARVN 2 Troops, 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-troops", faction: "us", count: 4 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Pleiku: US 1 Base, 1 Irregular, 1 Troop; VC 1 Base, 2 Guerrillas
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Khanh Hoa: US 1 Irregular, 1 Troop
        - { spaceId: "khanh-hoa:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "khanh-hoa:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        # Hue: ARVN 2 Police
        - { spaceId: "hue:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Kien Hoa-Vinh Binh: ARVN 2 Police
        - { spaceId: "kien-hoa-vinh-binh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Ba Xuyen: ARVN 2 Police
        - { spaceId: "ba-xuyen:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # An Loc: ARVN 1 Police
        - { spaceId: "an-loc:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Qui Nhon: ARVN 1 Police
        - { spaceId: "qui-nhon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Cam Ranh: ARVN 1 Police
        - { spaceId: "cam-ranh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Binh Tuy: US 2 Troops; ARVN 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Quang Duc: VC 1 Base, 2 Guerrillas; NVA 1 Guerrilla
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        # Tay Ninh: VC 1 Tunneled Base, 2 Guerrillas; NVA 1 Guerrilla
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1, status: { tunnel: "tunneled" } }
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        # Kien Phong: VC 2 Guerrillas
        - { spaceId: "kien-phong:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Kien Giang: VC 2 Guerrillas
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # North Vietnam: NVA 2 Bases, 1 Guerrilla, 6 Troops
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-bases", faction: "nva", count: 2 }
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-troops", faction: "nva", count: 6 }
        # Southern Laos: NVA 2 Bases, 1 Guerrilla, 6 Troops
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 2 }
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-troops", faction: "nva", count: 6 }
        # Central Laos: NVA 1 Base, 2 Guerrillas
        - { spaceId: "central-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "central-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # The Fishhook: NVA 1 Base, 2 Guerrillas
        - { spaceId: "the-fishhook:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "the-fishhook:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # The Parrot's Beak: NVA 1 Base, 2 Guerrillas
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
  - id: fitl-scenario-medium
    kind: scenario
    payload:
      mapAssetId: "fitl-map-production"
      pieceCatalogAssetId: "fitl-piece-catalog-production"
      scenarioName: "Medium"
      yearRange: "1968-1972"
      usPolicy: "lbj"
      startingLeader: "ky"
      leaderStack: ["khanh", "young-turks"]
      deckComposition:
        pileCount: 3
        eventsPerPile: 12
        coupsPerPile: 1
      startingCapabilities:
        - { capabilityId: "aaa", side: "shaded" }
        - { capabilityId: "main-force-bns", side: "shaded" }
        - { capabilityId: "sa-2s", side: "shaded" }
        - { capabilityId: "search-and-destroy", side: "shaded" }
        - { capabilityId: "arc-light", side: "unshaded" }
        - { capabilityId: "m-48-patton", side: "unshaded" }
      startingEligibility:
        - { faction: "us", eligible: true }
        - { faction: "arvn", eligible: true }
        - { faction: "nva", eligible: true }
        - { faction: "vc", eligible: true }
      initialTrackValues:
        - { trackId: "aid", value: 30 }
        - { trackId: "patronage", value: 15 }
        - { trackId: "trail", value: 3 }
        - { trackId: "totalEcon", value: 10 }
        - { trackId: "vcResources", value: 15 }
        - { trackId: "nvaResources", value: 20 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-troops", faction: "us", count: 5 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
      factionPools:
        - { faction: "us", availableZoneId: "available-US:none", outOfPlayZoneId: "out-of-play-US:none" }
        - { faction: "arvn", availableZoneId: "available-ARVN:none", outOfPlayZoneId: "out-of-play-ARVN:none" }
        - { faction: "nva", availableZoneId: "available-NVA:none" }
        - { faction: "vc", availableZoneId: "available-VC:none" }
      initialMarkers:
        # Active Support spaces
        - { spaceId: "binh-dinh:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "pleiku-darlac:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "khanh-hoa:none", markerId: "supportOpposition", state: "activeSupport" }
        - { spaceId: "saigon:none", markerId: "supportOpposition", state: "activeSupport" }
        # Passive Support spaces
        - { spaceId: "quang-tri-thua-thien:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "hue:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "da-nang:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "qui-nhon:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "cam-ranh:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "quang-tin-quang-ngai:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "kontum:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "phu-bon-phu-yen:none", markerId: "supportOpposition", state: "passiveSupport" }
        - { spaceId: "can-tho:none", markerId: "supportOpposition", state: "passiveSupport" }
        # Active Opposition spaces
        - { spaceId: "quang-nam:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "tay-ninh:none", markerId: "supportOpposition", state: "activeOpposition" }
        - { spaceId: "kien-giang-an-xuyen:none", markerId: "supportOpposition", state: "activeOpposition" }
        # Passive Opposition spaces
        - { spaceId: "kien-phong:none", markerId: "supportOpposition", state: "passiveOpposition" }
        - { spaceId: "kien-hoa-vinh-binh:none", markerId: "supportOpposition", state: "passiveOpposition" }
        - { spaceId: "ba-xuyen:none", markerId: "supportOpposition", state: "passiveOpposition" }
      initialPlacements:
        # Quang Tri: US 1 Base, 4 Troops, 1 Irregular; ARVN 3 Troops; NVA 1 Base, 3 Guerrillas
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "us-troops", faction: "us", count: 4 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 3 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "quang-tri-thua-thien:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 3 }
        # Quang Nam: VC 1 Base, 2 Guerrillas
        - { spaceId: "quang-nam:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "quang-nam:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Hue: US 1 Troop; ARVN 2 Police
        - { spaceId: "hue:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "hue:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Da Nang: US 1 Troop; ARVN 2 Police
        - { spaceId: "da-nang:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "da-nang:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Qui Nhon: US 1 Troop; ARVN 2 Police
        - { spaceId: "qui-nhon:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "qui-nhon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Cam Ranh: US 1 Troop; ARVN 2 Police
        - { spaceId: "cam-ranh:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "cam-ranh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Quang Tin: US 1 Base, 2 Troops; ARVN 2 Troops, 1 Police
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "quang-tin-quang-ngai:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kontum: US 1 Base, 1 Troop, 1 Irregular
        - { spaceId: "kontum:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "kontum:none", pieceTypeId: "us-troops", faction: "us", count: 1 }
        - { spaceId: "kontum:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        # Binh Dinh: US 2 Troops, 1 Irregular; ARVN 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-dinh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Pleiku: US 2 Troops, 1 Irregular; ARVN 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "pleiku-darlac:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Khanh Hoa: US 2 Troops, 1 Irregular; ARVN 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "khanh-hoa:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "khanh-hoa:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "khanh-hoa:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "khanh-hoa:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "khanh-hoa:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Phu Bon: US 3 Troops; ARVN 2 Troops, 2 Police; VC 2 Guerrillas
        - { spaceId: "phu-bon-phu-yen:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "phu-bon-phu-yen:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "phu-bon-phu-yen:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        - { spaceId: "phu-bon-phu-yen:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Binh Tuy: US 1 Base, 2 Troops; ARVN 3 Troops, 1 Police; VC 1 Base, 2 Guerrillas
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 3 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "binh-tuy-binh-thuan:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        # Saigon: US 1 Base, 2 Troops; ARVN 1 Troop, 1 Ranger, 4 Police; VC 1 Base, 1 Guerrilla
        - { spaceId: "saigon:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "us-troops", faction: "us", count: 2 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "arvn-police", faction: "arvn", count: 4 }
        - { spaceId: "saigon:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "saigon:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Quang Duc: ARVN 2 Troops, 1 Police; VC 1 Guerrilla
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "quang-duc-long-khanh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Phuoc Long: VC 1 Base, 2 Guerrillas; NVA 1 Guerrilla
        - { spaceId: "phuoc-long:none", pieceTypeId: "vc-bases", faction: "vc", count: 1 }
        - { spaceId: "phuoc-long:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 2 }
        - { spaceId: "phuoc-long:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        # Tay Ninh: US 1 Base, 3 Troops; ARVN 2 Troops, 1 Ranger; VC 1 Tunneled Base, 3 Guerrillas; NVA 2 Guerrillas
        - { spaceId: "tay-ninh:none", pieceTypeId: "us-bases", faction: "us", count: 1 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-bases", faction: "vc", count: 1, status: { tunnel: "tunneled" } }
        - { spaceId: "tay-ninh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 3 }
        - { spaceId: "tay-ninh:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # An Loc: ARVN 1 Troop, 2 Police
        - { spaceId: "an-loc:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 1 }
        - { spaceId: "an-loc:none", pieceTypeId: "arvn-police", faction: "arvn", count: 2 }
        # Can Tho: US 3 Troops, 1 Irregular; ARVN 2 Troops, 1 Police
        - { spaceId: "can-tho:none", pieceTypeId: "us-troops", faction: "us", count: 3 }
        - { spaceId: "can-tho:none", pieceTypeId: "us-irregulars", faction: "us", count: 1 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "can-tho:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        # Kien Phong: ARVN 1 Police; VC 1 Guerrilla
        - { spaceId: "kien-phong:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "kien-phong:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Kien Hoa-Vinh Binh: ARVN 1 Police; VC 1 Guerrilla
        - { spaceId: "kien-hoa-vinh-binh:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "kien-hoa-vinh-binh:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Ba Xuyen: ARVN 1 Police; VC 1 Guerrilla
        - { spaceId: "ba-xuyen:none", pieceTypeId: "arvn-police", faction: "arvn", count: 1 }
        - { spaceId: "ba-xuyen:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # Kien Giang: ARVN 1 Base, 2 Troops, 1 Ranger; VC 1 Guerrilla
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "arvn-bases", faction: "arvn", count: 1 }
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "arvn-troops", faction: "arvn", count: 2 }
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "arvn-rangers", faction: "arvn", count: 1 }
        - { spaceId: "kien-giang-an-xuyen:none", pieceTypeId: "vc-guerrillas", faction: "vc", count: 1 }
        # North Vietnam: NVA 1 Base, 1 Guerrilla, 9 Troops
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        - { spaceId: "north-vietnam:none", pieceTypeId: "nva-troops", faction: "nva", count: 9 }
        # Central Laos: NVA 1 Base, 1 Guerrilla, 9 Troops
        - { spaceId: "central-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "central-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 1 }
        - { spaceId: "central-laos:none", pieceTypeId: "nva-troops", faction: "nva", count: 9 }
        # Southern Laos: NVA 1 Base, 2 Guerrillas
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "southern-laos:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # NE Cambodia: NVA 1 Base, 2 Guerrillas
        - { spaceId: "northeast-cambodia:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "northeast-cambodia:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # The Fishhook: NVA 1 Base, 2 Guerrillas
        - { spaceId: "the-fishhook:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "the-fishhook:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # The Parrot's Beak: NVA 1 Base, 2 Guerrillas
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "the-parrots-beak:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
        # Sihanoukville: NVA 1 Base, 2 Guerrillas
        - { spaceId: "sihanoukville:none", pieceTypeId: "nva-bases", faction: "nva", count: 1 }
        - { spaceId: "sihanoukville:none", pieceTypeId: "nva-guerrillas", faction: "nva", count: 2 }
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
    discardZone: played:none
    shuffleOnSetup: true
    cards:
      - id: card-82
        title: Domino Theory
        sideMode: dual
        order: 82
        tags: []
        metadata:
          period: "1965"
          factionOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "U.S. prestige is on the line."
        unshaded:
          text: "Aid and ARVN Resources each +9. Return pieces from Out of Play."
          branches:
            - id: resources-and-aid
              order: 2
              effects:
                - addVar: { scope: global, var: arvnResources, delta: 9 }
                - addVar: { scope: global, var: aid, delta: 9 }
            - id: return-from-out-of-play
              order: 1
              targets:
                - id: us-out-of-play
                  selector:
                    query: players
                  cardinality: { max: 3 }
                - id: arvn-out-of-play
                  selector:
                    query: players
                  cardinality: { max: 6 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: usOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-US:none
                          filter:
                            - { prop: faction, eq: US }
                        to:
                          zoneExpr: available-US:none
                - removeByPriority:
                    budget: 6
                    groups:
                      - bind: arvnOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                        to:
                          zoneExpr: available-ARVN:none
                - addVar: { scope: global, var: aid, delta: 1 }
        shaded:
          text: "Containment falters: Aid -9."
          targets:
            - id: us-troops-available
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -9 }
      - id: card-68
        title: Green Berets
        sideMode: dual
        order: 68
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Elite trainers."
        unshaded:
          text: "Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support."
          branches:
            - id: place-irregulars-and-support
              order: 1
              targets:
                - id: $targetProvince
                  selector:
                    query: mapSpaces
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: irregular
                        over:
                          query: tokensInZone
                          zone: available-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: irregular }
                        to:
                          zoneExpr: $targetProvince
                - setMarker:
                    space: $targetProvince
                    marker: supportOpposition
                    state: activeSupport
            - id: place-rangers-and-support
              order: 2
              targets:
                - id: $targetProvince
                  selector:
                    query: mapSpaces
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: ranger
                        over:
                          query: tokensInZone
                          zone: available-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, eq: ranger }
                        to:
                          zoneExpr: $targetProvince
                - setMarker:
                    space: $targetProvince
                    marker: supportOpposition
                    state: activeSupport
        shaded:
          text: "Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition."
          targets:
            - id: $sourceProvince
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: $sourceProvince
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
            - setMarker:
                space: $sourceProvince
                marker: supportOpposition
                state: activeOpposition
      - id: card-1
        title: Gulf of Tonkin
        sideMode: dual
        order: 1
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Escalation trigger."
        unshaded:
          text: "US free Air Strikes, then moves 6 US pieces from out-of-play to any Cities."
          freeOperationGrants:
            - faction: "0"
              actionIds: [airStrike]
          effects:
            - forEach:
                bind: $usOutOfPlayPiece
                over:
                  query: tokensInZone
                  zone: out-of-play-US:none
                  filter:
                    - { prop: faction, eq: US }
                limit: 6
                effects:
                  - chooseOne:
                      bind: '$targetCity@{$usOutOfPlayPiece}'
                      options:
                        query: mapSpaces
                        filter:
                          op: '=='
                          left: { ref: zoneProp, zone: $zone, prop: spaceType }
                          right: 'city'
                  - moveToken:
                      token: $usOutOfPlayPiece
                      from:
                        zoneExpr: { ref: tokenZone, token: $usOutOfPlayPiece }
                      to:
                        zoneExpr: { ref: binding, name: '$targetCity@{$usOutOfPlayPiece}' }
        shaded:
          text: "Congressional regrets: Aid -1 per Casualty. All Casualties out of play."
          effects:
            - addVar:
                scope: global
                var: aid
                delta:
                  op: '*'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: casualties-US:none
                        filter:
                          - { prop: faction, eq: US }
                  right: -1
            - moveAll:
                from: casualties-US:none
                to: out-of-play-US:none
      - id: card-27
        title: Phoenix Program
        sideMode: dual
        order: 27
        tags: []
        metadata:
          period: "1968"
          factionOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Neutralization campaigns expand."
        unshaded:
          text: "Intelligence campaign: Aid -1."
          targets:
            - id: vc-in-coin-control
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -1 }
        shaded:
          text: "Repression backlash: Aid -2 and ARVN Resources -1."
          targets:
            - id: terror-spaces
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - addVar: { scope: global, var: aid, delta: -2 }
            - addVar: { scope: global, var: arvnResources, delta: -1 }
      - id: card-43
        title: Economic Aid
        sideMode: dual
        order: 43
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Free World aids Saigon."
        unshaded:
          text: "2 ARVN or 2 US Bases out-of-play to Available. Then ARVN Resources +6 or Aid +12."
          branches:
            - id: return-us-bases-and-aid
              order: 1
              targets:
                - id: us-out-of-play-bases
                  selector:
                    query: players
                  cardinality: { max: 2 }
              effects:
                - removeByPriority:
                    budget: 2
                    groups:
                      - bind: usBaseOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: base }
                        to:
                          zoneExpr: available-US:none
                - addVar: { scope: global, var: aid, delta: 12 }
            - id: return-arvn-bases-and-resources
              order: 2
              targets:
                - id: arvn-out-of-play-bases
                  selector:
                    query: players
                  cardinality: { max: 2 }
              effects:
                - removeByPriority:
                    budget: 2
                    groups:
                      - bind: arvnBaseOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, eq: base }
                        to:
                          zoneExpr: available-ARVN:none
                - addVar: { scope: global, var: arvnResources, delta: 6 }
        shaded:
          text: "Moscow aids Hanoi: Improve the Trail 1 box. Then either Improve it 1 more box or add +10 NVA Resources."
          branches:
            - id: improve-trail-twice
              order: 1
              effects:
                - addVar: { scope: global, var: trail, delta: 1 }
                - addVar: { scope: global, var: trail, delta: 1 }
            - id: improve-trail-and-add-resources
              order: 2
              effects:
                - addVar: { scope: global, var: trail, delta: 1 }
                - addVar: { scope: global, var: nvaResources, delta: 10 }
      - id: card-79
        title: Henry Cabot Lodge
        sideMode: dual
        order: 79
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "Ambassador proposes US protectorate."
        unshaded:
          text: "Aid +20."
          effects:
            - addVar: { scope: global, var: aid, delta: 20 }
        shaded:
          text: "Internecine enabler: Remove up to 3 ARVN pieces. Patronage +2 for each."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: arvnTroop
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-ARVN:none
                  - bind: arvnPolice
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: police }
                    to:
                      zoneExpr: available-ARVN:none
                  - bind: arvnRanger
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: ranger }
                    to:
                      zoneExpr: available-ARVN:none
                  - bind: arvnBase
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: available-ARVN:none
                remainingBind: $remainingRemovalBudget
            - addVar:
                scope: global
                var: patronage
                delta:
                  op: "*"
                  left: 2
                  right:
                    op: "-"
                    left: 3
                    right: { ref: binding, name: $remainingRemovalBudget }
      - id: card-107
        title: Burning Bonze
        sideMode: dual
        order: 107
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Gruesome protests close elite ranks."
        unshaded:
          text: "Patronage +3 or, if Saigon at Active Support, +6."
          effects:
            - if:
                when:
                  op: "=="
                  left: { ref: markerState, space: saigon:none, marker: supportOpposition }
                  right: activeSupport
                then:
                  - addVar: { scope: global, var: patronage, delta: 6 }
                else:
                  - addVar: { scope: global, var: patronage, delta: 3 }
        shaded:
          text: "Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12."
          effects:
            - shiftMarker:
                space: saigon:none
                marker: supportOpposition
                delta: -1
            - addVar: { scope: global, var: aid, delta: -12 }
      - id: card-112
        title: Colonel Chau
        sideMode: dual
        order: 112
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Census-grievance teams."
        unshaded:
          text: "Place 1 Police into each of 6 Provinces."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 6 }
          effects:
            - removeByPriority:
                budget: 6
                groups:
                  - bind: police
                    over:
                      query: tokensInZone
                      zone: available-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: police }
                    to:
                      zoneExpr: $targetProvince
        shaded:
          text: "Local Viet Minh tradition: Shift 3 Provinces with ARVN each 1 level toward Active Opposition. Place a VC Guerrilla in each."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 3 }
          effects:
            - shiftMarker:
                space: $targetProvince
                marker: supportOpposition
                delta: -1
            - removeByPriority:
                budget: 3
                groups:
                  - bind: guerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetProvince
      - id: card-55
        title: Trucks
        sideMode: dual
        order: 55
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Logistics under pressure."
        unshaded:
          text: "Trail degrades. Remove NVA pieces in Laos/Cambodia."
          targets:
            - id: $trailCountrySpace
              selector:
                query: mapSpaces
                filter:
                  op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
              cardinality: { max: 1 }
          effects:
            - addVar: { scope: global, var: trail, delta: -1 }
            - removeByPriority:
                budget: 3
                groups:
                  - bind: nvaTroops
                    over:
                      query: tokensInZone
                      zone: $trailCountrySpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-NVA:none
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: $trailCountrySpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-NVA:none
        shaded:
          text: "Resources +6 and reposition an NVA Base from Laos/Cambodia into South Vietnam."
          targets:
            - id: $sourceCountrySpace
              selector:
                query: mapSpaces
                filter:
                  op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
              cardinality: { max: 1 }
            - id: $destSouthSpace
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: country }
                  right: southVietnam
              cardinality: { max: 1 }
          effects:
            - addVar: { scope: global, var: nvaResources, delta: 6 }
            - forEach:
                bind: $nvaBase
                over:
                  query: tokensInZone
                  zone: $sourceCountrySpace
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: base }
                limit: 1
                effects:
                  - moveToken:
                      token: $nvaBase
                      from: { zoneExpr: $sourceCountrySpace }
                      to: { zoneExpr: $destSouthSpace }
      - id: card-97
        title: Brinks Hotel
        sideMode: dual
        order: 97
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Saigon shaken."
        unshaded:
          text: "Aid +10 or transfer Patronage to Aid. Flip RVN leader."
          branches:
            - id: aid-plus-ten-and-flip-leader
              order: 1
              effects:
                - addVar: { scope: global, var: aid, delta: 10 }
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: minh }
                    then:
                      - setGlobalMarker: { marker: activeLeader, state: khanh }
                    else:
                      - setGlobalMarker: { marker: activeLeader, state: minh }
            - id: transfer-patronage-to-aid-and-flip-leader
              order: 2
              effects:
                - let:
                    bind: $transfer
                    value:
                      if:
                        when: { op: '>', left: { ref: gvar, var: patronage }, right: 6 }
                        then: 6
                        else: { ref: gvar, var: patronage }
                    in:
                      - addVar:
                          scope: global
                          var: patronage
                          delta:
                            op: '-'
                            left: 0
                            right: { ref: binding, name: $transfer }
                      - addVar:
                          scope: global
                          var: aid
                          delta: { ref: binding, name: $transfer }
                - if:
                    when: { op: '==', left: { ref: globalMarkerState, marker: activeLeader }, right: minh }
                    then:
                      - setGlobalMarker: { marker: activeLeader, state: khanh }
                    else:
                      - setGlobalMarker: { marker: activeLeader, state: minh }
        shaded:
          text: "Shift a City 1 level toward Active Opposition and increase terror markers."
          targets:
            - id: $targetCity
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: spaceType }
                  right: city
              cardinality: { max: 1 }
          effects:
            - shiftMarker:
                space: $targetCity
                marker: supportOpposition
                delta: -1
            - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
      - id: card-75
        title: Sihanouk
        sideMode: dual
        order: 75
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "Cambodian maneuvering."
        unshaded:
          text: "ARVN free Sweep or Assault in Cambodia."
          freeOperationGrants:
            - faction: "1"
              actionIds: [sweep, assault]
              zoneFilter:
                op: '=='
                left: { ref: zoneProp, zone: $zone, prop: country }
                right: cambodia
        shaded:
          text: "VC then NVA each get a free operation."
          freeOperationGrants:
            - faction: "3"
            - faction: "2"
      - id: card-51
        title: 301st Supply Bn
        sideMode: dual
        order: 51
        tags: []
        metadata:
          period: "1964"
          factionOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Throughput under strain."
        unshaded:
          text: "Remove non-base Insurgents outside South Vietnam."
          targets:
            - id: $outsideSouthSpace
              selector:
                query: mapSpaces
                filter:
                  op: '!='
                  left: { ref: zoneProp, zone: $zone, prop: country }
                  right: southVietnam
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: nvaTroops
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-NVA:none
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-NVA:none
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-VC:none
        shaded:
          text: "Improve Trail 1 box and add NVA Resources equal to a die roll."
          effects:
            - addVar: { scope: global, var: trail, delta: 1 }
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - addVar:
                      scope: global
                      var: nvaResources
                      delta: { ref: binding, name: $dieRoll }
      - id: card-101
        title: Booby Traps
        sideMode: dual
        order: 101
        tags: [capability, VC]
        metadata:
          period: "1964"
          factionOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Preparations tip off enemy."
        unshaded:
          text: "VC and NVA Ambush in max 1 space."
          effects:
            - setGlobalMarker: { marker: cap_boobyTraps, state: unshaded }
        shaded:
          text: "Mines and punji: each Sweep space risks 1 Sweeping Troop loss on roll 1-3."
          effects:
            - setGlobalMarker: { marker: cap_boobyTraps, state: shaded }
      - id: card-17
        title: Claymores
        sideMode: dual
        order: 17
        tags: [momentum]
        metadata:
          period: "1964"
          factionOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Perimeter."
        unshaded:
          text: "Stay Eligible. Until Coup, no Ambush; remove 1 Guerrilla from each Marching group that Activates."
          eligibilityOverrides:
            - { target: { kind: active }, eligible: true, windowId: remain-eligible }
          lastingEffects:
            - id: mom-claymores
              duration: round
              setupEffects:
                - setVar: { scope: global, var: mom_claymores, value: true }
              teardownEffects:
                - setVar: { scope: global, var: mom_claymores, value: false }
        shaded:
          text: "Infiltrators turn mines around: remove 1 COIN Base and 1 Underground Insurgent from a space with both."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - op: '>'
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
                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              - { prop: type, eq: guerrilla }
                              - { prop: activity, eq: underground }
                      right: 0
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: targetCoinBase
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $targetCoinBase, prop: faction }, ':none'] }
                  - bind: targetInsurgent
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                        - { prop: activity, eq: underground }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $targetInsurgent, prop: faction }, ':none'] }

# ══════════════════════════════════════════════════════════════════════════════
# Pool Zones (piece availability pools — supplement map-derived board zones)
# ══════════════════════════════════════════════════════════════════════════════
zones:
  - { id: deck, owner: none, visibility: hidden, ordering: stack }
  - { id: available-US, owner: none, visibility: public, ordering: set }
  - { id: out-of-play-US, owner: none, visibility: public, ordering: set }
  - { id: available-ARVN, owner: none, visibility: public, ordering: set }
  - { id: out-of-play-ARVN, owner: none, visibility: public, ordering: set }
  - { id: available-NVA, owner: none, visibility: public, ordering: set }
  - { id: available-VC, owner: none, visibility: public, ordering: set }
  - { id: casualties-US, owner: none, visibility: public, ordering: set }
  - { id: leader, owner: none, visibility: public, ordering: stack }
  - { id: lookahead, owner: none, visibility: public, ordering: stack }
  - { id: played, owner: none, visibility: public, ordering: stack }

actionPipelines:
  # ── train-us-profile ──────────────────────────────────────────────────────────
  # US Train operation (Rule 3.2.1)
  # Spaces: Provinces/Cities with US pieces; LimOp: max 1 space
  # Cost: 0 for US; 3 ARVN Resources only when placing ARVN pieces
  # Resolution: Per-space choice of place Irregulars or at-Base train (Rangers / ARVN cubes)
  # Sub-action: Pacification or Saigon patronage transfer in 1 selected space
  - id: train-us-profile
    actionId: train
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
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
                          when: { op: '==', left: { ref: binding, name: $baseTrainChoice }, right: 'arvn-cubes' }
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
                      # Remove Terror marker first (if present)
                      - if:
                          when: { op: '==', left: { ref: markerState, space: $subSpace, marker: terror }, right: 'terror' }
                          then:
                            # Costs 3 ARVN Resources per Terror removed (even if free op!)
                            - macro: rvn-leader-pacification-cost
                              args:
                                stepCountExpr: 1
                            - setMarker: { space: $subSpace, marker: terror, state: none }
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
                            # Shift up to 2 levels toward Active Support
                            - chooseOne:
                                bind: $pacLevels
                                options: { query: intsInRange, min: 1, max: 2 }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '1' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
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
                            - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'city' }
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
                          when: { op: '==', left: { ref: markerState, space: $subSpace, marker: terror }, right: 'terror' }
                          then:
                            - macro: rvn-leader-pacification-cost
                              args:
                                stepCountExpr: 1
                            - setMarker: { space: $subSpace, marker: terror, state: none }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
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
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
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
                      query: tokensInAdjacentZones
                      zone: $loc
                      filter:
                        - { prop: faction, eq: 'US' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '1' }
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
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: mapSpaces
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
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
                      query: tokensInAdjacentZones
                      zone: $loc
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
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
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
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
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
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
                - chooseN:
                    bind: $hopLocs
                    options:
                      query: adjacentZones
                      zone: $space
                    min: 0
                    max: 99
                - forEach:
                    bind: $hopLoc
                    over: { query: binding, name: $hopLocs }
                    effects:
                      - if:
                          when:
                            op: and
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $hopLoc, prop: spaceType }, right: 'loc' }
                              - op: '=='
                                left:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $hopLoc
                                      filter:
                                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                                right: 0
                          then:
                            - chooseN:
                                bind: $movingHopTroops
                                options:
                                  query: tokensInAdjacentZones
                                  zone: $hopLoc
                                  filter:
                                    - { prop: faction, eq: 'US' }
                                    - { prop: type, eq: troops }
                                min: 0
                                max: 99
                            - forEach:
                                bind: $hopTroop
                                over: { query: binding, name: $movingHopTroops }
                                effects:
                                  - moveToken:
                                      token: $hopTroop
                                      from: { zoneExpr: { ref: tokenZone, token: $hopTroop } }
                                      to: $space

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
    applicability: { op: '==', left: { ref: activePlayer }, right: '1' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
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
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
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
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                                - { op: '!=', left: { ref: zoneProp, zone: $zone, prop: country }, right: 'northVietnam' }
                          min: 1
                          max: 99

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
                    bind: $movingTroops
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
                    over: { query: binding, name: $movingTroops }
                    effects:
                      - moveToken:
                          token: $troop
                          from: { zoneExpr: { ref: tokenZone, token: $troop } }
                          to: $space
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '0' }
    legality: { op: '!=', left: { ref: gvar, var: mom_generalLansdale }, right: true }
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
                  - { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '1' }
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
                                  left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'ARVN' }, { prop: type, op: in, value: ['troops', 'police'] }] } } }
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
                        when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: 'province' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '2' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'activeSupport' }
                    min: 0
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'activeSupport' }
                    min: 0
                    max: 99
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '3' }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'activeSupport' }
                    min: 0
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'passiveSupport' }
                          - { op: '!=', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: 'activeSupport' }
                    min: 0
                    max: 99
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
                                  - { op: '==', left: { ref: zoneProp, zone: $cadresSpace, prop: spaceType }, right: city }
                                  - { op: '==', left: { ref: zoneProp, zone: $cadresSpace, prop: spaceType }, right: province }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '2' }
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
                    bind: $chainSpace
                    over: { query: binding, name: chainSpaces }
                    effects:
                      - macro: insurgent-march-resolve-destination
                        args:
                          destSpace: $chainSpace
                          faction: 'NVA'
                          resourceVar: nvaResources
                          allowTrailCountryFreeCost: true
                          maxActivatedGuerrillas: 99
    atomicity: atomic
  - id: march-vc-profile
    actionId: march
    applicability: { op: '==', left: { ref: activePlayer }, right: '3' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '2' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '3' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '2' }
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
    applicability: { op: '==', left: { ref: activePlayer }, right: '3' }
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
                - macro: advise-select-spaces
                  args:
                    maxSpaces: 1
              else:
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
                              when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: province }
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
                              - { prop: faction, op: in, value: [US, ARVN] }
                              - { prop: type, eq: guerrilla }
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
      op: and
      args:
        - { op: '!=', left: { ref: gvar, var: mom_medevacShaded }, right: true }
        - { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-spaces
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
                - chooseN:
                    bind: spaces
                    options:
                      query: mapSpaces
                      filter:
                        op: '!='
                        left: { ref: zoneProp, zone: $zone, prop: country }
                        right: northVietnam
                    min: 1
                    max: 1
              else:
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
      - stage: select-destination
        effects:
          - chooseOne:
              bind: $airLiftDestination
              options: { query: binding, name: spaces }
      - stage: move-us-troops
        effects:
          - forEach:
              bind: $origin
              over: { query: binding, name: spaces }
              effects:
                - forEach:
                    bind: $usTroop
                    over:
                      query: tokensInZone
                      zone: $origin
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    effects:
                      - if:
                          when: { op: '!=', left: { ref: tokenZone, token: $usTroop }, right: { ref: binding, name: $airLiftDestination } }
                          then:
                            - moveToken:
                                token: $usTroop
                                from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                                to: { zoneExpr: { ref: binding, name: $airLiftDestination } }
      - stage: move-coin-lift-pieces
        effects:
          - setVar: { scope: global, var: airLiftRemaining, value: 4 }
          - forEach:
              bind: $origin
              over: { query: binding, name: spaces }
              effects:
                - if:
                    when: { op: '>', left: { ref: gvar, var: airLiftRemaining }, right: 0 }
                    then:
                      - let:
                          bind: $arvnBefore
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $origin
                                filter:
                                  - { prop: faction, eq: ARVN }
                                  - { prop: type, op: in, value: [troops, guerrilla] }
                          in:
                            - forEach:
                                bind: $liftPiece
                                over:
                                  query: tokensInZone
                                  zone: $origin
                                  filter:
                                    - { prop: faction, eq: ARVN }
                                    - { prop: type, op: in, value: [troops, guerrilla] }
                                limit: { ref: gvar, var: airLiftRemaining }
                                effects:
                                  - if:
                                      when: { op: '!=', left: { ref: tokenZone, token: $liftPiece }, right: { ref: binding, name: $airLiftDestination } }
                                      then:
                                        - moveToken:
                                            token: $liftPiece
                                            from: { zoneExpr: { ref: tokenZone, token: $liftPiece } }
                                            to: { zoneExpr: { ref: binding, name: $airLiftDestination } }
                            - let:
                                bind: $arvnAfter
                                value:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $origin
                                      filter:
                                        - { prop: faction, eq: ARVN }
                                        - { prop: type, op: in, value: [troops, guerrilla] }
                                in:
                                  - addVar:
                                      scope: global
                                      var: airLiftRemaining
                                      delta:
                                        op: "-"
                                        left: { ref: binding, name: $arvnAfter }
                                        right: { ref: binding, name: $arvnBefore }
                - if:
                    when: { op: '>', left: { ref: gvar, var: airLiftRemaining }, right: 0 }
                    then:
                      - let:
                          bind: $irregularBefore
                          value:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $origin
                                filter:
                                  - { prop: faction, eq: US }
                                  - { prop: type, eq: guerrilla }
                          in:
                            - forEach:
                                bind: $liftIrregular
                                over:
                                  query: tokensInZone
                                  zone: $origin
                                  filter:
                                    - { prop: faction, eq: US }
                                    - { prop: type, eq: guerrilla }
                                limit: { ref: gvar, var: airLiftRemaining }
                                effects:
                                  - if:
                                      when: { op: '!=', left: { ref: tokenZone, token: $liftIrregular }, right: { ref: binding, name: $airLiftDestination } }
                                      then:
                                        - moveToken:
                                            token: $liftIrregular
                                            from: { zoneExpr: { ref: tokenZone, token: $liftIrregular } }
                                            to: { zoneExpr: { ref: binding, name: $airLiftDestination } }
                            - let:
                                bind: $irregularAfter
                                value:
                                  aggregate:
                                    op: count
                                    query:
                                      query: tokensInZone
                                      zone: $origin
                                      filter:
                                        - { prop: faction, eq: US }
                                        - { prop: type, eq: guerrilla }
                                in:
                                  - addVar:
                                      scope: global
                                      var: airLiftRemaining
                                      delta:
                                        op: "-"
                                        left: { ref: binding, name: $irregularAfter }
                                        right: { ref: binding, name: $irregularBefore }
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
      op: and
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
                      - op: '>'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: lookahead:none
                              filter:
                                - { prop: isCoup, eq: true }
                        right: 0
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
                                                    - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: province }
                                                    - { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: city }
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
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: province }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: city }
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
    legality: { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
    costValidation: null
    costEffects: []
    targeting: {}
    stages:
      - stage: select-origin
        effects:
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }
              then:
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
                                    - { prop: type, op: in, value: [troops, guerrilla] }
                            right: 0
              else:
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
                                    - { prop: type, eq: troops }
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
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: loc }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: city }
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
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: loc }
                                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: city }
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
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }
              then:
                - forEach:
                    bind: $piece
                    over:
                      query: tokensInZone
                      zone: $transportOrigin
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, op: in, value: [troops, guerrilla] }
                    limit: 6
                    effects:
                      - if:
                          when: { op: '!=', left: { ref: tokenZone, token: $piece }, right: { ref: binding, name: $transportDestination } }
                          then:
                            - moveToken:
                                token: $piece
                                from: { zoneExpr: { ref: tokenZone, token: $piece } }
                                to: { zoneExpr: { ref: binding, name: $transportDestination } }
              else:
                - forEach:
                    bind: $piece
                    over:
                      query: tokensInZone
                      zone: $transportOrigin
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: troops }
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
          - if:
              when: { op: '==', left: { ref: globalMarkerState, marker: cap_armoredCavalry }, right: shaded }
              then:
                - forEach:
                    bind: $ranger
                    over:
                      query: tokensInZone
                      zone: $transportDestination
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: guerrilla }
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
                              - { prop: type, eq: guerrilla }
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
                                  - { prop: type, eq: guerrilla }
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
                              - { prop: type, eq: guerrilla }
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
    legality: { op: '!=', left: { ref: gvar, var: mom_mcnamaraLine }, right: true }
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
    legality: { op: '!=', left: { ref: gvar, var: mom_typhoonKate }, right: true }
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
                - removeByPriority:
                    budget: 1
                    groups:
                      - bind: $usTroop
                        over:
                          query: tokensInZone
                          zone: $space
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: troops }
                        to:
                          zoneExpr: 'casualties-US:none'
                      - bind: $arvnTroop
                        over:
                          query: tokensInZone
                          zone: $space
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, eq: troops }
                        to:
                          zoneExpr: 'available-ARVN:none'
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
    legality: { op: '!=', left: { ref: gvar, var: mom_claymores }, right: true }
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
                    when: { op: '==', left: { ref: zoneProp, zone: $space, prop: spaceType }, right: loc }
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
                          when:
                            op: and
                            args:
                              - { op: '>', left: { ref: zoneProp, zone: $space, prop: population }, right: 0 }
                              - { op: '!=', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
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
                      - forEach:
                          bind: $subvertingGuerrilla
                          over:
                            query: tokensInZone
                            zone: $space
                            filter:
                              - { prop: faction, eq: VC }
                              - { prop: type, eq: guerrilla }
                              - { prop: activity, eq: underground }
                          limit: 1
                          effects:
                            - setTokenProp: { token: $subvertingGuerrilla, prop: activity, value: active }
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
    legality: { op: '!=', left: { ref: gvar, var: mom_claymores }, right: true }
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
        op: ">="
        left:
          op: "-"
          left:
            ref: pvar
            player:
              id: 1
            var: resources
          right: 5
        right:
          ref: gvar
          var: totalEcon
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
globalMarkerLattices:
  - id: cap_topGun
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_arcLight
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_abrams
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_cobras
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_m48Patton
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_caps
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_cords
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_lgbs
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_searchAndDestroy
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_aaa
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_longRangeGuns
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_migs
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_sa2s
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_pt76
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_armoredCavalry
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_mandateOfHeaven
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_boobyTraps
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_mainForceBns
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: cap_cadres
    states: [inactive, unshaded, shaded]
    defaultState: inactive
  - id: activeLeader
    states: [minh, khanh, youngTurks, ky, thieu]
    defaultState: minh

globalVars:
  # ── Stub vars for COIN operation testing ──
  - { name: coinResources, type: int, init: 10, min: 0, max: 50 }
  - { name: trainCount, type: int, init: 0, min: 0, max: 20 }
  - { name: patrolCount, type: int, init: 0, min: 0, max: 20 }
  - { name: sweepCount, type: int, init: 0, min: 0, max: 20 }
  - { name: assaultCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for insurgent operation testing ──
  - { name: rallyCount, type: int, init: 0, min: 0, max: 20 }
  - { name: marchCount, type: int, init: 0, min: 0, max: 20 }
  - { name: attackCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for US/ARVN special-activity testing ──
  - { name: usResources, type: int, init: 7, min: 0, max: 50 }
  - { name: adviseCount, type: int, init: 0, min: 0, max: 20 }
  - { name: airLiftCount, type: int, init: 0, min: 0, max: 20 }
  - { name: airStrikeCount, type: int, init: 0, min: 0, max: 20 }
  - { name: airLiftRemaining, type: int, init: 0, min: 0, max: 6 }
  - { name: airStrikeRemaining, type: int, init: 0, min: 0, max: 6 }
  - { name: governCount, type: int, init: 0, min: 0, max: 20 }
  - { name: transportCount, type: int, init: 0, min: 0, max: 20 }
  - { name: raidCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for NVA/VC special-activity testing ──
  - { name: infiltrateCount, type: int, init: 0, min: 0, max: 20 }
  - { name: bombardCount, type: int, init: 0, min: 0, max: 20 }
  - { name: nvaAmbushCount, type: int, init: 0, min: 0, max: 20 }
  - { name: taxCount, type: int, init: 0, min: 0, max: 20 }
  - { name: subvertCount, type: int, init: 0, min: 0, max: 20 }
  - { name: vcAmbushCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for joint-operation testing ──
  - { name: usOpCount, type: int, init: 0, min: 0, max: 50 }
  - { name: arvnOpCount, type: int, init: 0, min: 0, max: 50 }
  # ── Momentum markers (boolean globals) ──
  - { name: mom_wildWeasels, type: boolean, init: false }
  - { name: mom_adsid, type: boolean, init: false }
  - { name: mom_rollingThunder, type: boolean, init: false }
  - { name: mom_medevacUnshaded, type: boolean, init: false }
  - { name: mom_medevacShaded, type: boolean, init: false }
  - { name: mom_blowtorchKomer, type: boolean, init: false }
  - { name: mom_claymores, type: boolean, init: false }
  - { name: mom_daNang, type: boolean, init: false }
  - { name: mom_mcnamaraLine, type: boolean, init: false }
  - { name: mom_oriskany, type: boolean, init: false }
  - { name: mom_bombingPause, type: boolean, init: false }
  - { name: mom_559thTransportGrp, type: boolean, init: false }
  - { name: mom_bodyCount, type: boolean, init: false }
  - { name: mom_generalLansdale, type: boolean, init: false }
  - { name: mom_typhoonKate, type: boolean, init: false }
  - { name: leaderBoxCardCount, type: int, init: 0, min: 0, max: 8 }

perPlayerVars:
  - { name: resources, type: int, init: 20, min: 0, max: 50 }

# ══════════════════════════════════════════════════════════════════════════════
# Turn Structure (stub — to be replaced by real COIN-series turn flow)
# ══════════════════════════════════════════════════════════════════════════════
turnStructure:
  phases:
    - id: main

turnOrder:
  type: cardDriven
  config:
    turnFlow:
      cardLifecycle:
        played: played:none
        lookahead: lookahead:none
        leader: leader:none
      eligibility:
        factions: ['0', '1', '2', '3']
        overrideWindows:
          - id: remain-eligible
            duration: nextTurn
          - id: us-special-window
            duration: turn
          - id: arvn-special-window
            duration: turn
          - id: nva-special-window
            duration: turn
          - id: vc-special-window
            duration: turn
      optionMatrix: []
      passRewards: []
      freeOperationActionIds: [train, patrol, sweep, assault, rally, march, attack, terror]
      durationWindows: [turn, nextTurn, round, cycle]
      monsoon:
        restrictedActions: []
  
# ══════════════════════════════════════════════════════════════════════════════
# Actions (profile-backed actions keep empty fallback effects)
# ══════════════════════════════════════════════════════════════════════════════
actions:
  - { id: pass, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: train, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: patrol, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: sweep, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: assault, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: rally, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: march, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: attack, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: terror, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: advise, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: airLift, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: airStrike, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: govern, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: transport, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: raid, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: infiltrate, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: bombard, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: ambushNva, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: tax, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: subvert, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: ambushVc, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: usOp, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }
  - { id: arvnOp, actor: active, phase: main, params: [], pre: null, cost: [], effects: [], limits: [] }

# ══════════════════════════════════════════════════════════════════════════════
# Triggers
# ══════════════════════════════════════════════════════════════════════════════
triggers:
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
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 2 }
      result: { type: draw }
```

# Fire in the Lake - Macros

```yaml
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

  # ── set-global-marker ──────────────────────────────────────────────────────
  # Shared marker toggle helper for capability/event marker state transitions.
  - id: set-global-marker
    params:
      - { name: markerId, type: string }
      - { name: markerState, type: { kind: enum, values: [inactive, unshaded, shaded] } }
    exports: []
    effects:
      - setGlobalMarker:
          marker: { param: markerId }
          state: { param: markerState }

  # ── set-global-flag-true ───────────────────────────────────────────────────
  # Shared helper to enable a boolean global flag.
  - id: set-global-flag-true
    params:
      - { name: varName, type: string }
    exports: []
    effects:
      - setVar:
          scope: global
          var: { param: varName }
          value: true

  # ── set-global-flag-false ──────────────────────────────────────────────────
  # Shared helper to disable a boolean global flag.
  - id: set-global-flag-false
    params:
      - { name: varName, type: string }
    exports: []
    effects:
      - setVar:
          scope: global
          var: { param: varName }
          value: false

  # ── add-global-var-delta ──────────────────────────────────────────────────
  # Generic helper for global track/resource delta updates.
  - id: add-global-var-delta
    params:
      - { name: varName, type: string }
      - { name: deltaExpr, type: value }
    exports: []
    effects:
      - addVar:
          scope: global
          var: { param: varName }
          delta: { param: deltaExpr }

  # ── shift-support-opposition ──────────────────────────────────────────────
  # Shared support/opposition shift helper for event cards.
  - id: shift-support-opposition
    params:
      - { name: space, type: zoneSelector }
      - { name: deltaExpr, type: value }
    exports: []
    effects:
      - shiftMarker:
          space: { param: space }
          marker: supportOpposition
          delta: { param: deltaExpr }

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
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
                      right: 0
                    - op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInAdjacentZones
                                zone: $zone
                                filter:
                                  - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
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
                        - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
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
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
                      in:
                        - if:
                            when: { op: '==', left: { ref: zoneProp, zone: $space, prop: category }, right: loc }
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
                                                  - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
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
          when: { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: category }, right: 'loc' }
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
              - { op: '!=', left: { ref: zoneProp, zone: { param: space }, prop: category }, right: 'loc' }
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
                              - { op: '==', left: { ref: zoneProp, zone: { param: destSpace }, prop: category }, right: 'loc' }
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
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
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
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
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
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
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
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
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                    - op: <=
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: { ref: namedSet, name: COIN } }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: { ref: namedSet, name: Insurgent } }
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
            zone: { zoneExpr: { concat: ['available-', { param: faction }, ':none'] } }
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
                          - op: or
                            args:
                              - { op: '!=', left: { param: faction }, right: 'US' }
                              - { op: '==', left: { param: pieceType }, right: irregular }
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
                  - { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: category }, right: province }
                  - { op: '==', left: { ref: zoneProp, zone: { param: space }, prop: category }, right: city }
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

  # ── coup-auto-sabotage ────────────────────────────────────────────────────
  # Rule 6.2.1: place sabotage on eligible unSabotaged LoCs up to marker cap.
  - id: coup-auto-sabotage
    params: []
    exports: []
    effects:
      - forEach:
          bind: $loc
          over:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                - { op: '!=', left: { ref: markerState, space: $zone, marker: sabotage }, right: sabotage }
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
                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              - { prop: type, eq: guerrilla }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: ['US', 'ARVN'] }
                    - op: '>'
                      left:
                        aggregate:
                          op: sum
                          query: { query: adjacentZones, zone: $zone }
                          bind: $adj
                          valueExpr:
                            if:
                              when:
                                op: and
                                args:
                                  - { op: '==', left: { ref: zoneProp, zone: $adj, prop: category }, right: city }
                                  - op: '<='
                                    left:
                                      aggregate:
                                        op: count
                                        query:
                                          query: tokensInZone
                                          zone: $adj
                                          filter:
                                            - { prop: faction, op: in, value: ['US', 'ARVN'] }
                                    right:
                                      aggregate:
                                        op: count
                                        query:
                                          query: tokensInZone
                                          zone: $adj
                                          filter:
                                            - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              then: 1
                              else: 0
                      right: 0
          effects:
            - if:
                when: { op: '<', left: { ref: gvar, var: terrorSabotageMarkersPlaced }, right: 15 }
                then:
                  - setMarker: { space: $loc, marker: sabotage, state: sabotage }
                  - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }

  # ── coup-trail-degradation ────────────────────────────────────────────────
  # Rule 6.2.2: if any Laos/Cambodia space is COIN-controlled, degrade trail.
  - id: coup-trail-degradation
    params: []
    exports: []
    effects:
      - if:
          when:
            op: '>'
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
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                          - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
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
            right: 0
          then:
            - addVar: { scope: global, var: trail, delta: -1 }

  # ── coup-arvn-earnings ────────────────────────────────────────────────────
  # Rule 6.2.3: compute unSabotaged LoC econ, update totalEcon, credit ARVN.
  - id: coup-arvn-earnings
    params: []
    exports: []
    effects:
      - setVar: { scope: global, var: totalEcon, value: 15 }
      - forEach:
          bind: $sabotagedLoc
          over:
            query: mapSpaces
            filter:
              op: and
              args:
                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: loc }
                - { op: '==', left: { ref: markerState, space: $zone, marker: sabotage }, right: sabotage }
          effects:
            - addVar:
                scope: global
                var: totalEcon
                delta:
                  op: '-'
                  left: 0
                  right: { ref: zoneProp, zone: $sabotagedLoc, prop: econ }
      - addVar:
          scope: global
          var: arvnResources
          delta:
            op: '+'
            left: { ref: gvar, var: aid }
            right: { ref: gvar, var: totalEcon }

  # ── coup-insurgent-earnings ───────────────────────────────────────────────
  # Rule 6.2.4: VC base income + NVA Laos/Cambodia base income and trail bonus.
  - id: coup-insurgent-earnings
    params: []
    exports: []
    effects:
      - addVar:
          scope: global
          var: vcResources
          delta:
            aggregate:
              op: count
              query:
                query: tokensInMapSpaces
                filter:
                  - { prop: faction, eq: VC }
                  - { prop: type, eq: base }
      - addVar:
          scope: global
          var: nvaResources
          delta:
            op: '+'
            left:
              aggregate:
                op: count
                query:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: base }
            right:
              op: '*'
              left: 2
              right: { ref: gvar, var: trail }

  # ── coup-casualties-aid ───────────────────────────────────────────────────
  # Rule 6.2.5: reduce aid by 3 per US casualty piece.
  - id: coup-casualties-aid
    params: []
    exports: []
    effects:
      - addVar:
          scope: global
          var: aid
          delta:
            op: '-'
            left: 0
            right:
              op: '*'
              left: 3
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: casualties-US:none

  # ── coup-support-reset-trackers ───────────────────────────────────────────
  # Rule 6.3 temporary per-space tracking resets on support phase entry.
  - id: coup-support-reset-trackers
    params: []
    exports: []
    effects:
      - forEach:
          bind: $space
          over: { query: mapSpaces }
          effects:
            - setMarker: { space: $space, marker: coupPacifySpaceUsage, state: open }
            - setMarker: { space: $space, marker: coupAgitateSpaceUsage, state: open }
            - setMarker: { space: $space, marker: coupSupportShiftCount, state: zero }

  # ── coup-support-mark-space-used ──────────────────────────────────────────
  # Marks a support-phase space usage marker as used if not already used.
  - id: coup-support-mark-space-used
    params:
      - { name: space, type: zoneSelector }
      - { name: markerId, type: string }
    exports: []
    effects:
      - if:
          when: { op: '!=', left: { ref: markerState, space: { param: space }, marker: { param: markerId } }, right: used }
          then:
            - setMarker: { space: { param: space }, marker: { param: markerId }, state: used }

  # ── coup-support-increment-shift-count ────────────────────────────────────
  # Increments per-space shift count from zero -> one -> two.
  - id: coup-support-increment-shift-count
    params:
      - { name: space, type: zoneSelector }
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: markerState, space: { param: space }, marker: coupSupportShiftCount }, right: zero }
          then:
            - setMarker: { space: { param: space }, marker: coupSupportShiftCount, state: one }
          else:
            - if:
                when: { op: '==', left: { ref: markerState, space: { param: space }, marker: coupSupportShiftCount }, right: one }
                then:
                  - setMarker: { space: { param: space }, marker: coupSupportShiftCount, state: two }

conditionMacros:
  # Shared Rule 1.8.1 predicate:
  # US may spend ARVN Resources only if post-spend resource does not drop below totalEcon.
  - id: us-joint-op-arvn-spend-eligible
    params:
      - { name: resourceExpr, type: value }
      - { name: costExpr, type: value }
    condition:
      op: '>='
      left: { param: resourceExpr }
      right:
        op: '+'
        left: { ref: gvar, var: totalEcon }
        right: { param: costExpr }

```

# Fire in the Lake Production Game Data (Scaffold)

```yaml
metadata:
  id: fire-in-the-lake
  players:
    min: 2
    max: 4

effectMacros:
  # ── piece-removal-ordering ────────────────────────────────────────────────
  # Core removal-ordering macro shared by COIN Assault and Insurgent Attack.
  # Priority: enemy troops → active guerrillas (first-faction chosen, then other) → untunneled bases (tunneled roll ≥4 to flip).
  - id: piece-removal-ordering
    params:
      - { name: space, type: string }
      - { name: damageExpr, type: value }
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
      - { name: space, type: string }
      - { name: damageExpr, type: value }
    effects:
      - let:
          bind: $basesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: type, eq: base }, { prop: faction, op: in, value: ['NVA', 'VC'] }] } } }
          in:
            - macro: piece-removal-ordering
              args:
                space: { param: space }
                damageExpr: { param: damageExpr }
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
      - { name: attackerFaction, type: string }
    effects:
      - let:
          bind: $usPiecesBefore
          value: { aggregate: { op: count, query: { query: tokensInZone, zone: { param: space }, filter: [{ prop: faction, eq: 'US' }] } } }
          in:
            - chooseOne:
                bind: $targetFactionFirst
                options: { query: enums, values: ['US', 'ARVN'] }
            - let:
                bind: $targetFactionSecond
                value: { if: { when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'US' }, then: 'ARVN', else: 'US' } }
                in:
                  - removeByPriority:
                      budget: { param: damageExpr }
                      groups:
                        # Non-base COIN pieces are removed before any base.
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: { param: space }
                            filter: [{ prop: faction, eq: { ref: binding, name: $targetFactionFirst } }, { prop: type, op: neq, value: base }]
                          to:
                            zoneExpr:
                              if:
                                when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'US' }
                                then: 'casualties-US:none'
                                else: { concat: ['available-', { ref: binding, name: $targetFactionFirst }, ':none'] }
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: { param: space }
                            filter: [{ prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: type, op: neq, value: base }]
                          to:
                            zoneExpr:
                              if:
                                when: { op: '==', left: { ref: binding, name: $targetFactionSecond }, right: 'US' }
                                then: 'casualties-US:none'
                                else: { concat: ['available-', { ref: binding, name: $targetFactionSecond }, ':none'] }
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: { param: space }
                            filter: [{ prop: faction, eq: { ref: binding, name: $targetFactionFirst } }, { prop: type, eq: base }]
                          to:
                            zoneExpr:
                              if:
                                when: { op: '==', left: { ref: binding, name: $targetFactionFirst }, right: 'US' }
                                then: 'casualties-US:none'
                                else: { concat: ['available-', { ref: binding, name: $targetFactionFirst }, ':none'] }
                        - bind: $target
                          over:
                            query: tokensInZone
                            zone: { param: space }
                            filter: [{ prop: faction, eq: { ref: binding, name: $targetFactionSecond } }, { prop: type, eq: base }]
                          to:
                            zoneExpr:
                              if:
                                when: { op: '==', left: { ref: binding, name: $targetFactionSecond }, right: 'US' }
                                then: 'casualties-US:none'
                                else: { concat: ['available-', { ref: binding, name: $targetFactionSecond }, ':none'] }
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

  # ── per-province-city-cost ─────────────────────────────────────────────────
  # Faction-conditional per-space cost that charges 0 for LoCs.
  - id: per-province-city-cost
    params:
      - { name: space, type: string }
      - { name: resource, type: string }
      - { name: amount, type: number }
    effects:
      - if:
          when:
            op: and
            args:
              - { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
              - { op: '!=', left: { ref: zoneProp, zone: { param: space }, prop: spaceType }, right: 'loc' }
          then:
            - addVar: { scope: global, var: { param: resource }, delta: { param: amount } }

  # ── place-from-available-or-map ────────────────────────────────────────────
  # Dynamic piece sourcing (Rule 1.4.1): place from Available, then from map if not US.
  - id: place-from-available-or-map
    params:
      - { name: pieceType, type: string }
      - { name: faction, type: string }
      - { name: targetSpace, type: string }
      - { name: maxPieces, type: value }
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
                              query: zones
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
      - { name: cubeFaction, type: string }
      - { name: sfType, type: string }
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
          visual:
            color: olive
            shape: cube
        - id: us-bases
          faction: us
          statusDimensions: []
          transitions: []
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
          visual:
            color: olive
            shape: cylinder
            activeSymbol: star
        - id: arvn-troops
          faction: arvn
          statusDimensions: []
          transitions: []
          visual:
            color: yellow
            shape: cube
        - id: arvn-police
          faction: arvn
          statusDimensions: []
          transitions: []
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
          visual:
            color: yellow
            shape: cylinder
            activeSymbol: star
        - id: arvn-bases
          faction: arvn
          statusDimensions: []
          transitions: []
          visual:
            color: yellow
            shape: round-disk
        - id: nva-troops
          faction: nva
          statusDimensions: []
          transitions: []
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
        - { trackId: "vcResources", value: 5 }
        - { trackId: "nvaResources", value: 10 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-bases", faction: "us", count: 2 }
        - { pieceTypeId: "us-troops", faction: "us", count: 10 }
        - { pieceTypeId: "arvn-bases", faction: "arvn", count: 2 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
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
        - { trackId: "vcResources", value: 10 }
        - { trackId: "nvaResources", value: 15 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-troops", faction: "us", count: 6 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
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
        - { trackId: "vcResources", value: 15 }
        - { trackId: "nvaResources", value: 20 }
        - { trackId: "arvnResources", value: 30 }
      outOfPlay:
        - { pieceTypeId: "us-troops", faction: "us", count: 5 }
        - { pieceTypeId: "arvn-troops", faction: "arvn", count: 10 }
        - { pieceTypeId: "arvn-rangers", faction: "arvn", count: 3 }
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
    drawZone: leader:none
    discardZone: played:none
    shuffleOnSetup: true
    cards:
      - id: card-82
        title: Domino Theory
        sideMode: dual
        order: 82
        unshaded:
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
                - addVar: { scope: global, var: aid, delta: 1 }
        shaded:
          targets:
            - id: us-troops-available
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -9 }
      - id: card-27
        title: Phoenix Program
        sideMode: dual
        order: 27
        unshaded:
          targets:
            - id: vc-in-coin-control
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -1 }
        shaded:
          targets:
            - id: terror-spaces
              selector:
                query: spaces
              cardinality: { max: 2 }
          effects:
            - addVar: { scope: global, var: aid, delta: -2 }
            - addVar: { scope: global, var: arvnResources, delta: -1 }

# ══════════════════════════════════════════════════════════════════════════════
# Pool Zones (piece availability pools — supplement map-derived board zones)
# ══════════════════════════════════════════════════════════════════════════════
zones:
  - { id: available-US, owner: none, visibility: public, ordering: set }
  - { id: available-ARVN, owner: none, visibility: public, ordering: set }
  - { id: available-NVA, owner: none, visibility: public, ordering: set }
  - { id: available-VC, owner: none, visibility: public, ordering: set }
  - { id: casualties-US, owner: none, visibility: public, ordering: set }
  - { id: leader, owner: none, visibility: public, ordering: stack }
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
                      query: zones
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
                      query: zones
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
              bind: space
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
                          pieceType: irregulars
                          faction: 'US'
                          targetSpace: $space
                          maxPieces: 2

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
                                pieceType: rangers
                                faction: 'ARVN'
                                targetSpace: $space
                                maxPieces: 2
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

      - stage: sub-action
        effects:
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
                            - addVar: { scope: global, var: arvnResources, delta: -3 }
                            - setMarker: { space: $subSpace, marker: terror, state: none }
                      # Shift up to 2 levels toward Active Support
                      - chooseOne:
                          bind: $pacLevels
                          options: { query: intsInRange, min: 1, max: 2 }
                      # Costs 3 ARVN Resources per level shifted (even if free op!)
                      - addVar:
                          scope: global
                          var: arvnResources
                          delta: { op: '*', left: { ref: binding, name: $pacLevels }, right: -3 }
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
                      query: zones
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          # Without NVA Control (NVA pieces <= COIN+VC pieces)
                          - op: not
                            arg: { op: '==', left: { ref: zoneProp, zone: $zone, prop: control }, right: 'NVA' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
                      filter:
                        op: and
                        args:
                          - op: or
                            args:
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'city' }
                              - { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'province' }
                          - op: not
                            arg: { op: '==', left: { ref: zoneProp, zone: $zone, prop: control }, right: 'NVA' }
                    min: 1
                    max: 99

      - stage: resolve-per-space
        effects:
          - forEach:
              bind: space
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
                          pieceType: rangers
                          faction: 'ARVN'
                          targetSpace: $space
                          maxPieces: 2

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

      - stage: sub-action
        effects:
          # In 1 selected space (even if LimOp), choose one of:
          # A) Pacification (ARVN needs ARVN Troops AND Police + COIN Control)
          # B) Replace 3 ARVN cubes with 1 ARVN Base
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
                            - addVar: { scope: global, var: arvnResources, delta: -3 }
                            - setMarker: { space: $subSpace, marker: terror, state: none }
                      - chooseOne:
                          bind: $pacLevels
                          options: { query: intsInRange, min: 1, max: 2 }
                      - addVar:
                          scope: global
                          var: arvnResources
                          delta: { op: '*', left: { ref: binding, name: $pacLevels }, right: -3 }
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
                      query: zones
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: zones
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
      op: '>='
      left: { ref: gvar, var: arvnResources }
      right: 3
    costValidation:
      op: '>='
      left: { ref: gvar, var: arvnResources }
      right: 3
    costEffects:
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
                      query: zones
                      filter: { op: '==', left: { ref: zoneProp, zone: $zone, prop: spaceType }, right: 'loc' }
                    min: 1
                    max: 1
              else:
                - chooseN:
                    bind: targetLoCs
                    options:
                      query: zones
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
                      query: zones
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
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
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
                    sfType: irregulars
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
                      query: zones
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
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
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
                    sfType: rangers
    atomicity: atomic
  - id: assault-us-profile
    actionId: assault
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
                      query: zones
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
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
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
      - stage: arvn-followup
        effects:
          - if:
              when: { op: '>=', left: { ref: gvar, var: arvnResources }, right: 3 }
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
    atomicity: atomic
  - id: assault-arvn-profile
    actionId: assault
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
                      query: zones
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
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
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
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
                      - addVar: { scope: global, var: arvnResources, delta: -3 }
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
                      query: zones
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
                      query: zones
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
              then:
                - chooseOne:
                    bind: $improveTrail
                    options: { query: enums, values: ['yes', 'no'] }
                - if:
                    when: { op: '==', left: { ref: binding, name: $improveTrail }, right: 'yes' }
                    then:
                      - addVar: { scope: global, var: nvaResources, delta: -2 }
                      - addVar: { scope: global, var: trail, delta: 1 }
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
                      query: zones
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
                      query: zones
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
    atomicity: atomic
  - id: march-profile
    actionId: march
    legality:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -1
    targeting:
      select: allEligible
      movementOrder: deterministicSpaceOrder
      activationPolicy: activateWhenEnteringCOINControl
    stages:
      - stage: march-resolve
        effects:
          - addVar:
              scope: global
              var: marchCount
              delta: 1
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
          - if:
              when: { op: '==', left: { ref: binding, name: __actionClass }, right: 'limitedOperation' }
              then:
                - chooseN:
                    bind: targetSpaces
                    options:
                      query: zones
                      filter:
                        op: and
                        args:
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }] } } }
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
                      query: zones
                      filter:
                        op: and
                        args:
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, eq: 'NVA' }] } } }
                            right: 0
                          - op: '>'
                            left: { aggregate: { op: count, query: { query: tokensInZone, zone: $zone, filter: [{ prop: faction, op: in, value: ['US', 'ARVN'] }] } } }
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
                    when: { op: '!=', left: { ref: binding, name: __freeOperation }, right: true }
                    then:
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
                                value: { op: '/', left: { ref: binding, name: $nvaTroops }, right: 2 }
                                in:
                                  - macro: insurgent-attack-removal-order
                                    args:
                                      space: $space
                                      damageExpr: { ref: binding, name: $damage }
                                      attackerFaction: 'NVA'
    atomicity: atomic
  - id: terror-profile
    actionId: terror
    legality:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: insurgentResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: insurgentResources
            delta: -1
    targeting:
      select: upToN
      max: 2
      order: lexicographicSpaceId
      supportShiftPolicy: setOppositionTowardActive
    stages:
      - stage: terror-resolve
        effects:
          - addVar:
              scope: global
              var: terrorCount
              delta: 1
    atomicity: atomic
  # ── US/ARVN special-activity stub profiles ──
  - id: advise-profile
    actionId: advise
    legality:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
    costValidation:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
    costEffects:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: upToN
      max: 2
    stages:
      - stage: advise-resolve
        effects:
          - addVar:
              scope: global
              var: adviseCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: air-lift-profile
    actionId: airLift
    legality:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: usResources
            delta: -1
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    stages:
      - stage: air-lift-resolve
        effects:
          - addVar:
              scope: global
              var: airLiftCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: air-strike-profile
    actionId: airStrike
    legality:
        op: ">="
        left:
          ref: gvar
          var: usResources
        right: 2
    costValidation:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 1
    costEffects:
        - addVar:
            scope: global
            var: usResources
            delta: -2
    targeting:
      select: exactlyN
      count: 1
      tieBreak: basesLast
    stages:
      - stage: air-strike-resolve
        effects:
          - addVar:
              scope: global
              var: airStrikeCount
              delta: 1
    atomicity: atomic
    linkedWindows: [us-special-window]
  - id: govern-profile
    actionId: govern
    legality:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: upToN
      max: 1
    stages:
      - stage: govern-resolve
        effects:
          - addVar:
              scope: global
              var: governCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  - id: transport-profile
    actionId: transport
    legality:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: arvnResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: arvnResources
            delta: -1
    targeting:
      select: allEligible
      movementOrder: deterministicSpaceOrder
    stages:
      - stage: transport-resolve
        effects:
          - addVar:
              scope: global
              var: transportCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  - id: raid-profile
    actionId: raid
    legality:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
    costValidation:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: arvnResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: usResources
            right: 1
    costEffects:
        - addVar:
            scope: global
            var: arvnResources
            delta: -2
    targeting:
      select: upToN
      max: 2
      tieBreak: lexicographicSpaceId
    stages:
      - stage: raid-resolve
        effects:
          - addVar:
              scope: global
              var: raidCount
              delta: 1
    atomicity: atomic
    linkedWindows: [arvn-special-window]
  # ── NVA/VC special-activity stub profiles ──
  - id: infiltrate-profile
    actionId: infiltrate
    legality:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 2
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 2
    costEffects:
        - addVar:
            scope: global
            var: nvaResources
            delta: -2
    targeting:
      select: upToN
      max: 2
      placementPolicy: baseThenGuerrilla
    stages:
      - stage: infiltrate-resolve
        effects:
          - addVar:
              scope: global
              var: infiltrateCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: bombard-profile
    actionId: bombard
    legality:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
    costValidation:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 1
    costEffects:
        - addVar:
            scope: global
            var: nvaResources
            delta: -1
    targeting:
      select: allEligible
      order: lexicographicSpaceId
    stages:
      - stage: bombard-resolve
        effects:
          - addVar:
              scope: global
              var: bombardCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: nva-ambush-profile
    actionId: ambushNva
    legality:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: nvaResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: nvaResources
            delta: -1
    targeting:
      select: exactlyN
      count: 1
      tieBreak: basesLast
      removalPolicy: removeActiveGuerrillasBeforeBases
    stages:
      - stage: ambush-nva-resolve
        effects:
          - addVar:
              scope: global
              var: nvaAmbushCount
              delta: 1
    atomicity: atomic
    linkedWindows: [nva-special-window]
  - id: tax-profile
    actionId: tax
    legality:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: vcResources
            delta: -1
    targeting:
      select: upToN
      max: 2
      order: lexicographicSpaceId
    stages:
      - stage: tax-resolve
        effects:
          - addVar:
              scope: global
              var: taxCount
              delta: 1
    atomicity: atomic
    linkedWindows: [vc-special-window]
  - id: subvert-profile
    actionId: subvert
    legality:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 1
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
    costValidation:
        op: and
        args:
          - op: ">="
            left:
              ref: gvar
              var: vcResources
            right: 2
          - op: ">="
            left:
              ref: gvar
              var: nvaResources
            right: 1
    costEffects:
        - addVar:
            scope: global
            var: vcResources
            delta: -2
    targeting:
      select: upToN
      max: 1
      supportShiftPolicy: setTowardOpposition
    stages:
      - stage: subvert-resolve
        effects:
          - addVar:
              scope: global
              var: subvertCount
              delta: 1
    atomicity: atomic
    linkedWindows: [vc-special-window]
  - id: vc-ambush-profile
    actionId: ambushVc
    legality:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    costValidation:
        op: ">="
        left:
          ref: gvar
          var: vcResources
        right: 1
    costEffects:
        - addVar:
            scope: global
            var: vcResources
            delta: -1
    targeting:
      select: exactlyN
      count: 1
      tieBreak: lexicographicSpaceId
      removalPolicy: removeUndergroundGuerrillaFirst
    stages:
      - stage: ambush-vc-resolve
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
globalVars:
  # ── Real game resource tracks ──
  - { name: nvaResources, type: int, init: 10, min: 0, max: 75 }
  - { name: vcResources, type: int, init: 5, min: 0, max: 75 }
  - { name: arvnResources, type: int, init: 30, min: 0, max: 75 }
  - { name: aid, type: int, init: 15, min: 0, max: 75 }
  - { name: patronage, type: int, init: 15, min: 0, max: 75 }
  - { name: trail, type: int, init: 1, min: 0, max: 4 }
  - { name: totalEcon, type: int, init: 10, min: 0, max: 75 }
  - { name: terrorSabotageMarkersPlaced, type: int, init: 0, min: 0, max: 15 }
  # ── Stub vars for COIN operation testing ──
  - { name: coinResources, type: int, init: 10, min: 0, max: 50 }
  - { name: trainCount, type: int, init: 0, min: 0, max: 20 }
  - { name: patrolCount, type: int, init: 0, min: 0, max: 20 }
  - { name: sweepCount, type: int, init: 0, min: 0, max: 20 }
  - { name: assaultCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for insurgent operation testing ──
  - { name: insurgentResources, type: int, init: 7, min: 0, max: 50 }
  - { name: rallyCount, type: int, init: 0, min: 0, max: 20 }
  - { name: marchCount, type: int, init: 0, min: 0, max: 20 }
  - { name: attackCount, type: int, init: 0, min: 0, max: 20 }
  - { name: terrorCount, type: int, init: 0, min: 0, max: 20 }
  # ── Stub vars for US/ARVN special-activity testing ──
  - { name: usResources, type: int, init: 7, min: 0, max: 50 }
  - { name: adviseCount, type: int, init: 0, min: 0, max: 20 }
  - { name: airLiftCount, type: int, init: 0, min: 0, max: 20 }
  - { name: airStrikeCount, type: int, init: 0, min: 0, max: 20 }
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

perPlayerVars:
  - { name: resources, type: int, init: 20, min: 0, max: 50 }

# ══════════════════════════════════════════════════════════════════════════════
# Turn Structure (stub — to be replaced by real COIN-series turn flow)
# ══════════════════════════════════════════════════════════════════════════════
turnStructure:
  phases:
    - id: main
  
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
# Terminal (stub — to be replaced by real victory conditions)
# ══════════════════════════════════════════════════════════════════════════════
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 2 }
      result: { type: draw }
```

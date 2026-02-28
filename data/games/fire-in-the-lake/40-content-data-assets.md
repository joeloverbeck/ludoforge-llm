# Fire in the Lake - Content Data Assets

```yaml
dataAssets:
  - id: fitl-map-production
    kind: map
    payload:
      spaces:
        - id: hue:none
          category: city
          attributes:
            population: 2
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: quang-tri-thua-thien:none
            - to: loc-hue-khe-sanh:none
            - to: loc-hue-da-nang:none
        - id: da-nang:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: quang-nam:none
            - to: quang-tin-quang-ngai:none
            - to: loc-hue-da-nang:none
            - to: loc-da-nang-qui-nhon:none
            - to: loc-da-nang-dak-to:none
        - id: kontum:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: binh-dinh:none
            - to: pleiku-darlac:none
            - to: phu-bon-phu-yen:none
            - to: loc-kontum-dak-to:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-kontum-qui-nhon:none
        - id: qui-nhon:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: binh-dinh:none
            - to: phu-bon-phu-yen:none
            - to: loc-da-nang-qui-nhon:none
            - to: loc-kontum-qui-nhon:none
            - to: loc-qui-nhon-cam-ranh:none
        - id: cam-ranh:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: khanh-hoa:none
            - to: binh-tuy-binh-thuan:none
            - to: loc-qui-nhon-cam-ranh:none
            - to: loc-saigon-cam-ranh:none
            - to: loc-cam-ranh-da-lat:none
        - id: an-loc:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: phuoc-long:none
            - to: tay-ninh:none
            - to: the-fishhook:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: saigon:none
          category: city
          attributes:
            population: 6
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: binh-tuy-binh-thuan:none
            - to: quang-duc-long-khanh:none
            - to: tay-ninh:none
            - to: kien-phong:none
            - to: kien-hoa-vinh-binh:none
            - to: loc-saigon-cam-ranh:none
            - to: loc-saigon-da-lat:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
            - to: loc-saigon-can-tho:none
        - id: can-tho:none
          category: city
          attributes:
            population: 1
            econ: 0
            terrainTags: []
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: kien-phong:none
            - to: kien-hoa-vinh-binh:none
            - to: ba-xuyen:none
            - to: kien-giang-an-xuyen:none
            - to: loc-saigon-can-tho:none
            - to: loc-can-tho-chau-doc:none
            - to: loc-can-tho-bac-lieu:none
            - to: loc-can-tho-long-phu:none
        - id: central-laos:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: laos
            coastal: false
          adjacentTo:
            - to: north-vietnam:none
            - to: quang-tri-thua-thien:none
            - to: quang-nam:none
            - to: southern-laos:none
            - to: loc-hue-khe-sanh:none
        - id: southern-laos:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: laos
            coastal: false
          adjacentTo:
            - to: central-laos:none
            - to: quang-nam:none
            - to: quang-tin-quang-ngai:none
            - to: binh-dinh:none
            - to: pleiku-darlac:none
            - to: northeast-cambodia:none
            - to: loc-da-nang-dak-to:none
            - to: loc-kontum-dak-to:none
        - id: northeast-cambodia:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: cambodia
            coastal: false
          adjacentTo:
            - to: southern-laos:none
            - to: the-fishhook:none
            - to: pleiku-darlac:none
        - id: the-fishhook:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: cambodia
            coastal: false
          adjacentTo:
            - to: an-loc:none
            - to: northeast-cambodia:none
            - to: the-parrots-beak:none
            - to: pleiku-darlac:none
            - to: quang-duc-long-khanh:none
            - to: phuoc-long:none
            - to: tay-ninh:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: the-parrots-beak:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: cambodia
            coastal: false
          adjacentTo:
            - to: the-fishhook:none
            - to: sihanoukville:none
            - to: tay-ninh:none
            - to: kien-phong:none
            - to: kien-giang-an-xuyen:none
            - to: loc-can-tho-chau-doc:none
        - id: sihanoukville:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: cambodia
            coastal: true
          adjacentTo:
            - to: the-parrots-beak:none
            - to: kien-giang-an-xuyen:none
        - id: north-vietnam:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - highland
            country: northVietnam
            coastal: true
          adjacentTo:
            - to: central-laos:none
            - to: quang-tri-thua-thien:none
            - to: loc-hue-khe-sanh:none
        - id: quang-tri-thua-thien:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - highland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: hue:none
            - to: central-laos:none
            - to: north-vietnam:none
            - to: quang-nam:none
            - to: loc-hue-khe-sanh:none
            - to: loc-hue-da-nang:none
        - id: quang-nam:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - highland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: da-nang:none
            - to: central-laos:none
            - to: southern-laos:none
            - to: quang-tri-thua-thien:none
            - to: quang-tin-quang-ngai:none
            - to: loc-hue-da-nang:none
            - to: loc-da-nang-dak-to:none
        - id: quang-tin-quang-ngai:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: da-nang:none
            - to: southern-laos:none
            - to: quang-nam:none
            - to: binh-dinh:none
            - to: loc-da-nang-dak-to:none
            - to: loc-da-nang-qui-nhon:none
        - id: binh-dinh:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - highland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: kontum:none
            - to: qui-nhon:none
            - to: southern-laos:none
            - to: quang-tin-quang-ngai:none
            - to: phu-bon-phu-yen:none
            - to: pleiku-darlac:none
            - to: loc-da-nang-dak-to:none
            - to: loc-da-nang-qui-nhon:none
            - to: loc-kontum-dak-to:none
            - to: loc-kontum-qui-nhon:none
        - id: pleiku-darlac:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - highland
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: kontum:none
            - to: southern-laos:none
            - to: northeast-cambodia:none
            - to: the-fishhook:none
            - to: binh-dinh:none
            - to: phu-bon-phu-yen:none
            - to: khanh-hoa:none
            - to: quang-duc-long-khanh:none
            - to: loc-kontum-dak-to:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-da-nang-dak-to:none
            - to: loc-ban-me-thuot-da-lat:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: phu-bon-phu-yen:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: kontum:none
            - to: qui-nhon:none
            - to: binh-dinh:none
            - to: pleiku-darlac:none
            - to: khanh-hoa:none
            - to: loc-kontum-qui-nhon:none
            - to: loc-qui-nhon-cam-ranh:none
            - to: loc-kontum-ban-me-thuot:none
        - id: khanh-hoa:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - highland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: cam-ranh:none
            - to: pleiku-darlac:none
            - to: phu-bon-phu-yen:none
            - to: binh-tuy-binh-thuan:none
            - to: quang-duc-long-khanh:none
            - to: loc-qui-nhon-cam-ranh:none
            - to: loc-cam-ranh-da-lat:none
            - to: loc-ban-me-thuot-da-lat:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-saigon-da-lat:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: phuoc-long:none
          category: province
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - jungle
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: an-loc:none
            - to: the-fishhook:none
            - to: quang-duc-long-khanh:none
            - to: tay-ninh:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: quang-duc-long-khanh:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - jungle
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: saigon:none
            - to: the-fishhook:none
            - to: pleiku-darlac:none
            - to: khanh-hoa:none
            - to: phuoc-long:none
            - to: binh-tuy-binh-thuan:none
            - to: tay-ninh:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
            - to: loc-ban-me-thuot-da-lat:none
            - to: loc-saigon-da-lat:none
            - to: loc-cam-ranh-da-lat:none
        - id: binh-tuy-binh-thuan:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - jungle
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: cam-ranh:none
            - to: saigon:none
            - to: khanh-hoa:none
            - to: quang-duc-long-khanh:none
            - to: loc-ban-me-thuot-da-lat:none
            - to: loc-cam-ranh-da-lat:none
            - to: loc-saigon-da-lat:none
            - to: loc-saigon-cam-ranh:none
        - id: tay-ninh:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - jungle
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: an-loc:none
            - to: saigon:none
            - to: the-fishhook:none
            - to: the-parrots-beak:none
            - to: phuoc-long:none
            - to: quang-duc-long-khanh:none
            - to: kien-phong:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
        - id: kien-phong:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: saigon:none
            - to: can-tho:none
            - to: the-parrots-beak:none
            - to: tay-ninh:none
            - to: kien-hoa-vinh-binh:none
            - to: kien-giang-an-xuyen:none
            - to: loc-can-tho-chau-doc:none
            - to: loc-saigon-can-tho:none
        - id: kien-hoa-vinh-binh:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: saigon:none
            - to: can-tho:none
            - to: kien-phong:none
            - to: ba-xuyen:none
            - to: loc-saigon-can-tho:none
            - to: loc-can-tho-long-phu:none
        - id: ba-xuyen:none
          category: province
          attributes:
            population: 1
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: can-tho:none
            - to: kien-hoa-vinh-binh:none
            - to: kien-giang-an-xuyen:none
            - to: loc-can-tho-bac-lieu:none
            - to: loc-can-tho-long-phu:none
        - id: kien-giang-an-xuyen:none
          category: province
          attributes:
            population: 2
            econ: 0
            terrainTags:
              - lowland
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: can-tho:none
            - to: the-parrots-beak:none
            - to: sihanoukville:none
            - to: kien-phong:none
            - to: ba-xuyen:none
            - to: loc-can-tho-chau-doc:none
            - to: loc-can-tho-bac-lieu:none
        - id: loc-hue-khe-sanh:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: hue:none
            - to: central-laos:none
            - to: north-vietnam:none
            - to: quang-tri-thua-thien:none
        - id: loc-hue-da-nang:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: hue:none
            - to: da-nang:none
            - to: quang-tri-thua-thien:none
            - to: quang-nam:none
        - id: loc-da-nang-dak-to:none
          category: loc
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: da-nang:none
            - to: southern-laos:none
            - to: quang-nam:none
            - to: quang-tin-quang-ngai:none
            - to: binh-dinh:none
            - to: pleiku-darlac:none
            - to: loc-kontum-dak-to:none
        - id: loc-da-nang-qui-nhon:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: da-nang:none
            - to: qui-nhon:none
            - to: quang-tin-quang-ngai:none
            - to: binh-dinh:none
        - id: loc-kontum-dak-to:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: kontum:none
            - to: southern-laos:none
            - to: binh-dinh:none
            - to: pleiku-darlac:none
            - to: loc-da-nang-dak-to:none
        - id: loc-kontum-qui-nhon:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: kontum:none
            - to: qui-nhon:none
            - to: binh-dinh:none
            - to: phu-bon-phu-yen:none
        - id: loc-kontum-ban-me-thuot:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: kontum:none
            - to: pleiku-darlac:none
            - to: phu-bon-phu-yen:none
            - to: khanh-hoa:none
            - to: quang-duc-long-khanh:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
            - to: loc-ban-me-thuot-da-lat:none
        - id: loc-qui-nhon-cam-ranh:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: qui-nhon:none
            - to: cam-ranh:none
            - to: phu-bon-phu-yen:none
            - to: khanh-hoa:none
        - id: loc-cam-ranh-da-lat:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: cam-ranh:none
            - to: khanh-hoa:none
            - to: binh-tuy-binh-thuan:none
            - to: quang-duc-long-khanh:none
            - to: loc-saigon-da-lat:none
            - to: loc-ban-me-thuot-da-lat:none
        - id: loc-ban-me-thuot-da-lat:none
          category: loc
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: pleiku-darlac:none
            - to: khanh-hoa:none
            - to: quang-duc-long-khanh:none
            - to: binh-tuy-binh-thuan:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-cam-ranh-da-lat:none
            - to: loc-saigon-an-loc-ban-me-thuot:none
            - to: loc-saigon-da-lat:none
        - id: loc-saigon-cam-ranh:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: cam-ranh:none
            - to: saigon:none
            - to: binh-tuy-binh-thuan:none
        - id: loc-saigon-da-lat:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: saigon:none
            - to: khanh-hoa:none
            - to: quang-duc-long-khanh:none
            - to: binh-tuy-binh-thuan:none
            - to: loc-cam-ranh-da-lat:none
            - to: loc-ban-me-thuot-da-lat:none
        - id: loc-saigon-an-loc-ban-me-thuot:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - highway
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: an-loc:none
            - to: saigon:none
            - to: the-fishhook:none
            - to: pleiku-darlac:none
            - to: phuoc-long:none
            - to: quang-duc-long-khanh:none
            - to: tay-ninh:none
            - to: loc-kontum-ban-me-thuot:none
            - to: loc-ban-me-thuot-da-lat:none
            - to: khanh-hoa:none
        - id: loc-saigon-can-tho:none
          category: loc
          attributes:
            population: 0
            econ: 2
            terrainTags:
              - mekong
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: saigon:none
            - to: can-tho:none
            - to: kien-phong:none
            - to: kien-hoa-vinh-binh:none
        - id: loc-can-tho-chau-doc:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - mekong
            country: southVietnam
            coastal: false
          adjacentTo:
            - to: can-tho:none
            - to: the-parrots-beak:none
            - to: kien-phong:none
            - to: kien-giang-an-xuyen:none
        - id: loc-can-tho-bac-lieu:none
          category: loc
          attributes:
            population: 0
            econ: 0
            terrainTags:
              - mekong
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: can-tho:none
            - to: ba-xuyen:none
            - to: kien-giang-an-xuyen:none
        - id: loc-can-tho-long-phu:none
          category: loc
          attributes:
            population: 0
            econ: 1
            terrainTags:
              - mekong
            country: southVietnam
            coastal: true
          adjacentTo:
            - to: can-tho:none
            - to: kien-hoa-vinh-binh:none
            - to: ba-xuyen:none
      tracks:
        - id: nvaResources
          scope: seat
          seat: nva
          min: 0
          max: 75
          initial: 0
        - id: vcResources
          scope: seat
          seat: vc
          min: 0
          max: 75
          initial: 0
        - id: arvnResources
          scope: seat
          seat: arvn
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
        - id: leaderBoxCardCount
          scope: global
          min: 0
          max: 8
          initial: 0
      markerLattices:
        - id: supportOpposition
          states:
            - activeOpposition
            - passiveOpposition
            - neutral
            - passiveSupport
            - activeSupport
          defaultState: neutral
          constraints:
            - category:
                - loc
              allowedStates:
                - neutral
            - attributeEquals:
                population: 0
              allowedStates:
                - neutral
        - id: sabotage
          states:
            - none
            - sabotage
          defaultState: none
          constraints:
            - category:
                - city
                - province
              allowedStates:
                - none
        - id: coupPacifySpaceUsage
          states:
            - open
            - used
          defaultState: open
        - id: coupAgitateSpaceUsage
          states:
            - open
            - used
          defaultState: open
        - id: coupSupportShiftCount
          states:
            - zero
            - one
            - two
          defaultState: zero
      stackingConstraints:
        - id: max-2-bases-per-space
          description: No more than 2 Bases of any Factions may occupy a single Province or City
          spaceFilter:
            category:
              - province
              - city
          pieceFilter:
            pieceTypeIds:
              - us-bases
              - arvn-bases
              - nva-bases
              - vc-bases
          rule: maxCount
          maxCount: 2
        - id: no-bases-on-locs
          description: Bases may not occupy LoCs
          spaceFilter:
            category:
              - loc
          pieceFilter:
            pieceTypeIds:
              - us-bases
              - arvn-bases
              - nva-bases
              - vc-bases
          rule: prohibit
        - id: north-vietnam-insurgent-only
          description: Only NVA and VC forces may occupy North Vietnam
          spaceFilter:
            attributeEquals:
              country: northVietnam
          pieceFilter:
            pieceTypeIds:
              - us-troops
              - us-bases
              - us-irregulars
              - arvn-troops
              - arvn-police
              - arvn-rangers
              - arvn-bases
          rule: prohibit
  - id: fitl-piece-catalog-production
    kind: pieceCatalog
    payload:
      seats:
        - id: us
        - id: arvn
        - id: nva
        - id: vc
      pieceTypes:
        - id: us-troops
          seat: us
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: US
            type: troops
            m48PatrolMoved: false
        - id: us-bases
          seat: us
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: US
            type: base
        - id: us-irregulars
          seat: us
          statusDimensions:
            - activity
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps:
            faction: US
            type: irregular
            activity: underground
        - id: arvn-troops
          seat: arvn
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: ARVN
            type: troops
            m48PatrolMoved: false
        - id: arvn-police
          seat: arvn
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: ARVN
            type: police
            m48PatrolMoved: false
        - id: arvn-rangers
          seat: arvn
          statusDimensions:
            - activity
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps:
            faction: ARVN
            type: ranger
            activity: underground
        - id: arvn-bases
          seat: arvn
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: ARVN
            type: base
        - id: nva-troops
          seat: nva
          statusDimensions: []
          transitions: []
          runtimeProps:
            faction: NVA
            type: troops
        - id: nva-guerrillas
          seat: nva
          statusDimensions:
            - activity
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps:
            faction: NVA
            type: guerrilla
            activity: underground
        - id: nva-bases
          seat: nva
          statusDimensions:
            - tunnel
          transitions:
            - dimension: tunnel
              from: untunneled
              to: tunneled
            - dimension: tunnel
              from: tunneled
              to: untunneled
          runtimeProps:
            faction: NVA
            type: base
            tunnel: untunneled
        - id: vc-guerrillas
          seat: vc
          statusDimensions:
            - activity
          transitions:
            - dimension: activity
              from: underground
              to: active
            - dimension: activity
              from: active
              to: underground
          runtimeProps:
            faction: VC
            type: guerrilla
            activity: underground
        - id: vc-bases
          seat: vc
          statusDimensions:
            - tunnel
          transitions:
            - dimension: tunnel
              from: untunneled
              to: tunneled
            - dimension: tunnel
              from: tunneled
              to: untunneled
          runtimeProps:
            faction: VC
            type: base
            tunnel: untunneled
      inventory:
        - pieceTypeId: us-troops
          seat: us
          total: 40
        - pieceTypeId: us-bases
          seat: us
          total: 6
        - pieceTypeId: us-irregulars
          seat: us
          total: 6
        - pieceTypeId: arvn-troops
          seat: arvn
          total: 30
        - pieceTypeId: arvn-police
          seat: arvn
          total: 30
        - pieceTypeId: arvn-rangers
          seat: arvn
          total: 6
        - pieceTypeId: arvn-bases
          seat: arvn
          total: 3
        - pieceTypeId: nva-troops
          seat: nva
          total: 40
        - pieceTypeId: nva-guerrillas
          seat: nva
          total: 20
        - pieceTypeId: nva-bases
          seat: nva
          total: 9
        - pieceTypeId: vc-guerrillas
          seat: vc
          total: 30
        - pieceTypeId: vc-bases
          seat: vc
          total: 9
  - id: fitl-scenario-full
    kind: scenario
    payload:
      mapAssetId: fitl-map-production
      pieceCatalogAssetId: fitl-piece-catalog-production
      scenarioName: Full
      yearRange: 1964-1972
      deckComposition:
        materializationStrategy: pile-coup-mix-v1
        pileCount: 6
        eventsPerPile: 12
        coupsPerPile: 1
        excludedCardTags:
          - pivotal
        pileFilters:
          - piles: [1]
            metadataEquals: { period: "1964" }
          - piles: [2, 3]
            metadataEquals: { period: "1965" }
          - piles: [4, 5, 6]
            metadataEquals: { period: "1968" }
      cardPlacements:
        - cardId: card-121
          zoneId: leader:none
        - cardId: card-122
          zoneId: leader:none
        - cardId: card-123
          zoneId: leader:none
        - cardId: card-124
          zoneId: leader:none
      outOfPlay:
        - pieceTypeId: us-bases
          seat: us
          count: 2
        - pieceTypeId: us-troops
          seat: us
          count: 10
        - pieceTypeId: arvn-bases
          seat: arvn
          count: 2
        - pieceTypeId: arvn-troops
          seat: arvn
          count: 10
        - pieceTypeId: arvn-rangers
          seat: arvn
          count: 3
      seatPools:
        - seat: us
          availableZoneId: available-US:none
          outOfPlayZoneId: out-of-play-US:none
        - seat: arvn
          availableZoneId: available-ARVN:none
          outOfPlayZoneId: out-of-play-ARVN:none
        - seat: nva
          availableZoneId: available-NVA:none
        - seat: vc
          availableZoneId: available-VC:none
      initializations:
        - markerId: activeLeader
          state: minh
        - trackId: aid
          value: 15
        - trackId: patronage
          value: 15
        - trackId: trail
          value: 1
        - trackId: totalEcon
          value: 15
        - trackId: vcResources
          value: 5
        - trackId: nvaResources
          value: 10
        - trackId: arvnResources
          value: 30
        - spaceId: saigon:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: qui-nhon:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: cam-ranh:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: an-loc:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: can-tho:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: phu-bon-phu-yen:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: khanh-hoa:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: kien-hoa-vinh-binh:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: ba-xuyen:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: quang-tin-quang-ngai:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: quang-duc-long-khanh:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: binh-tuy-binh-thuan:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: tay-ninh:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-phong:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-giang-an-xuyen:none
          markerId: supportOpposition
          state: activeOpposition
      initialPlacements:
        - spaceId: saigon:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: saigon:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: saigon:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: saigon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 3
        - spaceId: hue:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: hue:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: qui-nhon:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: qui-nhon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: cam-ranh:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: cam-ranh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: an-loc:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: an-loc:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: can-tho:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: can-tho:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: da-nang:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: da-nang:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kontum:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: kontum:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: binh-dinh:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: quang-nam:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: quang-nam:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: tay-ninh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
          status:
            tunnel: tunneled
        - spaceId: tay-ninh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: phu-bon-phu-yen:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: khanh-hoa:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kien-hoa-vinh-binh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: ba-xuyen:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kien-phong:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 3
        - spaceId: central-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: central-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 3
        - spaceId: southern-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: southern-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 3
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 3
  - id: fitl-scenario-short
    kind: scenario
    payload:
      mapAssetId: fitl-map-production
      pieceCatalogAssetId: fitl-piece-catalog-production
      scenarioName: Short
      yearRange: 1965-1967
      deckComposition:
        materializationStrategy: pile-coup-mix-v1
        pileCount: 3
        eventsPerPile: 8
        coupsPerPile: 1
        excludedCardTags:
          - pivotal
        excludedCardIds:
          - card-129
        pileFilters:
          - piles: [1, 2, 3]
            metadataEquals: { period: "1965" }
      outOfPlay:
        - pieceTypeId: us-troops
          seat: us
          count: 6
        - pieceTypeId: arvn-troops
          seat: arvn
          count: 10
        - pieceTypeId: arvn-rangers
          seat: arvn
          count: 3
      seatPools:
        - seat: us
          availableZoneId: available-US:none
          outOfPlayZoneId: out-of-play-US:none
        - seat: arvn
          availableZoneId: available-ARVN:none
          outOfPlayZoneId: out-of-play-ARVN:none
        - seat: nva
          availableZoneId: available-NVA:none
        - seat: vc
          availableZoneId: available-VC:none
      initializations:
        - markerId: activeLeader
          state: youngTurks
        - markerId: cap_aaa
          state: shaded
        - trackId: aid
          value: 15
        - trackId: patronage
          value: 18
        - trackId: trail
          value: 2
        - trackId: totalEcon
          value: 15
        - trackId: vcResources
          value: 10
        - trackId: nvaResources
          value: 15
        - trackId: arvnResources
          value: 30
        - trackId: leaderBoxCardCount
          value: 2
        - spaceId: da-nang:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: kontum:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: saigon:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: can-tho:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: binh-dinh:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: an-loc:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: qui-nhon:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: cam-ranh:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: binh-tuy-binh-thuan:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: quang-tri-thua-thien:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: quang-duc-long-khanh:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: tay-ninh:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-phong:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-giang-an-xuyen:none
          markerId: supportOpposition
          state: activeOpposition
      initialPlacements:
        - spaceId: da-nang:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: da-nang:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kontum:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: kontum:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: saigon:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: saigon:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: saigon:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 4
        - spaceId: saigon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: saigon:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: can-tho:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: can-tho:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: can-tho:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 4
        - spaceId: can-tho:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: can-tho:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: arvn-bases
          seat: arvn
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 4
        - spaceId: quang-nam:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: quang-nam:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: us-troops
          seat: us
          count: 4
        - spaceId: binh-dinh:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: binh-dinh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: khanh-hoa:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: khanh-hoa:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: hue:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: kien-hoa-vinh-binh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: ba-xuyen:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: an-loc:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: qui-nhon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: cam-ranh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: tay-ninh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
          status:
            tunnel: tunneled
        - spaceId: tay-ninh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: tay-ninh:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: kien-phong:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: north-vietnam:none
          pieceTypeId: nva-bases
          seat: nva
          count: 2
        - spaceId: north-vietnam:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-troops
          seat: nva
          count: 6
        - spaceId: southern-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 2
        - spaceId: southern-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: southern-laos:none
          pieceTypeId: nva-troops
          seat: nva
          count: 6
        - spaceId: central-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: central-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: the-fishhook:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: the-fishhook:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
  - id: fitl-scenario-medium
    kind: scenario
    payload:
      mapAssetId: fitl-map-production
      pieceCatalogAssetId: fitl-piece-catalog-production
      scenarioName: Medium
      yearRange: 1968-1972
      deckComposition:
        materializationStrategy: pile-coup-mix-v1
        pileCount: 3
        eventsPerPile: 12
        coupsPerPile: 1
        excludedCardTags:
          - pivotal
        pileFilters:
          - piles: [1, 2, 3]
            metadataEquals: { period: "1968" }
      cardPlacements:
        - cardId: card-121
          zoneId: leader:none
        - cardId: card-122
          zoneId: leader:none
        - cardId: card-123
          zoneId: leader:none
        - cardId: card-124
          zoneId: leader:none
      outOfPlay:
        - pieceTypeId: us-troops
          seat: us
          count: 5
        - pieceTypeId: arvn-troops
          seat: arvn
          count: 10
        - pieceTypeId: arvn-rangers
          seat: arvn
          count: 3
      seatPools:
        - seat: us
          availableZoneId: available-US:none
          outOfPlayZoneId: out-of-play-US:none
        - seat: arvn
          availableZoneId: available-ARVN:none
          outOfPlayZoneId: out-of-play-ARVN:none
        - seat: nva
          availableZoneId: available-NVA:none
        - seat: vc
          availableZoneId: available-VC:none
      initializations:
        - markerId: activeLeader
          state: ky
        - markerId: cap_aaa
          state: shaded
        - markerId: cap_mainForceBns
          state: shaded
        - markerId: cap_sa2s
          state: shaded
        - markerId: cap_searchAndDestroy
          state: shaded
        - markerId: cap_arcLight
          state: unshaded
        - markerId: cap_m48Patton
          state: unshaded
        - trackId: aid
          value: 30
        - trackId: patronage
          value: 15
        - trackId: trail
          value: 3
        - trackId: totalEcon
          value: 15
        - trackId: vcResources
          value: 15
        - trackId: nvaResources
          value: 20
        - trackId: arvnResources
          value: 30
        - trackId: leaderBoxCardCount
          value: 3
        - spaceId: binh-dinh:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: pleiku-darlac:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: khanh-hoa:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: saigon:none
          markerId: supportOpposition
          state: activeSupport
        - spaceId: quang-tri-thua-thien:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: hue:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: da-nang:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: qui-nhon:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: cam-ranh:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: quang-tin-quang-ngai:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: kontum:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: phu-bon-phu-yen:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: can-tho:none
          markerId: supportOpposition
          state: passiveSupport
        - spaceId: quang-nam:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: tay-ninh:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-giang-an-xuyen:none
          markerId: supportOpposition
          state: activeOpposition
        - spaceId: kien-phong:none
          markerId: supportOpposition
          state: passiveOpposition
        - spaceId: kien-hoa-vinh-binh:none
          markerId: supportOpposition
          state: passiveOpposition
        - spaceId: ba-xuyen:none
          markerId: supportOpposition
          state: passiveOpposition
      initialPlacements:
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: us-troops
          seat: us
          count: 4
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 3
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: quang-tri-thua-thien:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 3
        - spaceId: quang-nam:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: quang-nam:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: hue:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: hue:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: da-nang:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: da-nang:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: qui-nhon:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: qui-nhon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: cam-ranh:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: cam-ranh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: quang-tin-quang-ngai:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kontum:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: kontum:none
          pieceTypeId: us-troops
          seat: us
          count: 1
        - spaceId: kontum:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: binh-dinh:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-dinh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: pleiku-darlac:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: pleiku-darlac:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: khanh-hoa:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: khanh-hoa:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: khanh-hoa:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: khanh-hoa:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: khanh-hoa:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: phu-bon-phu-yen:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: phu-bon-phu-yen:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: phu-bon-phu-yen:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: phu-bon-phu-yen:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 3
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: binh-tuy-binh-thuan:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: saigon:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: saigon:none
          pieceTypeId: us-troops
          seat: us
          count: 2
        - spaceId: saigon:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 1
        - spaceId: saigon:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: saigon:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 4
        - spaceId: saigon:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: saigon:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: quang-duc-long-khanh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: phuoc-long:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
        - spaceId: phuoc-long:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 2
        - spaceId: phuoc-long:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: tay-ninh:none
          pieceTypeId: us-bases
          seat: us
          count: 1
        - spaceId: tay-ninh:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: tay-ninh:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: tay-ninh:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: tay-ninh:none
          pieceTypeId: vc-bases
          seat: vc
          count: 1
          status:
            tunnel: tunneled
        - spaceId: tay-ninh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 3
        - spaceId: tay-ninh:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: an-loc:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 1
        - spaceId: an-loc:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 2
        - spaceId: can-tho:none
          pieceTypeId: us-troops
          seat: us
          count: 3
        - spaceId: can-tho:none
          pieceTypeId: us-irregulars
          seat: us
          count: 1
        - spaceId: can-tho:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: can-tho:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kien-phong:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kien-phong:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: kien-hoa-vinh-binh:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: kien-hoa-vinh-binh:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: ba-xuyen:none
          pieceTypeId: arvn-police
          seat: arvn
          count: 1
        - spaceId: ba-xuyen:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: arvn-bases
          seat: arvn
          count: 1
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: arvn-troops
          seat: arvn
          count: 2
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: arvn-rangers
          seat: arvn
          count: 1
        - spaceId: kien-giang-an-xuyen:none
          pieceTypeId: vc-guerrillas
          seat: vc
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: north-vietnam:none
          pieceTypeId: nva-troops
          seat: nva
          count: 9
        - spaceId: central-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: central-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 1
        - spaceId: central-laos:none
          pieceTypeId: nva-troops
          seat: nva
          count: 9
        - spaceId: southern-laos:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: southern-laos:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: northeast-cambodia:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: northeast-cambodia:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: the-fishhook:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: the-fishhook:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: the-parrots-beak:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
        - spaceId: sihanoukville:none
          pieceTypeId: nva-bases
          seat: nva
          count: 1
        - spaceId: sihanoukville:none
          pieceTypeId: nva-guerrillas
          seat: nva
          count: 2
```

```yaml
zoneVars:
  - name: terrorCount
    type: int
    init: 0
    min: 0
    max: 15
```

# Fire in the Lake Production Game Data (Scaffold)

```yaml
metadata:
  id: fire-in-the-lake
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
  - id: fitl-scenario-production
    kind: scenario
    payload: {}
```

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
          adjacentTo: []
        - id: da-nang:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: kontum:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: qui-nhon:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: cam-ranh:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: an-loc:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: saigon:none
          spaceType: city
          population: 6
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: can-tho:none
          spaceType: city
          population: 1
          econ: 0
          terrainTags: []
          country: southVietnam
          coastal: false
          adjacentTo: []
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
          adjacentTo: []
        - id: southern-laos:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: laos
          coastal: false
          adjacentTo: []
        - id: northeast-cambodia:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: []
        - id: the-fishhook:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: []
        - id: the-parrots-beak:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: false
          adjacentTo: []
        - id: sihanoukville:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: cambodia
          coastal: true
          adjacentTo: []
        - id: north-vietnam:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [highland]
          country: northVietnam
          coastal: true
          adjacentTo: []
        - id: quang-tri-thua-thien:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: quang-nam:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: quang-tin-quang-ngai:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: binh-dinh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: pleiku-darlac:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: phu-bon-phu-yen:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: khanh-hoa:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [highland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: phuoc-long:none
          spaceType: province
          population: 0
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: quang-duc-long-khanh:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: binh-tuy-binh-thuan:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: tay-ninh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [jungle]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: kien-phong:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: kien-hoa-vinh-binh:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: ba-xuyen:none
          spaceType: province
          population: 1
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: kien-giang-an-xuyen:none
          spaceType: province
          population: 2
          econ: 0
          terrainTags: [lowland]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-hue-khe-sanh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-hue-da-nang:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-da-nang-dak-to:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-da-nang-qui-nhon:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-kontum-dak-to:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-kontum-qui-nhon:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-kontum-ban-me-thuot:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-qui-nhon-cam-ranh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-cam-ranh-da-lat:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-ban-me-thuot-da-lat:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-saigon-cam-ranh:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-saigon-da-lat:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-saigon-an-loc-ban-me-thuot:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [highway]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-saigon-can-tho:none
          spaceType: loc
          population: 0
          econ: 2
          terrainTags: [mekong]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-can-tho-chau-doc:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [mekong]
          country: southVietnam
          coastal: false
          adjacentTo: []
        - id: loc-can-tho-bac-lieu:none
          spaceType: loc
          population: 0
          econ: 0
          terrainTags: [mekong]
          country: southVietnam
          coastal: true
          adjacentTo: []
        - id: loc-can-tho-long-phu:none
          spaceType: loc
          population: 0
          econ: 1
          terrainTags: [mekong]
          country: southVietnam
          coastal: true
          adjacentTo: []
  - id: fitl-piece-catalog-production
    kind: pieceCatalog
    payload: {}
  - id: fitl-scenario-production
    kind: scenario
    payload: {}
```

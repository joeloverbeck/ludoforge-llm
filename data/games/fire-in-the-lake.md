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
  - id: fitl-piece-catalog-production
    kind: pieceCatalog
    payload: {}
  - id: fitl-scenario-production
    kind: scenario
    payload: {}
```

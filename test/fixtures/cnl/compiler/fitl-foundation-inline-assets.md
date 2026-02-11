# FITL Foundation Inline Assets Fixture

```yaml
metadata:
  id: fitl-foundation-inline-assets
  players:
    min: 2
    max: 2
dataAssets:
  - id: fitl-map-foundation
    kind: map
    payload:
      spaces:
        - id: hue:none
          spaceType: city
          population: 1
          econ: 1
          terrainTags: [urban]
          country: south-vietnam
          coastal: true
          adjacentTo: [quang-tri:none]
        - id: quang-tri:none
          spaceType: province
          population: 1
          econ: 1
          terrainTags: [lowland]
          country: south-vietnam
          coastal: true
          adjacentTo: [hue:none]
  - id: fitl-piece-catalog-foundation
    kind: pieceCatalog
    payload:
      pieceTypes:
        - id: vc-guerrilla
          faction: vc
          statusDimensions: [activity]
          transitions:
            - dimension: activity
              from: underground
              to: active
      inventory:
        - pieceTypeId: vc-guerrilla
          faction: vc
          total: 30
  - id: fitl-scenario-foundation
    kind: scenario
    payload:
      mapAssetId: fitl-map-foundation
      pieceCatalogAssetId: fitl-piece-catalog-foundation
turnStructure:
  phases:
    - id: main
  activePlayerOrder: roundRobin
actions:
  - id: pass
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
endConditions:
  - when:
      op: "=="
      left: 1
      right: 1
    result:
      type: draw
```

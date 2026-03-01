# Compiler Embedded Asset Malformed Fixture

```yaml
metadata:
  id: embedded-assets-malformed
  players:
    min: 2
    max: 2
dataAssets:
  - id: fitl-map-foundation
    kind: map
    payload:
      spaces:
        - id: alpha:none
          category: province
          attributes:
            population: 1
            econ: 1
            terrainTags: [lowland]
            country: south-vietnam
            coastal: false
          adjacentTo: []
  - id: fitl-pieces-foundation
    kind: pieceCatalog
    payload:
      pieceTypes: []
      inventory: []
  - id: fitl-scenario-invalid
    kind: scenario
    payload:
      mapAssetId: fitl-map-missing
      pieceCatalogAssetId: fitl-pieces-missing
turnStructure:
  phases:
    - id: main
  actions:
  - id: pass
    actor: active
    executor: actor
    phase: [main]
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
terminal:
  conditions:
    - when: { op: "==", left: 1, right: 1 }
      result: { type: draw }
zones:
  - id: fallback:none
    owner: none
    visibility: public
    ordering: set
```

# Generic Control - Content Data Assets

```yaml
dataAssets:
  - id: generic-control-board
    kind: map
    payload:
      spaces:
        - id: north:none
          category: control-zone
          attributes:
            lane: north
          adjacentTo:
            - to: center:none
        - id: center:none
          category: control-zone
          attributes:
            lane: center
          adjacentTo:
            - to: north:none
            - to: south:none
        - id: south:none
          category: control-zone
          attributes:
            lane: south
          adjacentTo:
            - to: center:none

  - id: generic-control-pieces
    kind: pieceCatalog
    payload:
      pieceTypes:
        - id: left-marker
          seat: left
          statusDimensions: []
          transitions: []
        - id: right-marker
          seat: right
          statusDimensions: []
          transitions: []
      inventory:
        - pieceTypeId: left-marker
          seat: left
          total: 1
        - pieceTypeId: right-marker
          seat: right
          total: 1

  - id: generic-control-seats
    kind: seatCatalog
    payload:
      seats:
        - id: left
        - id: right

  - id: generic-control-standard
    kind: scenario
    payload:
      mapAssetId: generic-control-board
      pieceCatalogAssetId: generic-control-pieces
      seatPools:
        - seat: left
          availableZoneId: reserve:0
          outOfPlayZoneId: reserve:0
        - seat: right
          availableZoneId: reserve:1
          outOfPlayZoneId: reserve:1
      scenarioName: Standard Generic Control
      yearRange: timeless
```

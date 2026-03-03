# Texas Hold'em - Content Data Assets

```yaml
dataAssets:
  - id: standard-52-deck
    kind: pieceCatalog
    payload:
      pieceTypes:
        - generate:
            idPattern: 'card-{rankAbbrev}{suitAbbrev}'
            seat: neutral
            statusDimensions: []
            transitions: []
            dimensions:
              - name: suitAbbrev
                values: ['S', 'H', 'D', 'C']
              - name: rankAbbrev
                values: [2, 3, 4, 5, 6, 7, 8, 9, 'T', 'J', 'Q', 'K', 'A']
            derivedProps:
              rank:
                from: rankAbbrev
                map:
                  '2': 2
                  '3': 3
                  '4': 4
                  '5': 5
                  '6': 6
                  '7': 7
                  '8': 8
                  '9': 9
                  'T': 10
                  'J': 11
                  'Q': 12
                  'K': 13
                  'A': 14
              suit:
                from: suitAbbrev
                map:
                  'S': 0
                  'H': 1
                  'D': 2
                  'C': 3
              rankName:
                from: rankAbbrev
                map:
                  '2': '2'
                  '3': '3'
                  '4': '4'
                  '5': '5'
                  '6': '6'
                  '7': '7'
                  '8': '8'
                  '9': '9'
                  'T': 'Ten'
                  'J': 'Jack'
                  'Q': 'Queen'
                  'K': 'King'
                  'A': 'Ace'
              suitName:
                from: suitAbbrev
                map:
                  'S': 'Spades'
                  'H': 'Hearts'
                  'D': 'Diamonds'
                  'C': 'Clubs'
            inventoryPerCombination: 1
      inventory: []
  - id: standard-seat-catalog
    kind: seatCatalog
    payload:
      seats:
        - id: neutral
  - id: tournament-standard
    kind: scenario
    tableContracts:
      - tablePath: settings.blindSchedule
        uniqueBy:
          - - level
        constraints:
          - kind: monotonic
            field: level
            direction: asc
          - kind: contiguousInt
            field: level
            start: 0
            step: 1
          - kind: numericRange
            field: handsUntilNext
            min: 1
    payload:
      pieceCatalogAssetId: standard-52-deck
      seatPools:
        - seat: neutral
          availableZoneId: deck:none
          outOfPlayZoneId: muck:none
      scenarioName: Standard NLHE Tournament
      yearRange: timeless
      settings:
        startingChips: 1000
        blindSchedule:
          - level: 0
            sb: 10
            bb: 20
            ante: 0
            handsUntilNext: 10
          - level: 1
            sb: 15
            bb: 30
            ante: 0
            handsUntilNext: 10
          - level: 2
            sb: 25
            bb: 50
            ante: 5
            handsUntilNext: 10
          - level: 3
            sb: 50
            bb: 100
            ante: 10
            handsUntilNext: 8
          - level: 4
            sb: 75
            bb: 150
            ante: 15
            handsUntilNext: 8
          - level: 5
            sb: 100
            bb: 200
            ante: 25
            handsUntilNext: 6
          - level: 6
            sb: 150
            bb: 300
            ante: 50
            handsUntilNext: 6
          - level: 7
            sb: 200
            bb: 400
            ante: 50
            handsUntilNext: 5
          - level: 8
            sb: 300
            bb: 600
            ante: 75
            handsUntilNext: 5
          - level: 9
            sb: 500
            bb: 1000
            ante: 100
            handsUntilNext: 5
```

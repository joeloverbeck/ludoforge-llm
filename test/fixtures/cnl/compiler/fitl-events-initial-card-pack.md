# FITL Initial Event Card Pack Fixture

```yaml
metadata:
  id: fitl-events-initial-card-pack
  players:
    min: 2
    max: 2
dataAssets:
  - id: fitl-events-initial-card-pack
    kind: eventCardSet
    payload:
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
                  - op: addTrack
                    track: arvnResources
                    delta: 9
                    clamp: { min: 0, max: 75 }
                  - op: addTrack
                    track: aid
                    delta: 9
                    clamp: { min: 0, max: 75 }
              - id: return-from-out-of-play
                order: 1
                targets:
                  - id: us-out-of-play
                    selector:
                      query: piecesInPool
                      pool: outOfPlay
                      filters:
                        faction: us
                    cardinality: { max: 3 }
                  - id: arvn-out-of-play
                    selector:
                      query: piecesInPool
                      pool: outOfPlay
                      filters:
                        faction: arvn
                    cardinality: { max: 6 }
                effects:
                  - op: chooseOneTargetSet
                    options: [us-out-of-play, arvn-out-of-play]
                  - op: moveSelectedToPool
                    toPool: available
          shaded:
            targets:
              - id: us-troops-available
                selector:
                  query: piecesInPool
                  pool: available
                  filters:
                    faction: us
                    pieceType: troop
                cardinality: { max: 3 }
            effects:
              - op: moveSelectedToPool
                toPool: outOfPlay
              - op: addTrack
                track: aid
                delta: -9
                clamp: { min: 0, max: 75 }
        - id: card-27
          title: Phoenix Program
          sideMode: dual
          order: 27
          unshaded:
            targets:
              - id: vc-in-coin-control
                selector:
                  query: piecesInSpaces
                  orderBy: [spaceIdAsc, pieceIdAsc]
                  filters:
                    faction: vc
                    coinControl: true
                    allowTunneledBaseRemoval: false
                cardinality: { max: 3 }
            effects:
              - op: removeSelectedPieces
          shaded:
            targets:
              - id: terror-spaces
                selector:
                  query: spaces
                  orderBy: [spaceIdAsc]
                  filters:
                    coinControl: true
                    hasFactionPieces: vc
                    excludeIds: [saigon:none]
                cardinality: { max: 2 }
            effects:
              - op: addTerrorToSelectedSpaces
              - op: setSupportOpposition
                to: activeOpposition
```

```yaml
zones:
  - id: board:none
    owner: none
    visibility: public
    ordering: set
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
  - when: { op: "==", left: 1, right: 1 }
    result: { type: draw }
```

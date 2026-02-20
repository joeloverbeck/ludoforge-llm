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
          category: city
          attributes:
            population: 1
            econ: 1
            terrainTags: [urban]
            country: south-vietnam
            coastal: true
          adjacentTo: [{ to: quang-tri:none }]
        - id: quang-tri:none
          category: province
          attributes:
            population: 1
            econ: 1
            terrainTags: [lowland]
            country: south-vietnam
            coastal: true
          adjacentTo: [{ to: hue:none }]
  - id: fitl-piece-catalog-foundation
    kind: pieceCatalog
    payload:
      factions:
        - id: vc
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
  globalVars:
  - name: insurgentPassReward
    type: int
    init: 0
    min: 0
    max: 99
  - name: coinPassReward
    type: int
    init: 0
    min: 0
    max: 99
turnFlow:
  cardLifecycle:
    played: hue:none
    lookahead: quang-tri:none
    leader: hue:none
  eligibility:
    factions: ["0", "1", "2", "3"]
    overrideWindows:
      - id: remain-eligible
        duration: nextTurn
      - id: force-ineligible
        duration: nextTurn
  optionMatrix:
    - first: event
      second: [operation, operationPlusSpecialActivity]
    - first: operation
      second: [limitedOperation]
    - first: operationPlusSpecialActivity
      second: [limitedOperation, event]
  passRewards:
    - factionClass: "0"
      resource: insurgentPassReward
      amount: 1
    - factionClass: "1"
      resource: coinPassReward
      amount: 3
  durationWindows: [turn, nextTurn, round, cycle]
  monsoon:
    restrictedActions:
      - actionId: sweep
      - actionId: march
      - actionId: airLift
        maxParam:
          name: spaces
          max: 2
      - actionId: airStrike
        maxParam:
          name: spaces
          max: 2
    blockPivotal: true
    pivotalOverrideToken: monsoonPivotalAllowed
  pivotal:
    actionIds: [pivotalEvent]
    requirePreActionWindow: true
    interrupt:
      precedence: ["0", "1", "2", "3"]
      cancellation:
        - winner: { actionId: pivotalEvent }
          canceled: { actionId: pivotalEvent, paramEquals: { side: shaded } }
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
    - when:
        op: "=="
        left: 1
        right: 1
      result:
        type: draw
```

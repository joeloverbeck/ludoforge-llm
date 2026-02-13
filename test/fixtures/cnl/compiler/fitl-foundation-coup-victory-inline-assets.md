# FITL Foundation Coup/Victory Inline Assets Fixture

```yaml
metadata:
  id: fitl-foundation-coup-victory-inline-assets
  players:
    min: 2
    max: 2
dataAssets:
  - id: fitl-map-foundation-coup
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
  - id: fitl-piece-catalog-foundation-coup
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
  - id: fitl-scenario-foundation-coup
    kind: scenario
    payload:
      mapAssetId: fitl-map-foundation-coup
      pieceCatalogAssetId: fitl-piece-catalog-foundation-coup
globalVars:
  - name: isFinalCoup
    type: int
    init: 0
    min: 0
    max: 1
  - name: usSupport
    type: int
    init: 50
    min: 0
    max: 75
  - name: usMargin
    type: int
    init: 2
    min: -99
    max: 99
  - name: nvaMargin
    type: int
    init: 4
    min: -99
    max: 99
turnStructure:
  phases:
    - id: main
turnOrder:
  type: cardDriven
  config:
    turnFlow:
      cardLifecycle:
        played: hue:none
        lookahead: quang-tri:none
        leader: hue:none
      eligibility:
        factions: [us, nva]
        overrideWindows: []
      optionMatrix: []
      passRewards: []
      durationWindows: [card, nextCard, coup, campaign]
    coupPlan:
      phases:
        - id: victory
          steps: [check-thresholds]
        - id: resources
          steps: [compute-income]
      finalRoundOmitPhases: [resources]
      maxConsecutiveRounds: 1
victory:
  checkpoints:
    - id: us-threshold
      faction: us
      timing: duringCoup
      when:
        op: ">"
        left:
          ref: gvar
          var: usSupport
        right: 50
    - id: final-coup
      faction: us
      timing: finalCoup
      when:
        op: "=="
        left:
          ref: gvar
          var: isFinalCoup
        right: 1
  margins:
    - faction: us
      value:
        ref: gvar
        var: usMargin
    - faction: nva
      value:
        ref: gvar
        var: nvaMargin
  ranking:
    order: desc
actions:
  - id: pass
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects: []
    limits: []
  - id: boostSupport
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - addVar:
          scope: global
          var: usSupport
          delta: 1
    limits: []
  - id: markFinalCoup
    actor: active
    phase: main
    params: []
    pre: null
    cost: []
    effects:
      - setVar:
          scope: global
          var: isFinalCoup
          value: 1
    limits: []
endConditions:
  - when:
      op: "=="
      left: 0
      right: 1
    result:
      type: draw
```

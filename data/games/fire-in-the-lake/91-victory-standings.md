# Fire in the Lake - Victory Standings

```yaml
victoryStandings:
  seatGroupConfig:
    coinSeats: ['US', 'ARVN']
    insurgentSeats: ['NVA', 'VC']
    soloSeat: 'NVA'
    seatProp: 'faction'
  markerName: 'supportOpposition'
  defaultMarkerState: 'neutral'
  markerConfigs:
    support:
      activeState: 'activeSupport'
      passiveState: 'passiveSupport'
    opposition:
      activeState: 'activeOpposition'
      passiveState: 'passiveOpposition'
  tieBreakOrder: ['vc', 'arvn', 'nva', 'us']
  entries:
    - seat: 'us'
      threshold: 50
      formula:
        type: 'markerTotalPlusZoneCount'
        markerConfig: 'support'
        countZone: 'available-US:none'
        countTokenTypes: ['us-troops', 'us-bases']
    - seat: 'arvn'
      threshold: 50
      formula:
        type: 'controlledPopulationPlusGlobalVar'
        controlFn: 'coin'
        varName: 'patronage'
    - seat: 'nva'
      threshold: 18
      formula:
        type: 'controlledPopulationPlusMapBases'
        controlFn: 'solo'
        baseSeat: 'NVA'
        basePieceTypes: ['nva-bases']
    - seat: 'vc'
      threshold: 35
      formula:
        type: 'markerTotalPlusMapBases'
        markerConfig: 'opposition'
        baseSeat: 'VC'
        basePieceTypes: ['vc-bases']
```

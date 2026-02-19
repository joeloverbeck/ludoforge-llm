# Texas Hold'em - Metadata

```yaml
metadata:
  id: texas-holdem-nlhe-tournament
  players:
    min: 2
    max: 10
  cardAnimation:
    cardTokenTypes:
      idPrefixes: [card-]
    zoneRoles:
      draw: [deck]
      hand: [hand]
      shared: [community]
      burn: [burn]
      discard: [muck]
  defaultScenarioAssetId: tournament-standard
  maxTriggerDepth: 5
```

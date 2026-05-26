# Generic Control - Vocabulary

```yaml
zones:
  - id: reserve
    zoneKind: aux
    owner: player
    visibility: public
    ordering: set

globalVars:
  - name: round
    type: int
    init: 0
    min: 0
    max: 6

perPlayerVars:
  - name: controlScore
    type: int
    init: 0
    min: 0
    max: 6

zoneVars:
  - name: controller
    type: int
    init: -1
    min: -1
    max: 1
```

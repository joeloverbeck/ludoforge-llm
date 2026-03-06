# Fire in the Lake - Verbalization

```yaml
verbalization:
  labels:
    usTroops: { singular: "US Troop", plural: "US Troops" }
    arvnTroops: { singular: "ARVN Troop", plural: "ARVN Troops" }
    nvaTroops: { singular: "NVA Troop", plural: "NVA Troops" }
    nvaGuerrillas: { singular: "NVA Guerrilla", plural: "NVA Guerrillas" }
    vcGuerrillas: { singular: "VC Guerrilla", plural: "VC Guerrillas" }
    saigon: "Saigon"
    aid: "Aid"
    totalEcon: "Total Econ"

  stages:
    selectSpaces: "Select target spaces"

  macros:
    trainUs:
      class: operation
      summary: "Place US forces and build support"

  sentencePlans:
    addVar:
      aid:
        "+3": "Add 3 Aid"
        "-3": "Remove 3 Aid"

  suppressPatterns:
    - "*Count"
    - "*Tracker"
    - "__*"
```

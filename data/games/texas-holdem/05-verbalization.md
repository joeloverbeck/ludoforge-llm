# Texas Hold'em - Verbalization

```yaml
verbalization:
  labels:
    pot: "Pot"
    chips: "Chips"
    communityCards: "Community Cards"

  stages:
    betting: "Betting round"

  macros:
    dealHoleCards:
      class: deal
      summary: "Deal two hole cards to each player"

  sentencePlans:
    addVar:
      pot:
        "+0": "Check"

  suppressPatterns:
    - "*Count"
    - "__*"
    - "temp*"
```

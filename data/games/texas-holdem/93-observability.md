# Texas Hold'em - Observability

```yaml
observability:
  observers:
    currentPlayer:
      description: "Texas Hold'em player perspective — hidden hands and deck"
      zones:
        hand:
          tokens: owner
          order: owner
        deck:
          tokens: hidden
          order: hidden
        community:
          tokens: public
          order: public
        burn:
          tokens: hidden
          order: hidden
        muck:
          tokens: hidden
          order: hidden
```

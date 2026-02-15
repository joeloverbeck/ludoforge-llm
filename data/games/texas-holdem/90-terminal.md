# Texas Hold'em - Terminal

```yaml
terminal:
  conditions:
    - when: { op: '==', left: { ref: gvar, var: activePlayers }, right: 1 }
      result: { type: score }
  scoring:
    method: highest
    value: { ref: pvar, player: active, var: chipStack }
```

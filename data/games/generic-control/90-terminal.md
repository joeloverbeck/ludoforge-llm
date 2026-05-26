# Generic Control - Terminal

```yaml
terminal:
  conditions:
    - when:
        op: ">="
        left: { ref: gvar, var: round }
        right: 4
      result: { type: score }
  scoring:
    method: highest
    value: { ref: pvar, player: actor, var: controlScore }
```

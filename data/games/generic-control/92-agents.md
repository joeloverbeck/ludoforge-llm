# Generic Control - Agents

```yaml
agents:
  library:
    stateFeatures: {}
    candidateAggregates: {}
    considerations:
      preferClaim:
        scopes: [move]
        weight: 100
        value:
          boolToNumber:
            ref: candidate.tag.claim
    tieBreakers:
      stableMoveKey:
        kind: stableMoveKey

  profiles:
    baseline:
      params: {}
      preview:
        mode: disabled
      selection:
        mode: softmaxSample
        temperature: 0.5
      use:
        considerations:
          - preferClaim
        tieBreakers:
          - stableMoveKey

  bindings:
    left: baseline
    right: baseline
```

# Fire in the Lake - Diagnostic Agent Profiles

These profiles are intentionally not imported by `fire-in-the-lake.game-spec.md`.
They are test-owned diagnostics for pinned policy canaries, not production agent
bindings.

```yaml
diagnosticAgents:
  library:
    considerations:
      preferOptionProjectedMargin:
        scopes: [microturn]
        costClass: preview
        weight: 300
        value:
          ref: preview.option.delta.victory.currentMargin.self
        previewFallback:
          onUnavailable: noContribution

  profiles:
    policy-preview-inner-fitl-canary:
      extends: arvn-evolved
      observer: currentPlayer
      preview:
        mode: exactWorld
        completion: policyGuided
        fallbackCompletionPolicy: fail
        inner:
          chooseOne: true
          chooseNStep: false
          maxOptions: 8
          chooseNBeamWidth: 1
          depthCap: 4
      use:
        considerations:
          - preferOptionProjectedMargin
```

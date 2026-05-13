# Spec 169 Demonstration Profile

Demonstration profile for Spec 169. NOT for campaign use. Validates that
`schedule.distance.toBoundary.coupEntry.cards` follows the live FITL hidden-deck
fallback contract.

```yaml
sandboxAgents:
  library:
    considerations:
      preferGovernEarlyInCoupCycle:
        scopes: [move]
        costClass: state
        weight: 250
        when:
          ref: candidate.tag.govern
        value:
          ref: schedule.distance.toBoundary.coupEntry.cards
        scheduleFallback:
          onUnavailable: noContribution

  profiles:
    spec-169-schedule-demo:
      extends: arvn-evolved
      observer: currentPlayer
      use:
        considerations:
          - preferGovernEarlyInCoupCycle
```

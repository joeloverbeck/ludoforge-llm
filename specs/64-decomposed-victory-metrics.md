# Spec 64: Decomposed Victory Margin Metrics

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: None
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

Agent profiles currently see victory margin as a single composite number
(e.g., ARVN margin = COIN-Controlled Population + Patronage - 50). The
agent cannot distinguish "margin is low because Patronage is low" from
"margin is low because COIN control is low." These require different
remedies (Govern for Patronage, Train/Patrol for control), but the agent
treats them identically because only the composite is visible.

This spec adds support for declaring derived observability metrics in
GameSpecDoc that decompose the victory formula into individually
addressable components. The agent policy DSL already supports
`ref: metric.<id>` and `ref: preview.metric.<id>` --- the missing piece
is the game data declaring these metrics.

## Problem Statement

ARVN's victory formula: `COIN-Controlled Population + Patronage > 50`.

The agent sees `victory.currentMargin.self` = composite - 50. When this
is -15, the agent doesn't know whether Patronage is 10 (needs Govern) or
COIN-Controlled Pop is 10 (needs Train/Patrol). Both produce margin -15
but require opposite strategies.

The DSL cookbook documents `ref: metric.<id>` as an available reference
path, but FITL declares no derived metrics. The agent policy DSL already
supports conditional scoring via `when` clauses referencing metrics:

```yaml
governWhenPatronageLow:
  scopes: [move]
  when:
    lt: [{ ref: metric.patronage }, 20]
  weight: 8
  value:
    boolToNumber: { ref: candidate.tag.govern }
```

But `metric.patronage` doesn't exist because the game spec doesn't
declare it.

## Proposed Changes

### A. FITL observability metrics (Tier 4 game spec)

Add to `data/games/fire-in-the-lake/91-observability.md` (or a new
metrics section):

```yaml
observability:
  metrics:
    patronage:
      expr: { ref: var.player.self.resources }
      visibility: seatVisible
    coinControlledPopulation:
      expr:
        # Sum of population in zones where COIN pieces > insurgent pieces
        # This requires a zone aggregation with control-aware filtering
        globalZoneAgg:
          field: population
          source: attribute
          aggOp: sum
          zoneFilter:
            variable:
              coinControl: { gt: 0 }
      visibility: public
```

The exact expressions depend on how COIN-controlled population is
computed in the current FITL spec. This may require a new zone variable
(`coinControl`) that tracks the COIN vs insurgent piece balance, or it
may already exist.

### B. Agent profile conditional strategies (Tier 1 YAML)

Once the metrics exist, the evolved ARVN profile can use them:

```yaml
stateFeatures:
  patronage:
    type: number
    expr: { ref: metric.patronage }
  coinControlPop:
    type: number
    expr: { ref: metric.coinControlledPopulation }

considerations:
  governWhenPatronageLow:
    scopes: [move]
    when:
      lt: [{ ref: feature.patronage }, 20]
    weight: 8
    value:
      boolToNumber: { ref: candidate.tag.govern }
  trainWhenControlLow:
    scopes: [move]
    when:
      lt: [{ ref: feature.coinControlPop }, 25]
    weight: 5
    value:
      boolToNumber: { ref: candidate.tag.train }
```

### C. Preview support for metrics

The preview system already supports `ref: preview.metric.<id>`. No
engine changes needed --- just declaring the metrics in the game spec
makes them available to preview evaluation.

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: Derived metrics are declared in GameSpecDoc,
  not in engine code. The metric expression language is the same generic
  expression system used everywhere. No ARVN-specific engine logic.
- **#2 Evolution-First Design**: Metrics declared in GameSpecDoc are
  available to the evolution pipeline. The agent can build conditional
  strategies based on decomposed victory components.
- **#7 Specs Are Data**: Metrics are declarative expressions, not
  executable code.
- **#4 Authoritative State**: Metrics are projections of the authoritative
  state, respecting visibility rules.

## Acceptance Criteria

1. FITL game spec declares at least `patronage` and
   `coinControlledPopulation` as observability metrics.
2. Agent profiles can reference `ref: metric.patronage` and
   `ref: preview.metric.patronage` in state features and considerations.
3. The decomposed metrics appear in agent decision traces
   (via stateFeatures that reference them).
4. Existing profiles and tests are unaffected (metrics are additive).

## Open Questions

1. Does the FITL game spec already have a zone variable that tracks
   COIN vs insurgent piece balance? If not, is a new zone variable
   needed, or can it be computed via `globalZoneAgg` with token filters?
2. Is `var.player.self.resources` the correct reference for ARVN
   Patronage, or is Patronage a separate variable? (Need to verify
   against the FITL game spec.)

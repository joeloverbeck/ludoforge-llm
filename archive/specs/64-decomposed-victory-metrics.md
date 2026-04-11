# Spec 64: Decomposed Victory Margin Metrics

**Status**: COMPLETED
**Priority**: P2
**Complexity**: S
**Dependencies**: None
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

Agent profiles currently see victory margin as a single composite number
(e.g., ARVN margin = COIN-Controlled Population + Patronage - 50). The
agent cannot distinguish "margin is low because Patronage is low" from
"margin is low because COIN control is low." These require different
remedies (Govern for Patronage, Train/Patrol for control), but the agent
treats them identically because only the composite is visible.

The engine already has the infrastructure to solve this:

- The compiler auto-synthesizes derived metrics from victory standings
  (e.g., `auto:victory:controlledPopulation:coin` for ARVN's COIN-
  controlled population component).
- The agent DSL supports `ref: metric.<id>` and
  `ref: preview.metric.<id>` for derived metrics.
- Patronage is a global variable accessible via
  `ref: var.global.patronage`.

The missing pieces are purely declarative:

1. The FITL observer profile does not expose derived metrics to agents
   (they default to `hidden` in `compile-observers.ts:45`).
2. The ARVN agent profiles do not declare `stateFeatures` referencing
   the decomposed signals.

## Problem Statement

ARVN's victory formula: `COIN-Controlled Population + Patronage > 50`.

The agent sees `victory.currentMargin.self` = composite - 50. When this
is -15, the agent doesn't know whether Patronage is 10 (needs Govern) or
COIN-Controlled Pop is 10 (needs Train/Patrol). Both produce margin -15
but require opposite strategies.

The decomposed signals already exist in the compiled GameDef:

- `auto:victory:controlledPopulation:coin` — auto-synthesized from the
  ARVN victory standing formula (`synthesize-derived-metrics.ts`).
- `patronage` — a global variable declared via content data assets
  (`data/games/fire-in-the-lake/40-content-data-assets.md:781`).

The DSL cookbook (`docs/agent-dsl-cookbook.md`) documents both
`ref: metric.<id>` and `ref: var.global.<id>` as available reference
paths. But the FITL observer profile does not expose `derivedMetrics`
surfaces (defaulting them to hidden), and the agent profiles don't
reference these signals in their `stateFeatures` or `considerations`.

## Proposed Changes

### A. FITL observer derived-metric visibility

Add `derivedMetrics` surface visibility to
`data/games/fire-in-the-lake/93-observability.md` in the `currentPlayer`
observer profile:

```yaml
observability:
  observers:
    currentPlayer:
      surfaces:
        derivedMetrics:
          _default: public
        # ... existing surfaces unchanged ...
```

This makes all auto-synthesized derived metrics (including
`auto:victory:controlledPopulation:coin`) visible to agents using the
`currentPlayer` observer profile.

### B. Agent profile conditional strategies (Tier 1 YAML)

Once the metrics are visible, the evolved ARVN profile in
`data/games/fire-in-the-lake/92-agents.md` can use them:

```yaml
stateFeatures:
  patronage:
    type: number
    expr: { ref: var.global.patronage }
  coinControlPop:
    type: number
    expr: { ref: metric.auto:victory:controlledPopulation:coin }

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

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: No engine changes. All additions are
  declarative YAML in game-specific data files.
- **#2 Evolution-First Design**: Metrics and variables are in
  GameSpecDoc-governed artifacts. The evolution pipeline can mutate
  agent profiles to build conditional strategies around decomposed
  signals.
- **#4 Authoritative State**: Derived metric visibility is configured
  via the observer profile, respecting the observer contract. Agents
  see only what the observer allows.
- **#7 Specs Are Data**: All additions are declarative YAML — observer
  visibility configuration and agent profile expressions.

## Acceptance Criteria

1. The FITL observer profile in `93-observability.md` exposes
   `derivedMetrics` surfaces to agents (not hidden).
2. ARVN agent profiles declare `stateFeatures` referencing
   `ref: var.global.patronage` and
   `ref: metric.auto:victory:controlledPopulation:coin`.
3. Agent profiles include conditional `considerations` that
   differentiate strategy based on the decomposed components.
4. The decomposed metrics appear in agent decision traces
   (via stateFeatures that reference them).
5. Existing profiles and tests are unaffected (changes are additive).

## Outcome

- Completed: 2026-04-11
- Changed:
  - Exposed synthesized derived metrics to FITL agents through the `currentPlayer` observer profile in `data/games/fire-in-the-lake/93-observability.md`.
  - Added ARVN agent-library stateFeatures for `patronage` and `coinControlPop` plus conditional considerations keyed off those decomposed signals in `data/games/fire-in-the-lake/92-agents.md`.
  - Added production-compilation regression coverage and regenerated the FITL policy/bootstrap artifacts that encode the new observer and policy catalog surfaces.
- Deviations from original plan:
  - The work landed as two implementation tickets rather than one direct spec-only change boundary: `archive/tickets/64DECVICMET-001.md` handled the observer/compiler visibility slice and `archive/tickets/64DECVICMET-002.md` handled the ARVN policy slice.
  - The observer visibility change required generic compiler plumbing so synthesized derived metric ids participate in observer and agent policy surfaces, not just a FITL YAML edit.
- Verification results:
  - `pnpm turbo build`
  - `pnpm -F @ludoforge/runner bootstrap:fixtures`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`

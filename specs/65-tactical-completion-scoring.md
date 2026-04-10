# Spec 65: Tactical Completion Scoring for Coup Sub-Phases

**Status**: Draft
**Priority**: P1
**Complexity**: S
**Dependencies**: None (pure Tier 1 YAML, no engine changes)
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

FITL Coup sub-phase decisions (pacification, redeployment, agitation)
produce massive numbers of candidates with identical scores. In seed
1008, ARVN makes 58 redeployment decisions with 16-17 candidates each,
ALL scoring identically (gap=0). Ties are broken by `stableMoveKey`
(alphabetical zone names), making troop positioning effectively random
with respect to strategic value.

This spec adds completion-scoped and action-scoped considerations to the
FITL agent library that differentiate tactical decisions using zone
properties, adjacency, and token counts. These are pure Tier 1 YAML
changes --- the DSL already supports everything needed.

## Problem Statement

The current ARVN profile has three move-scoped considerations
(`preferProjectedSelfMargin`, `preferStrongNormalizedMargin`,
`preferGovernWeighted`) and one completion-scoped consideration
(`preferPopulousTargets`). None of these differentiate redeployment
targets because:

1. `preferProjectedSelfMargin` evaluates the same projected margin for
   all redeployment-to-zone-X candidates (redeployment doesn't change
   margin until troops interact with the control calculation at the
   next Coup).
2. `preferPopulousTargets` only fires for `chooseN` decisions with
   `targetKind: zone` --- redeployment may use different decision
   names or kinds.
3. No consideration references zone-level properties (population,
   token counts, adjacency to enemies) for redeployment targets.

### Evidence from traces

Seed 1008 (ARVN margin -4, maxTurns):
- 6 strategic decisions, 5 pacify, **58 redeploy**
- All 58 redeploy decisions: gap=0, 16-17 candidates, all tied
- Resolved by `stableMoveKey` (alphabetical zone names)

Seed 1010 (ARVN margin -4, 28 moves):
- 4 strategic, 3 pacify, **64 redeploy**
- avgGap=0.23 (near-zero for redeploy)

## Proposed Changes

### A. Redeployment scoring considerations (library items)

Add to `data/games/fire-in-the-lake/92-agents.md` library:

```yaml
considerations:
  # Prefer redeploying to populous zones (higher population = more
  # COIN-control impact)
  preferRedeployToPopulousZones:
    scopes: [move]
    when:
      or:
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployPolice]
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployMandatory]
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployOptionalTroops]
    weight: 2
    value:
      coalesce:
        - zoneProp:
            zone: { ref: candidate.param.targetSpace }
            prop: population
        - 0

  # Prefer redeploying toward zones with enemy presence
  # (proactive positioning for future Sweep/Assault)
  preferRedeployNearEnemies:
    scopes: [move]
    when:
      or:
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployPolice]
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployMandatory]
        - eq: [{ ref: candidate.actionId }, coupArvnRedeployOptionalTroops]
    weight: 1
    value:
      coalesce:
        - adjacentTokenAgg:
            anchorZone: { ref: candidate.param.targetSpace }
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: VC }
                type: { eq: guerrilla }
        - 0
```

The exact `actionId` values and `candidate.param` names need verification
against the compiled FITL game spec. The pattern above follows the DSL
cookbook's "restrict scoring to a specific action" and "evaluate threat
near target zone" patterns.

### B. Pacification scoring considerations

```yaml
considerations:
  # Prefer pacifying zones with high population (more control impact)
  preferPacifyPopulousZones:
    scopes: [move]
    when:
      eq: [{ ref: candidate.actionId }, coupPacifyARVN]
    weight: 3
    value:
      coalesce:
        - zoneProp:
            zone: { ref: candidate.param.targetSpace }
            prop: population
        - 0
```

### C. Profile updates

Add the new considerations to the `arvn-evolved` profile's `use`
section. All new considerations have `when` guards that restrict them
to specific actionIds, so they don't affect strategic decisions.

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: No engine code changes. All scoring logic
  is expressed in GameSpecDoc YAML using existing DSL operators
  (`zoneProp`, `adjacentTokenAgg`, `when` guards, `candidate.actionId`).
- **#7 Specs Are Data**: Pure declarative considerations.
- **#10 Bounded Computation**: Zone property lookups and adjacent token
  counts are bounded by the finite zone/token graph.

## Acceptance Criteria

1. Redeployment decisions in ARVN traces show non-zero score gaps for
   at least 80% of decisions (vs 0% currently).
2. ARVN troop positioning correlates with zone population and enemy
   proximity (verifiable via trace inspection).
3. No regression in strategic decision quality (Govern/Train selection
   unchanged).
4. All existing tests pass.

## Verification

Run the tournament harness at tier 15 and compare:
- Before: 58+ tied redeploy decisions per seed, gap=0
- After: redeploy decisions differentiated, gap > 0
- compositeScore should improve (or at minimum not regress)

## Open Questions

1. What are the exact `actionId` values for ARVN redeployment actions
   in the compiled FITL spec? (Need to verify `coupArvnRedeployPolice`,
   `coupArvnRedeployMandatory`, `coupArvnRedeployOptionalTroops`.)
2. Does `candidate.param.targetSpace` resolve for redeployment moves,
   or is the zone target encoded differently?
3. Should redeployment scoring also consider the SOURCE zone (prefer
   redeploying FROM zones where COIN already dominates)?

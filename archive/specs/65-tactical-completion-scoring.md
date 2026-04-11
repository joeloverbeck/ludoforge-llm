# Spec 65: Tactical Completion Scoring for Coup Sub-Phases

**Status**: COMPLETED
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

This spec adds completion-scoped and move-scoped considerations to the
FITL agent library that differentiate tactical decisions using zone
properties, adjacency, and token counts. These are pure Tier 1 YAML
changes --- the DSL already supports everything needed.

## Problem Statement

The current ARVN profile has three move-scoped considerations
(`preferProjectedSelfMargin`, `preferStrongNormalizedMargin`,
`preferGovernWeighted`) and one completion-scoped consideration
(`preferPopulousTargets`). None of these differentiate redeployment
targets because:

1. Redeployment actions (`coupArvnRedeployMandatory`,
   `coupArvnRedeployOptionalTroops`, `coupArvnRedeployPolice`) only
   expose `sourceSpace` as an action parameter. The destination zone is
   selected via a `chooseOne: { bind: $destination }` completion inside
   effects (`30-rules-actions.md:678-679`). Move-scoped considerations
   cannot see the destination.
2. `preferPopulousTargets` only fires for `chooseN` decisions with
   `targetKind: zone` --- redeployment uses `chooseOne` with bind name
   `$destination`.
3. No completion-scoped consideration targets the `$destination`
   decision to evaluate zone-level properties (population, token counts,
   adjacency to enemies) for redeployment destinations.

### Evidence from traces

Seed 1008 (ARVN margin -4, maxTurns):
- 6 strategic decisions, 5 pacify, **58 redeploy**
- All 58 redeploy decisions: gap=0, 16-17 candidates, all tied
- Resolved by `stableMoveKey` (alphabetical zone names)

Seed 1010 (ARVN margin -4, 28 moves):
- 4 strategic, 3 pacify, **64 redeploy**
- avgGap=0.23 (near-zero for redeploy)

*Note: Seeds 1008 and 1010 are campaign-analysis observations from the
ARVN evolution campaign. Trace files for these seeds are not committed
to the repository (traces exist up to seed 1002 in
`campaigns/fitl-arvn-agent-evolution/traces/`).*

## Proposed Changes

### A. Redeployment destination scoring (completion-scoped library items)

Add to `data/games/fire-in-the-lake/92-agents.md` library:

```yaml
considerations:
  # Prefer redeploying to populous zones (higher population = more
  # COIN-control impact). Fires on the $destination chooseOne completion
  # inside redeployment actions.
  preferRedeployToPopulousZones:
    scopes: [completion]
    when:
      eq:
        - { ref: decision.name }
        - "$destination"
    weight: 2
    value:
      coalesce:
        - zoneProp:
            zone: { ref: option.value }
            prop: population
        - 0

  # Prefer redeploying toward zones with enemy presence
  # (proactive positioning for future Sweep/Assault).
  # Counts VC guerrillas in zones adjacent to the destination.
  preferRedeployNearEnemies:
    scopes: [completion]
    when:
      eq:
        - { ref: decision.name }
        - "$destination"
    weight: 1
    value:
      coalesce:
        - adjacentTokenAgg:
            anchorZone: { ref: option.value }
            aggOp: count
            tokenFilter:
              props:
                faction: { eq: VC }
                type: { eq: guerrilla }
        - 0
```

The `when` guard on `decision.name: $destination` restricts these
considerations to the redeployment destination choice. Other `chooseOne`
completions (e.g., pacification action selection) use different bind
names and are unaffected. This follows the same pattern as the existing
`preferPopulousTargets` consideration (`92-agents.md:353-372`), which
uses `decision.name` and `{ ref: option.value }` to score completion
options.

### B. Pacification scoring considerations (move-scoped)

```yaml
considerations:
  # Prefer pacifying zones with high population (more control impact).
  # coupPacifyARVN exposes targetSpace as an action parameter, so this
  # is correctly move-scoped.
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
section. The completion-scoped considerations
(`preferRedeployToPopulousZones`, `preferRedeployNearEnemies`) join the
existing completion-scoped `preferPopulousTargets`. The move-scoped
`preferPacifyPopulousZones` has a `when` guard restricting it to
`coupPacifyARVN`, so it does not affect strategic decisions.

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: No engine code changes. All scoring logic
  is expressed in GameSpecDoc YAML using existing DSL operators
  (`zoneProp`, `adjacentTokenAgg`, `when` guards, `decision.name`,
  `option.value`).
- **#7 Specs Are Data**: Pure declarative considerations.
- **#10 Bounded Computation**: Zone property lookups and adjacent token
  counts are bounded by the finite zone/token graph.
- **#15 Architectural Completeness**: Uses the existing completion
  evaluation pipeline (`completion-guidance-choice.ts`) rather than
  working around the parameter model.

## Acceptance Criteria

1. Redeployment `$destination` completion decisions in ARVN traces show
   non-zero score gaps for at least 80% of completions (vs 0%
   currently, where all destinations score identically).
2. ARVN troop positioning correlates with zone population and enemy
   proximity (verifiable via trace inspection).
3. No regression in strategic decision quality (Govern/Train selection
   unchanged).
4. All existing tests pass.

## Verification

Run the tournament harness at tier 15 and compare:
- Before: all redeployment destination choices undifferentiated (gap=0)
- After: destination completions differentiated, gap > 0
- compositeScore should improve (or at minimum not regress)

## Future Work

- Consider scoring the SOURCE zone for redeployment (prefer redeploying
  FROM zones where COIN already dominates), as a follow-up refinement.

## Outcome

- Completed: 2026-04-11
- What changed:
  - Added `preferRedeployToPopulousZones`, `preferRedeployNearEnemies`, and `preferPacifyPopulousZones` to `data/games/fire-in-the-lake/92-agents.md`.
  - Wired the new considerations into the `arvn-evolved` profile.
  - Updated the FITL production policy compilation expectation and regenerated the owned FITL policy catalog golden.
- Deviations from original plan:
  - Pacification differentiation was directly visible in saved traces, but redeploy destination differentiation was only validated indirectly because the current tournament trace summary does not expose nested `$destination` completion contribution breakdowns.
  - No dedicated follow-up spec was created for source-zone redeploy scoring; it remains listed as future work only.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - Bounded tournament evidence was collected with `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3 --max-turns 100` and `--seeds 9 --max-turns 100`.

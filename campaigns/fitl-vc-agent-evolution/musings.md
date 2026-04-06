# FITL VC Agent Evolution — Musings

**CONTINUATION**: This campaign starts with a vc-evolved profile that already has:
- Normalized margin scoring (preferNormalizedMargin, weight 5)
- Preview mode (tolerateStochastic)
- Capability gain valuation (valueCapabilityGain, weight 3)
- Rally weighting (preferRallyWeighted, rallyWeight=3)
- Attack penalization (penalizeAttack, weight -0.1)
- Population-based target selection (preferPopulousTargets, weight 2)
- Observability feature (observeGameState, weight 0)

Key gaps to explore: no Tax weighting, no resource-aware conditionals, no pruning beyond pass, no event discrimination, no spatial awareness.


# INVMOMDUPATH-001: Investigate dual momentum enforcement pathway

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

The architectural recovery report (2026-04-08-fitl-events) identified that momentum in FITL may be enforced through two independent mechanisms:
1. Global variable guards (`mom_rollingThunder`, `mom_generalLansdale`, etc.) in action pipeline legality conditions, evaluated during move enumeration.
2. `activeLastingEffects[].actionRestrictions` checked by `isMoveAllowedByLastingEffectRestrictions()` in `legal-moves-turn-order.ts`.

The free-operation bypass (`move.freeOperation === true`) is implemented independently in both paths. If the same momentum card uses both mechanisms for the same blocking behavior, this is a split protocol requiring consolidation. If they handle disjoint concerns, the dual path is intentional.

Currently supported by a single evidence signal (test behavior). A second signal is needed to confirm or reject.

## Assumption Reassessment (2026-04-08)

1. Momentum cards exist with both gvar effects and lasting effects — confirmed by momentum-validation test (14 cards with `duration: 'round'` lasting effects)
2. Pipeline legality conditions reference `mom_*` gvar names — confirmed by `fitl-coin-operations.test.ts:922`
3. Whether any card's lasting effect carries `actionRestrictions` AND its pipelines carry matching gvar conditions — UNKNOWN, this is the investigation target

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If confirmed, a follow-up Spec 120 would consolidate the enforcement pathway
3. No shims or compatibility concerns

## What to Change

### 1. Compile and inspect a momentum card

Compile the FITL production spec. For Rolling Thunder (card-41), inspect:
- The compiled lasting effect: does it have `actionRestrictions`? If so, which actions and with what constraints?
- The affected action pipelines (e.g., Air Strike): do their `legality` conditions reference `gvar.mom_rollingThunder`?
- If both exist: do they block the same action in the same way, or handle different aspects?

### 2. Check at least 3 momentum cards

Repeat for General Lansdale (card-30) and Claymores (card-17) to confirm the pattern is consistent or varies per card.

### 3. Write verdict

Document findings in a brief report section appended to this ticket:
- **Confirmed**: Both paths block the same action → write Spec 120
- **Rejected**: Paths handle disjoint concerns (e.g., gvar = "is action family allowed", actionRestriction = "cap numeric parameter") → close ticket

## Files to Touch

- No source files modified
- Read: `packages/engine/src/kernel/legal-moves-turn-order.ts` (lines 241-290)
- Read: Compiled GameDef for FITL (via `compileProductionSpec()`)

## Out of Scope

- Any code changes
- Writing Spec 120 (that's a follow-up if confirmed)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict is one of: confirmed (with evidence) or rejected (with explanation)

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only

## Verdict (2026-04-08)

**Rejected**. The investigated momentum cards do not enforce the same blocking behavior through both pathways.

### Corrected live card identities

The ticket's example card ids were partly stale against the live FITL production data:

1. Rolling Thunder is `card-10`, not `card-41`
2. Claymores is `card-17`
3. General Lansdale is `card-78`, not `card-30`

### Compiled evidence

Using `compileProductionSpec()` against the live FITL production spec:

1. **Rolling Thunder (`card-10`)**
   - Shaded lasting effect `mom-rolling-thunder` exists
   - Its compiled lasting effect has **no** `actionRestrictions`
   - The `air-strike-profile` legality still references `gvar.mom_rollingThunder` with the usual `__freeOperation` bypass

2. **Claymores (`card-17`)**
   - Unshaded lasting effect `mom-claymores` exists
   - Its compiled lasting effect has **no** `actionRestrictions`
   - The `nva-ambush-profile` and `vc-ambush-profile` legalities still reference `gvar.mom_claymores` with the usual `__freeOperation` bypass

3. **General Lansdale (`card-78`)**
   - Shaded lasting effect `mom-general-landsdale` exists
   - Its compiled lasting effect has **no** `actionRestrictions`
   - The `assault-us-profile` legality still references `gvar.mom_generalLansdale` with the usual `__freeOperation` bypass

### Interpretation

For the three cards named by this ticket, the enforcement style is consistent: momentum is enforced through pipeline legality guards keyed off `mom_*` globals, not through `activeLastingEffects[].actionRestrictions`.

`actionRestrictions` does exist elsewhere in FITL, but it appears on different event surfaces such as Typhoon Kate's unshaded lasting effect rather than on these investigated momentum cards. That means the suspected fracture was not "the same card blocks the same action through both a gvar legality guard and a lasting-effect action restriction." Instead, FITL currently uses different enforcement styles for different cards.

## Outcome

- **Completed**: 2026-04-08
- **What changed**:
  - Investigated the named dual-path momentum enforcement hypothesis against the live compiled FITL `GameDef`
  - Corrected the stale example card ids in the verdict evidence
  - Rejected the same-card dual-enforcement premise for the named cards
- **Follow-up ticket**: None
- **Deviations from ticket**:
  - The ticket's exemplar card ids for Rolling Thunder and General Lansdale were stale in live production data
  - No Spec 120 follow-up was created because the investigation rejected the premise that these cards enforce the same block through both pathways
- **Verification**:
  - Direct read of `packages/engine/src/kernel/legal-moves-turn-order.ts`
  - Compiled FITL production inspection via `compileProductionSpec()`

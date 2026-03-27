# MONGRNINV-001: Compilation invariant — Monsoon-restricted grants require allowDuringMonsoon

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — new test file
**Deps**: None

## Problem

Event card free-operation grants that reference Monsoon-restricted actions (`sweep`, `march`, `airStrike`, `airLift`) can silently break during Monsoon if they lack `allowDuringMonsoon: true`. The Monsoon window filter in `applyTurnFlowWindowFilters` removes such moves post-enumeration, causing `legalMoves` to return 0 and `expireUnfulfillableRequiredFreeOperationGrants` to expire the grant. This was the root cause of 4 CI failures on the `map-editor-improvements` branch (card-62 Cambodian Civil War, card-44 Ia Drang).

Per FITL rule 5.1.1, Events override Monsoon restrictions. Any event-granted operation that targets a Monsoon-restricted action MUST include `allowDuringMonsoon: true` so the Monsoon window filter does not block it.

Currently, no compilation-level test validates this constraint. The only way to detect it is via runtime test failures that happen to activate Monsoon state — which is fragile and non-systematic.

## Foundation Alignment

- **Foundation 11 (Testing as Proof)**: "Architectural properties MUST be proven through automated tests, not assumed." The relationship between Monsoon-restricted actions and `allowDuringMonsoon` on event grants is a structural invariant that can be verified at compile time without game simulation.
- **Foundation 1 (Engine Agnosticism)**: The test operates on compiled GameDef JSON, not game-specific runtime logic. The Monsoon restriction list comes from the GameDef's `turnOrder.config.turnFlow.monsoon.restrictedActions`, not from hardcoded FITL knowledge.

## What to Change

### 1. New test: `fitl-events-monsoon-grant-invariant.test.ts`

Create a new integration test in `packages/engine/test/integration/` that:

1. Compiles the full FITL production spec via `compileProductionSpec()`
2. Extracts the set of Monsoon-restricted action IDs from `def.turnOrder.config.turnFlow.monsoon.restrictedActions`
3. Iterates over all event cards in all event decks
4. For each card side (unshaded, shaded) and each branch, inspects every `freeOperationGrant`
5. Asserts: if any `actionId` in the grant's `actionIds` array appears in the Monsoon-restricted set, then `allowDuringMonsoon` MUST be `true`
6. Reports ALL violations in a single assertion message (not fail-fast on first)

The test should be **engine-agnostic in approach**: it reads the restriction list from the compiled GameDef rather than hardcoding `['sweep', 'march', 'airStrike', 'airLift']`. This way it remains correct if the restriction set changes.

### 2. Test location and naming

- File: `packages/engine/test/integration/fitl-events-monsoon-grant-invariant.test.ts`
- Suite name: `FITL Monsoon grant invariant`
- Test name: `all event grants for Monsoon-restricted actions include allowDuringMonsoon`

## Files to Touch

- `packages/engine/test/integration/fitl-events-monsoon-grant-invariant.test.ts` (create)

## Out of Scope

- Runtime Monsoon interaction tests (these exist in individual card test files)
- Engine changes to `applyTurnFlowWindowFilters` or `expireUnfulfillableRequiredFreeOperationGrants`
- Non-FITL games (Texas Hold'em has no Monsoon concept; the test is FITL-specific by nature since it compiles the FITL production spec)

## Verification

- The test passes on the current codebase (all grants are now correct after the card-62/card-44 fix)
- Removing `allowDuringMonsoon: true` from any grant for a restricted action causes the test to fail with a clear message identifying the card, side, and grant

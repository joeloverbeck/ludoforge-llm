# FITLOPEFULEFF-028: Attack Casualty Routing Contract (US Casualties vs Available)

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 26 Task 26.9, Rule 3.3.3 notes, Agnostic Engine Rule
**Depends on**: FITLOPEFULEFF-024, FITLOPEFULEFF-025, FITLOPEFULEFF-026

## Summary

Resolve the contract mismatch between documented insurgent Attack casualty semantics and implemented removal destinations.

Current state:
- `insurgent-attack-removal-order` comment states US pieces should go to Casualties.
- Implementation routes removed COIN defenders to `available-*`.

Required outcome:
- Define canonical removal destination policy for Attack in GameSpecDoc data (not hardcoded per game in kernel).
- Ensure FITL encodes the correct US casualty destination explicitly and consistently.

## Files to Touch

- `data/games/fire-in-the-lake.md` — casualty destination encoding for Attack removal
- `schemas/` and/or shared type contracts if new generic destination pattern is required
- `src/cnl/*` and `src/kernel/*` only if a generic, game-agnostic primitive is missing
- `test/integration/fitl-removal-ordering.test.ts` — verify destination semantics
- `test/integration/fitl-coup-resources-phase.test.ts` (if casualty accounting implications require cross-check)

## Out of Scope

- FITL event-rule changes unrelated to Attack removal destinations
- One-off game-specific kernel branches

## Acceptance Criteria

### Tests That Must Pass
1. Attack removal destination for US pieces matches declared canonical contract.
2. Attrition behavior remains correct after destination fix.
3. No implicit routing assumptions remain in comments that contradict behavior.
4. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Destination policy remains game-data driven and game-agnostic in runtime.
- No backward compatibility aliases for old routing.

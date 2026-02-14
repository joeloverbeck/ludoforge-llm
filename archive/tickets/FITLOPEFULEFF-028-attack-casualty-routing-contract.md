# FITLOPEFULEFF-028: Attack Casualty Routing Contract (US Casualties vs Available)

**Status**: COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 26 Task 26.9, Rule 3.3.3 notes, Agnostic Engine Rule
**Depends on**: FITLOPEFULEFF-024, FITLOPEFULEFF-025, FITLOPEFULEFF-026

## Summary

Resolve the contract mismatch between documented insurgent Attack casualty semantics and implemented removal destinations.

Current state:
- `insurgent-attack-removal-order` comment states US pieces should go to Casualties.
- Implementation routes removed COIN defenders to `available-*` (including US).
- Engine/compiler already support game-data-driven destination routing via `removeByPriority.groups[].to` with `zoneExpr`; no kernel/schema primitive is missing.

Required outcome:
- Keep routing policy in FITL GameSpecDoc data (no game-specific kernel branches).
- Encode explicit US casualty destination for Attack removals and keep ARVN removal destination unchanged.
- Align comments/tests with behavior so there is a single canonical contract.

## Files to Touch

- `data/games/fire-in-the-lake.md` — casualty destination encoding for Attack removal
- `test/integration/fitl-removal-ordering.test.ts` — verify destination semantics
- `test/integration/fitl-coup-resources-phase.test.ts` (only if casualty-box accounting in Coup is touched by this ticket)

## Out of Scope

- FITL event-rule changes unrelated to Attack removal destinations
- One-off game-specific kernel branches
- Kernel/compiler/schema edits for routing primitives that already exist

## Acceptance Criteria

### Tests That Must Pass
1. Attack removal destination for US pieces is an explicit Casualties zone (not `available-US`).
2. Attack removal destination for ARVN pieces remains `available-ARVN`.
3. Attrition behavior remains correct: attacker loses 1 attacking piece per US Troop/Base removed.
4. No comments/tests assert a routing contract that contradicts implementation.
5. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Destination policy remains game-data driven and game-agnostic in runtime.
- No backward compatibility aliases for old routing.
- Do not introduce a per-game schema or runtime branch for casualty routing.

## Outcome

**Completed**: 2026-02-14

### What changed vs. planned
- Updated `insurgent-attack-removal-order` in `data/games/fire-in-the-lake.md` so removed US pieces route to `casualties-US:none` while non-US COIN removals continue to `available-*`.
- Added `casualties-US` to production pool zones in `data/games/fire-in-the-lake.md`.
- Strengthened `test/integration/fitl-removal-ordering.test.ts` to assert:
  - US attack removals go to `casualties-US:none`
  - US attack removals do not go to `available-US:none`
  - non-US removals keep dynamic `available-*` routing
  - attacker attrition remains unchanged

### Deviations
- No `src/kernel/*`, `src/cnl/*`, or `schemas/*` changes were needed because existing generic `removeByPriority` + `zoneExpr` already support the required routing contract.
- `test/integration/fitl-coup-resources-phase.test.ts` was not modified because this ticket only changed Attack removal routing and did not alter Coup-phase casualty-accounting behavior.

### Verification
- `npm run build` passed.
- `npm run typecheck` passed.
- Targeted tests passed:
  - `node --test dist/test/integration/fitl-removal-ordering.test.js`
  - `node --test dist/test/integration/fitl-coup-resources-phase.test.js`
- Full suite and lint passed:
  - `npm test`
  - `npm run lint`

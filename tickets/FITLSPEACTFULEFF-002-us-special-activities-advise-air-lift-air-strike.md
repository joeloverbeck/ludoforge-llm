# FITLSPEACTFULEFF-002 - US Special Activities: Advise, Air Lift, Air Strike

**Status**: TODO  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.1-27.3)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (FITL production fixture/test structure)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace US SA stubs with full, rule-correct effects for:
- `advise` (Train/Patrol only, per-space chooseOne, optional global +6 Aid)
- `airLift` (US unlimited + ARVN/Ranger/Irregular up to 4, space-limit handling)
- `airStrike` (up to 6 active enemy pieces across selected spaces, support shift, optional Trail degrade)

## Scope
- Implement full US SA pipelines in production FITL YAML with correct targeting, option branching, and removal ordering constraints.
- Ensure Air Strike/Bombard automatic semantics (no die roll for Air Strike).
- Preserve no-added-cost SA contract while executing full board effects.

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-removal-ordering.test.ts`
- `test/integration/fitl-coup-support-phase.test.ts` (only if support-track assertions need extension)

## Out of scope
- ARVN, NVA, or VC SA implementation details.
- Monsoon gating logic beyond what is strictly needed to block Advise Sweep and cap Air Lift/Air Strike spaces.
- Capability/momentum modifications to US SAs.
- Non-player SA choice policy.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `node --test dist/test/integration/fitl-coup-support-phase.test.js`

## Invariants that must remain true
- Air Strike does not use die rolls.
- Bases are removed last; tunneled bases are never removed by these SAs.
- US/ARVN SA effects are encoded in GameSpecDoc data, not hardcoded kernel branches.
- SA execution does not spend Resources.


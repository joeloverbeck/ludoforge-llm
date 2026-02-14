# FITLSPEACTFULEFF-002 - US Special Activities: Advise, Air Lift, Air Strike

**Status**: ✅ COMPLETED  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.1-27.3)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (FITL production fixture/test structure)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace US SA stubs with full, rule-correct effects for:
- `advise` (Train/Patrol only, per-space chooseOne, optional global +6 Aid)
- `airLift` (US unlimited + ARVN/Ranger/Irregular up to 4, space-limit handling)
- `airStrike` (up to 6 active enemy pieces across selected spaces, support shift, optional Trail degrade)

## Reassessed assumptions (2026-02-14)
- `data/games/fire-in-the-lake.md` still contains US SA stubs (`advise-profile`, `air-lift-profile`, `air-strike-profile`) that only increment counters.
- `test/integration/fitl-us-arvn-special-activities.test.ts` currently validates profile wiring and counter increments, not full US SA board effects.
- `test/integration/fitl-removal-ordering.test.ts` already provides macro-level ordering coverage; this ticket should add US-SA-specific runtime ordering assertions in US SA integration tests instead of broad unrelated edits.
- Production FITL data now includes `turnOrder.cardDriven.turnFlow.monsoon` wiring, and US SA space-selection caps are enforced data-first during Coup lookahead windows.
- Operation+SA shared-space constraints are now representable through generic move-level `compoundParamConstraints` and runtime-resolved templated binding names (for example `'$adviseMode@{$space}'`), enabling Advise-vs-Train disjointness and per-space independent SA decisions without FITL-specific engine logic.

## Scope
- Implement full US SA pipelines in production FITL YAML with correct targeting, option branching, and removal ordering constraints.
- Ensure Air Strike/Bombard automatic semantics (no die roll for Air Strike).
- Preserve no-added-cost SA contract while executing full board effects.
- Keep changes game-data-driven and generic-engine-compatible; do not add FITL-specific kernel branches.

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-removal-ordering.test.ts` (only if shared removal primitives need additional assertions after US SA changes)
- `test/integration/fitl-monsoon-pivotal-windows.test.ts` (only if monsoon metadata contracts are extended in production data)

## Out of scope
- ARVN, NVA, or VC SA implementation details.
- Capability/momentum modifications to US SAs.
- Non-player SA choice policy.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `npm run lint`

## Invariants that must remain true
- Air Strike does not use die rolls.
- Bases are removed last; tunneled bases are never removed by these SAs.
- US/ARVN SA effects are encoded in GameSpecDoc data, not hardcoded kernel branches.
- SA execution does not spend Resources.

## Outcome
- **Completion date**: 2026-02-14
- **What changed**:
  - Replaced US SA stubs in `data/games/fire-in-the-lake.md` with data-driven `advise`, `airLift`, and `airStrike` pipelines using concrete selection/resolution stages.
  - Added production card-driven turn-flow wiring (`turnOrder.turnFlow`) with lifecycle slots and Monsoon metadata, including deck/lookahead lifecycle zones and event deck draw-zone alignment.
  - Added Monsoon-aware US SA space caps in data (`advise`/`airLift`/`airStrike` select stages cap to one space when lookahead is Coup).
  - Added reusable US-SA insurgent removal macro logic with explicit base-last and tunneled-base protection semantics.
  - Added runtime US SA behavior coverage in `test/integration/fitl-us-arvn-special-activities.test.ts` for:
    - Advise activate-and-remove + optional Aid.
    - Air Lift US unlimited movement + cap of 4 ARVN/Ranger/Irregular lifts.
    - Air Strike active-enemy-only removal, support shift, optional Trail degrade, and no-die-roll contract.
    - Monsoon one-space cap enforcement for Advise, Air Lift, and Air Strike.
- **Deviations from original plan**:
  - Added temporary runtime counters (`airLiftRemaining`, `airStrikeRemaining`) in production global vars to enforce per-action global limits without kernel changes.
  - Extended generic kernel/runtime support with templated binding names and updated FITL Advise to use per-space independent SA mode binds (no aliasing/backward-compat path added).
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js` passed.
  - `node --test dist/test/integration/fitl-removal-ordering.test.js` passed.
  - `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.

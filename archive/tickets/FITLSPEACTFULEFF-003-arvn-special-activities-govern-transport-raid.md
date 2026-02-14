# FITLSPEACTFULEFF-003 - ARVN Special Activities: Govern, Transport, Raid

**Status**: ✅ COMPLETED  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Tasks 27.4-27.6)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (operation profile + integration testing approach)  
**Depends on**: `FITLSPEACTFULEFF-001`

## Goal
Replace ARVN SA stubs with full, rule-correct effects for:
- `govern` (Train/Patrol only, per-space Aid vs Patronage choice and ARVN>US cube condition)
- `transport` (origin-based movement path with blocking and global Ranger flip underground)
- `raid` (adjacent Ranger movement, optional activate-and-remove 2 enemy pieces per selected space)

## Scope
- Encode ARVN SA space filters and per-space chooseOne logic in production FITL YAML.
- Implement Transport's global "flip all Rangers underground" post-effect.
- Implement Raid removal constraints (bases last, tunneled base immunity).

## Reassessed assumptions (2026-02-14)
- `govern-profile`, `transport-profile`, and `raid-profile` in `data/games/fire-in-the-lake.md` are still stubs (telemetry-only).
- Existing integration coverage for ARVN SA full effects is missing; `test/integration/fitl-us-arvn-special-activities.test.ts` currently validates US SA behaviors and only profile presence for ARVN SAs.
- `test/integration/fitl-patrol-sweep-movement.test.ts` does not currently assert Transport behavior and should remain untouched unless a shared movement primitive regression is discovered.
- `test/integration/fitl-removal-ordering.test.ts` focuses macro contracts/runtime ordering and does not currently validate Raid flow wiring.

## Architecture decision
- Keep implementation data-driven inside production `GameSpecDoc` YAML (`data/games/fire-in-the-lake.md`), aligned with the agnostic-engine rule.
- Avoid kernel/runtime changes unless YAML cannot express a required rule.
- Prefer reusing existing generic macros (`us-sa-remove-insurgents`) rather than introducing ARVN-specific engine branches.

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-patrol-sweep-movement.test.ts` (only if a shared movement primitive issue is discovered)
- `test/integration/fitl-removal-ordering.test.ts` (only if a shared removal-order macro issue is discovered)

## Out of scope
- US, NVA, or VC SA implementation details.
- Altering generic movement primitives unless an actual generic gap is proven by failing tests.
- Event-card effects that move Rangers or modify Govern/Raid outcomes.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-patrol-sweep-movement.test.js` (regression guard; unchanged unless needed)
- `node --test dist/test/integration/fitl-removal-ordering.test.js` (regression guard; unchanged unless needed)

## Invariants that must remain true
- Govern excludes Saigon and requires qualifying support/control preconditions.
- Transport movement obeys blocking rules and does not allow North Vietnam destinations.
- Raid/Transport semantics remain deterministic and data-driven.
- SA execution does not spend Resources.

## Outcome
- Completion date: 2026-02-14
- Implemented:
  - Replaced ARVN SA stubs in `data/games/fire-in-the-lake.md` with data-driven `govern`, `transport`, and `raid` profile logic.
  - Added Govern compound disjoint constraints against operation `targetSpaces` and per-space Aid/Patronage branching.
  - Added Transport origin/destination selection, deterministic movement of up to 6 ARVN troops/rangers, and global Ranger underground flip.
  - Added Raid per-space adjacent Ranger movement plus optional activate-and-remove flow using shared removal macro semantics.
  - Added ARVN SA integration coverage in `test/integration/fitl-us-arvn-special-activities.test.ts`.
- Deviations from original plan:
  - Kept `test/integration/fitl-patrol-sweep-movement.test.ts` and `test/integration/fitl-removal-ordering.test.ts` unchanged because no shared primitive/macro regression required edits.
  - Transport pathing is enforced via connected LoC/City traversal with enemy-blocked transit in YAML; no kernel movement primitive changes were introduced.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js` passed.
  - `node --test dist/test/integration/fitl-patrol-sweep-movement.test.js` passed.
  - `node --test dist/test/integration/fitl-removal-ordering.test.js` passed.
  - `npm run lint` passed.
  - `npm test` passed.

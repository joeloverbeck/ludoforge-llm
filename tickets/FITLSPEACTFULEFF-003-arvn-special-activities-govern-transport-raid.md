# FITLSPEACTFULEFF-003 - ARVN Special Activities: Govern, Transport, Raid

**Status**: TODO  
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

## File list it expects to touch
- `data/games/fire-in-the-lake.md`
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-patrol-sweep-movement.test.ts` (only if shared movement helpers are asserted here)
- `test/integration/fitl-removal-ordering.test.ts`

## Out of scope
- US, NVA, or VC SA implementation details.
- Altering generic movement primitives unless an actual generic gap is proven by failing tests.
- Event-card effects that move Rangers or modify Govern/Raid outcomes.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-patrol-sweep-movement.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`

## Invariants that must remain true
- Govern excludes Saigon and requires qualifying support/control preconditions.
- Transport movement obeys blocking rules and does not allow North Vietnam destinations.
- Raid/Transport semantics remain deterministic and data-driven.
- SA execution does not spend Resources.


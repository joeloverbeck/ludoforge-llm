# FITLOPEANDSPEACT-006 - FITL Insurgent Operations Data Encoding (Rally, March, Attack, Terror)

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`

## Goal
Encode FITL insurgent operations (`Rally`, `March`, `Attack`, `Terror`) as declarative operation profiles with deterministic movement/removal/activation semantics.

## Scope
- Add/extend FITL `GameSpecDoc` fixture(s) with operation-profile entries for insurgent operations.
- Encode underground/active transitions, placement constraints, and movement/removal ordering declaratively.
- Encode bases-last and tunneled-base constraints via generic policies from prior tickets.
- Add focused tests proving these operations execute from compiled data definitions.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` (new)
- `test/fixtures/cnl/compiler/fitl-operations-insurgent.golden.json` (new)
- `test/fixtures/gamedef/fitl-operations-insurgent-valid.json` (new)
- `test/unit/compiler.golden.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/integration/fitl-insurgent-operations.test.ts` (new)

## Out of scope
- COIN operation implementation.
- Special activities for any faction.
- Card event framework and card data pack.
- Coup-round scoring and victory checks.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/integration/fitl-insurgent-operations.test.js`

## Invariants that must remain true
- Insurgent behavior is data-driven and deterministic.
- Underground/active state transitions follow declarative rules with no FITL hardcoded branch handlers.
- Removal ordering remains deterministic for non-choice paths.
- Existing turn-flow eligibility behavior from Spec 17 remains intact.

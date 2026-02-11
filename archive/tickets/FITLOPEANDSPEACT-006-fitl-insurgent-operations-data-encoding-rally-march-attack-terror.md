# FITLOPEANDSPEACT-006 - FITL Insurgent Operations Data Encoding (Rally, March, Attack, Terror)

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`

## Assumption reassessment (2026-02-11)
- Generic operation-profile schema, compiler lowering, and runtime execution are already implemented and covered by archived tickets `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-004`.
- FITL operation-profile data encoding for COIN operations is already in place via archived ticket `FITLOPEANDSPEACT-005`; insurgent coverage is currently missing.
- The current runtime executes operation-profile legality/cost/resolution pipelines, but does not yet enforce FITL-specific targeting/removal semantics (for example, bases-last/tunneled-base policy interpretation) from `operationProfiles.targeting`.
- Therefore, this ticket must encode insurgent targeting/removal intent declaratively in data and verify compilation/runtime profile execution path, without claiming closure for full FITL targeting/removal mechanics.

## Goal
Encode FITL insurgent operations (`Rally`, `March`, `Attack`, `Terror`) as declarative operation profiles in FITL game data and prove they execute through the existing generic operation-profile pipeline.

## Scope
- Add a focused FITL insurgent `GameSpecDoc` fixture with operation-profile entries for `Rally`, `March`, `Attack`, and `Terror`.
- Encode legality/cost/targeting metadata and ordered resolution stages in data only (no FITL-specific engine branches).
- Include declarative targeting/removal policy intent (including bases-last/tunneled-base references) as operation-profile data fields.
- Add focused integration tests proving these operations compile and execute via compiled `operationProfiles`.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` (new)
- `test/integration/fitl-insurgent-operations.test.ts` (new)
- `test/integration/compile-pipeline.test.ts` (only if fixture pipeline assertions are required after implementation)

## Out of scope
- COIN operation implementation.
- Special activities for any faction.
- Card event framework and card data pack.
- Coup-round scoring and victory checks.
- Full runtime interpretation of FITL-specific targeting/removal policy metadata from `operationProfiles.targeting` (for example bases-last/tunneled-base removal execution semantics).

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-insurgent-operations.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`

## Invariants that must remain true
- Insurgent behavior is data-driven and deterministic.
- No FITL-specific hardcoded branch handlers are added to compiler/runtime engine code.
- Runtime execution remains the generic operation-profile legality/cost/resolution path.
- Existing turn-flow eligibility behavior from Spec 17 remains intact.

## Outcome
- Completion date: 2026-02-11
- What was actually changed:
  - Added FITL insurgent fixture at `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` with operation profiles for `Rally`, `March`, `Attack`, and `Terror`.
  - Added integration coverage at `test/integration/fitl-insurgent-operations.test.ts` to verify compile mapping, profile-driven execution (not fallback action effects), and deterministic cost-validation failure behavior for `Attack`.
- Deviations from the original plan:
  - Did not add `fitl-operations-insurgent.golden.json` or `fitl-operations-insurgent-valid.json`; existing repository test patterns are satisfied by focused fixture + integration coverage.
  - Did not modify `test/unit/compiler.golden.test.ts` or `test/unit/compile-top-level.test.ts`; no compiler/top-level contract changes were required.
  - No runtime/compiler source code changes were needed; existing generic operation-profile implementation already supported this ticket once insurgent data/tests were added.
- Verification results:
  - `npm run build`
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `npm test`

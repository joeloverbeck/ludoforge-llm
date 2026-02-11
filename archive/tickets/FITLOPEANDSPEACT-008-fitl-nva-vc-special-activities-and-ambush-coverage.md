# FITLOPEANDSPEACT-008 - FITL NVA/VC Special Activities and Ambush Coverage

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`, `FITLOPEANDSPEACT-006`

## Assumption reassessment (2026-02-11)
- Generic operation-profile schema/compiler/runtime behavior is already implemented and covered by archived tickets `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-004`.
- FITL operation and special-activity fixture/testing patterns are already established by archived tickets `FITLOPEANDSPEACT-005`, `FITLOPEANDSPEACT-006`, and `FITLOPEANDSPEACT-007`.
- Repository patterns for FITL operation-profile tickets use focused fixture + integration tests, not per-fixture `*.golden.json` or `test/fixtures/gamedef/*-valid.json` artifacts.
- Runtime execution currently enforces generic legality/cost/resolution behavior from compiled `operationProfiles`, while FITL-specific targeting/removal policy details in `targeting` are declarative metadata (not yet interpreted as full FITL-specific mechanics).
- Therefore this ticket should encode NVA/VC special-activity intent declaratively and verify compile + execution-path behavior without claiming closure for full FITL ambush targeting/removal runtime semantics.

## Goal
Encode NVA and VC special activities (`Infiltrate`, `Bombard`, `Ambush` [NVA], `Tax`, `Subvert`, `Ambush` [VC]) as declarative operation-profile data and verify they execute via the existing generic operation-profile pipeline.

## Scope
- Add a focused FITL NVA/VC `GameSpecDoc` fixture with operation-profile entries for the listed special activities.
- Encode legality/cost/targeting metadata, ordered resolution stages, and linked special-activity window ids in data only.
- Encode deterministic ambush targeting/removal intent declaratively in `targeting` metadata (for example tie-break/removal policy fields) and verify it compiles through unchanged.
- Add focused integration tests that prove:
  - compilation produces expected profile/action mappings and linked-window metadata;
  - execution uses compiled `operationProfiles` (not fallback action effects);
  - legality/cost rejection reasons are deterministic and traceable through error metadata.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-special-nva-vc.md` (new)
- `test/integration/fitl-nva-vc-special-activities.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts` (only if additional assertions are needed)

## Out of scope
- US/ARVN special activities.
- COIN/insurgent operation definitions.
- Coup/victory enforcement.
- Card event framework behavior.
- Full runtime interpretation of FITL-specific ambush targeting/removal policy metadata from `operationProfiles.targeting`.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Special-activity behavior remains data-driven via compiled operation profiles.
- Deterministic ordering/removal intent for ambush remains encoded in profile metadata (no hardcoded FITL runtime branch logic).
- Trace-visible legality/cost rejection metadata remains stable for auditability.
- No regression to non-FITL simulation behavior.

## Outcome
- Completion date: 2026-02-11
- What was actually changed:
  - Added `test/fixtures/cnl/compiler/fitl-special-nva-vc.md` encoding NVA/VC special activities (`Infiltrate`, `Bombard`, `Ambush` [NVA], `Tax`, `Subvert`, `Ambush` [VC]) with declarative legality/cost/targeting/resolution data and linked special-activity windows.
  - Added `test/integration/fitl-nva-vc-special-activities.test.ts` covering compile mapping + linked-window metadata, ambush targeting metadata passthrough, profile-driven execution (instead of fallback action effects), legality rejection (`OPERATION_LEGALITY_FAILED`), and cost-validation rejection (`OPERATION_COST_BLOCKED`).
- Deviations from the original plan:
  - Did not add `*.golden.json`/`test/fixtures/gamedef/*-valid.json` artifacts or modify `test/unit/compiler.golden.test.ts`/`test/unit/compile-top-level.test.ts`; current FITL operation-profile ticket patterns are satisfied by focused fixture + integration coverage.
  - Did not add FITL-specific runtime/compiler branches for ambush targeting/removal semantics; these remain encoded as declarative metadata per current generic engine scope.
- Verification results:
  - `npm run build`
  - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
  - `npm test`

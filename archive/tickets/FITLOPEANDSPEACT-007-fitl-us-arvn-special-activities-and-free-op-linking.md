# FITLOPEANDSPEACT-007 - FITL US/ARVN Special Activities and Free-Op Linking

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`, `FITLOPEANDSPEACT-005`

## Assumption reassessment (2026-02-11)
- Generic operation-profile schema, compiler lowering, and runtime execution are already implemented and covered by archived tickets `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-004`.
- COIN and insurgent operation-profile fixture/testing patterns are already established via archived tickets `FITLOPEANDSPEACT-005` and `FITLOPEANDSPEACT-006`.
- Repository test architecture does not currently use per-fixture `*.golden.json` or `test/fixtures/gamedef/*-valid.json` artifacts for FITL operation-profile tickets; coverage is provided by fixture + integration tests.
- Current runtime turn-flow linkage for operation/free-op behavior is enforced through generic action classes (`event`, `operation`, `limitedOperation`, `operationPlusSpecialActivity`) and option-matrix logic, while `linkedSpecialActivityWindows` is currently metadata carried by compiler/contracts.
- Therefore this ticket should encode US/ARVN special-activity intent and linkage metadata declaratively in fixture data, verify compilation and generic execution-path behavior, and avoid claiming closure for full FITL-specific special-activity rule semantics.

## Goal
Encode US and ARVN special activities (`Advise`, `Air Lift`, `Air Strike`, `Govern`, `Transport`, `Raid`) as declarative operation-profile data and verify they execute via the existing generic operation-profile pipeline with generic free-op/operation-class constraints preserved.

## Scope
- Add a focused FITL US/ARVN `GameSpecDoc` fixture with operation-profile entries for all listed special activities.
- Encode legality/cost/targeting metadata, ordered resolution stages, and linked special-activity window ids in data only.
- Encode cross-faction resource constraints declaratively in profile legality/cost conditions (for example, US special activities validated against ARVN resource pools).
- Add focused integration tests that prove:
  - compilation produces expected profile/action mappings and linkage metadata;
  - execution uses compiled `operationProfiles` (not fallback action effects);
  - generic free-op/operation-class option-matrix behavior remains deterministic for this fixture.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-special-us-arvn.md` (new)
- `test/integration/fitl-us-arvn-special-activities.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts` (only if additional assertions are needed)

## Out of scope
- NVA/VC special activities.
- Insurgent operation definitions.
- Event-card implementations.
- Coup/victory logic.
- Full FITL-specific runtime interpretation of special-activity targeting/removal semantics beyond existing generic operation-profile execution.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Special-activity behavior remains data-driven and deterministic.
- Operation/special-activity linkage uses existing generic operation-mode semantics (no FITL-specific runtime branching).
- Cross-faction spend constraints are encoded in fixture/profile data, not hardcoded by faction id.
- Existing legal-move and card-flow determinism are preserved.

## Outcome
- Completion date: 2026-02-11
- What was actually changed:
  - Added `test/fixtures/cnl/compiler/fitl-special-us-arvn.md` encoding US/ARVN special activities (`Advise`, `Air Lift`, `Air Strike`, `Govern`, `Transport`, `Raid`) as operation profiles with declarative legality/cost/targeting data.
  - Added `test/integration/fitl-us-arvn-special-activities.test.ts` covering compile mapping + linked-window metadata, profile-driven execution (instead of fallback action effects), and cross-faction cost-validation failure behavior.
- Deviations from the original plan:
  - Did not add `*.golden.json`/`test/fixtures/gamedef/*-valid.json` artifacts or modify compiler unit golden files because current repository patterns for FITL operation-profile tickets rely on focused fixture + integration coverage.
  - Did not add FITL-specific engine/compiler behavior; existing generic operation-profile and turn-flow semantics already satisfy the narrowed ticket scope.
- Verification results:
  - `npm run build`
  - `npm test`

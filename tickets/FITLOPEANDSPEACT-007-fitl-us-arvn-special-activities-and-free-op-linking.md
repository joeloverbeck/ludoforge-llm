# FITLOPEANDSPEACT-007 - FITL US/ARVN Special Activities and Free-Op Linking

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`, `FITLOPEANDSPEACT-005`

## Goal
Encode US and ARVN special activities (`Advise`, `Air Lift`, `Air Strike`, `Govern`, `Transport`, `Raid`) and their legal linkage to operations/free-operation modes using generic execution semantics.

## Scope
- Add profile data entries for all listed US/ARVN special activities.
- Encode legality windows and operation-linking rules (operation + special activity and free-op interactions) in data.
- Encode cross-faction resource constraints (for example US spend from ARVN constraints) declaratively.
- Add targeted integration tests for sequencing and resource accounting visibility in trace.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-special-us-arvn.md` (new)
- `test/fixtures/cnl/compiler/fitl-special-us-arvn.golden.json` (new)
- `test/fixtures/gamedef/fitl-special-us-arvn-valid.json` (new)
- `test/unit/compiler.golden.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/integration/fitl-us-arvn-special-activities.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts`

## Out of scope
- NVA/VC special activities.
- Insurgent operation definitions.
- Event-card implementations.
- Coup/victory logic.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Special-activity linkage is governed by generic operation-mode semantics.
- Resource accounting is trace-visible and deterministic.
- Cross-faction spend constraints are data encoded, not hardcoded by faction id.
- Existing legal-move determinism is preserved.

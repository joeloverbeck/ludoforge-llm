# FITLOPEANDSPEACT-008 - FITL NVA/VC Special Activities and Ambush Coverage

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`, `FITLOPEANDSPEACT-006`

## Goal
Encode NVA and VC special activities (`Infiltrate`, `Bombard`, `Ambush`, `Tax`, `Subvert`, `Ambush`) with deterministic targeting/removal semantics and proper interaction with operation execution windows.

## Scope
- Add profile data entries for NVA/VC special activities.
- Encode ambush semantics as data-backed behavior through generic removal/activation primitives.
- Ensure special activities observe operation-linking eligibility and free-op/limited-op constraints where applicable.
- Add targeted tests for sequencing, legality rejection reasons, and deterministic outcomes.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-special-nva-vc.md` (new)
- `test/fixtures/cnl/compiler/fitl-special-nva-vc.golden.json` (new)
- `test/fixtures/gamedef/fitl-special-nva-vc-valid.json` (new)
- `test/unit/compiler.golden.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts` (new)
- `test/integration/fitl-card-flow-determinism.test.ts`

## Out of scope
- US/ARVN special activities.
- COIN operation definitions.
- Coup/victory enforcement.
- Card event framework behavior.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Ambush and related removals follow deterministic ordering when no player choice is involved.
- All NVA/VC special behavior is data-driven via compiled profiles.
- Trace output includes legality/cost/targeting outcomes for auditability.
- No regression to non-FITL simulation behavior.

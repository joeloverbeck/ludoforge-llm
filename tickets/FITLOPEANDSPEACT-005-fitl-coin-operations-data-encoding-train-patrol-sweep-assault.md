# FITLOPEANDSPEACT-005 - FITL COIN Operations Data Encoding (Train, Patrol, Sweep, Assault)

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`

## Goal
Encode FITL COIN operations (`Train`, `Patrol`, `Sweep`, `Assault`) as operation profiles in FITL game data, including operation-specific constraints and deterministic target sequencing.

## Scope
- Add/extend FITL `GameSpecDoc` fixture(s) with operation-profile entries for all COIN operations.
- Encode legality, cost, targeting, and resolution sequencing in data only.
- Encode relevant terrain/state constraints for these operations (including monsoon and highland modifiers where applicable) via declarative predicates.
- Add focused tests proving these operations execute through compiled data.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-operations-coin.md` (new)
- `test/fixtures/cnl/compiler/fitl-operations-coin.golden.json` (new)
- `test/fixtures/gamedef/fitl-operations-coin-valid.json` (new)
- `test/unit/compiler.golden.test.ts`
- `test/unit/compile-top-level.test.ts`
- `test/integration/fitl-coin-operations.test.ts` (new)
- `test/integration/fitl-option-matrix.test.ts` (only if operation class wiring assertions need update)

## Out of scope
- Insurgent operations (`Rally`, `March`, `Attack`, `Terror`).
- All special activities (US/ARVN/NVA/VC).
- Coup-round and victory behavior.
- Filesystem runtime dependency on `data/fitl/...` assets.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler.golden.test.js`
- `node --test dist/test/unit/compile-top-level.test.js`
- `node --test dist/test/integration/fitl-coin-operations.test.js`
- `node --test dist/test/integration/fitl-option-matrix.test.js`

## Invariants that must remain true
- COIN operations are fully declared in FITL game data, not engine branches.
- Compilation remains deterministic and stable against golden fixtures.
- No runtime reads from `data/fitl/...` are required to execute encoded operations.
- Existing non-FITL fixture compilation remains unchanged.

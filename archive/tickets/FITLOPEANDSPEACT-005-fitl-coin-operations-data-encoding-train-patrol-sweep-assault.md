# FITLOPEANDSPEACT-005 - FITL COIN Operations Data Encoding (Train, Patrol, Sweep, Assault)

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`, `FITLOPEANDSPEACT-003`, `FITLOPEANDSPEACT-004`

## Assumption reassessment (2026-02-11)
- Generic operation-profile schema, compiler lowering, and runtime execution are already implemented and covered by archived tickets `FITLOPEANDSPEACT-001` through `FITLOPEANDSPEACT-004`.
- FITL fixtures currently use inline `GameSpecDoc` YAML under `test/fixtures/cnl/compiler/` and focused integration tests under `test/integration/`; no existing `fitl-operations-coin.*` fixtures/tests are present yet.
- `operationProfiles.targeting` payload is currently a generic record consumed as data, but not yet interpreted by a concrete runtime targeting/removal-policy engine. This ticket should not claim closure for full target-removal mechanics from Spec 18.
- Existing `test/integration/fitl-option-matrix.test.ts` coverage is orthogonal and does not need modification for COIN operation-profile data encoding.

## Goal
Encode FITL COIN operations (`Train`, `Patrol`, `Sweep`, `Assault`) as operation profiles in FITL game data and prove they execute through compiled data using the generic operation-profile runtime path.

## Scope
- Add a focused FITL COIN `GameSpecDoc` fixture with operation-profile entries for `Train`, `Patrol`, `Sweep`, and `Assault`.
- Encode legality/cost/targeting metadata and ordered resolution stages in data only (no FITL-specific engine branches).
- Add integration coverage that compiles the fixture and executes each COIN operation through compiled `operationProfiles`.
- Keep changes minimal and localized to FITL fixtures/tests.

## File list it expects to touch
- `test/fixtures/cnl/compiler/fitl-operations-coin.md` (new)
- `test/integration/fitl-coin-operations.test.ts` (new)
- `test/integration/compile-pipeline.test.ts` (only if fixture pipeline assertions are required after implementation)

## Out of scope
- Insurgent operations (`Rally`, `March`, `Attack`, `Terror`).
- All special activities (US/ARVN/NVA/VC).
- Coup-round and victory behavior.
- Filesystem runtime dependency on `data/fitl/...` assets.
- Full Spec 18 targeting/removal mechanics (for example bases-last/tunneled-base policies) beyond current generic operation-profile runtime contract.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-coin-operations.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`

## Invariants that must remain true
- COIN operations are fully declared in FITL game data, not engine branches.
- Compilation remains deterministic and stable.
- No runtime reads from `data/fitl/...` are required to execute encoded operations.
- Existing non-FITL fixture compilation remains unchanged.

## Outcome
- Completion date: 2026-02-11
- What actually changed:
  - Added new FITL COIN fixture at `test/fixtures/cnl/compiler/fitl-operations-coin.md` encoding `Train`, `Patrol`, `Sweep`, and `Assault` as operation profiles with declarative legality/cost/targeting metadata and ordered resolution stages.
  - Added new integration coverage at `test/integration/fitl-coin-operations.test.ts` that:
    - validates parse/validate/compile success for the fixture and expected operation-profile mapping,
    - executes all four COIN operations through compiled data and asserts operation-profile resolution/cost behavior.
- Deviation from original plan:
  - Did not add `fitl-operations-coin.golden.json` or `fitl-operations-coin-valid.json`; existing repository patterns and this ticket's corrected scope are satisfied by focused fixture + integration execution coverage.
  - No engine/runtime source changes were required; existing generic operation-profile runtime from prior tickets already satisfied this ticket once FITL data/test coverage was added.
- Verification results:
  - `npm run build`
  - `node --test dist/test/integration/fitl-coin-operations.test.js`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `node --test dist/test/unit/apply-move.test.js`

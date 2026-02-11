# FITLMAPSCEANDSTAMOD-007 - Negative Asset Fixtures and Diagnostic Hardening

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-002`, `FITLMAPSCEANDSTAMOD-003`, `FITLMAPSCEANDSTAMOD-004`, `FITLMAPSCEANDSTAMOD-005`

## Goal
Add a dedicated negative-fixture suite for malformed YAML-embedded FITL assets to guarantee fail-fast compile/load diagnostics with precise source context.

## Architecture Contract
- Canonical execution path: `GameSpecDoc` YAML -> parser/validator/compiler -> `GameDef` -> simulation.
- Negative fixtures must exercise YAML-embedded FITL data contracts compiled through the generic pipeline.
- `data/fitl/...` can support fixture authoring but must not be a required runtime compile/execute dependency.
- Diagnostics and validators must stay generic and reusable, without FITL-specific branching in compiler/runtime/kernel modules.

## Reassessed Assumptions
- The repository already has extensive negative asset coverage in `test/unit/data-assets.test.ts` (bounds violations, undeclared status dimensions, and inventory mismatches), so creating new `test/fixtures/spec/fitl-invalid-*.md` files would duplicate existing coverage.
- `test/unit/validate-gamedef.golden.test.ts` validates `GameDef` reference semantics and is not the primary location for data-asset envelope diagnostics.
- `test/unit/compiler.golden.test.ts` currently validates general compiler malformed fixtures, but does not yet include a dedicated embedded-asset malformed fixture asserting diagnostic context shape.

## Scope
- Add one dedicated malformed compiler fixture with YAML-embedded `dataAssets` that triggers scenario reference failures.
- Harden compiler diagnostics for embedded asset reference failures so they consistently include `entityId` (scenario asset id) along with path and code.
- Add focused assertions in integration tests that embedded-asset compile failures are fail-fast and include stable source context.

## File List Expected To Touch
- `src/cnl/compiler.ts`
- `test/fixtures/cnl/compiler/compile-fitl-assets-malformed.md` (new)
- `test/fixtures/cnl/compiler/compile-fitl-assets-malformed.golden.json` (new)
- `test/unit/compiler.golden.test.ts`
- `test/integration/compile-pipeline.test.ts`

## Out Of Scope
- No changes to valid scenario/map data.
- No operation/turn/coup/event semantics.
- No AI/simulation behavior changes.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/data-assets.test.ts`
  - existing negative map/piece-catalog diagnostics remain stable and passing.
- `test/unit/compiler.golden.test.ts`
  - includes a malformed embedded-assets golden fixture with stable diagnostics containing path + `entityId`.
- `test/integration/compile-pipeline.test.ts`
  - invalid embedded scenario asset references fail fast without crashing the pipeline and surface deterministic diagnostics.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Diagnostics are deterministic and stable for golden testing.
- Failures are explicit (no silent clamping or ignored invalid entries).
- Non-FITL existing compile diagnostics remain unchanged unless intentionally extended.

## Outcome
- Completion date: 2026-02-11
- Implemented changes:
  - Added compiler diagnostic hardening so `CNL_COMPILER_DATA_ASSET_REF_MISSING` includes scenario `entityId` for embedded asset reference failures.
  - Added malformed embedded-asset compiler golden fixtures and unit assertions.
  - Added integration coverage that invalid embedded scenario references fail fast with stable `path` + `entityId`.
- Deviations from original plan:
  - Did not add new `test/fixtures/spec/fitl-invalid-*.md` fixtures because equivalent negative map/piece catalog coverage already exists in `test/unit/data-assets.test.ts`; scope was narrowed to the uncovered compiler diagnostic context gap.
  - Did not modify `test/unit/validate-gamedef.golden.test.ts`, as it is not the primary data-asset envelope diagnostic surface.
- Verification:
  - `npm run test:unit -- --coverage=false` passed.
  - `npm run test:integration` passed.

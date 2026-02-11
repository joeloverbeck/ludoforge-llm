# FITLMAPSCEANDSTAMOD-005 - Foundation Scenario Asset and Setup Loader

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `brainstorming/implement-fire-in-the-lake-foundation.md` (Setup section)
**Depends on**: `FITLMAPSCEANDSTAMOD-002`, `FITLMAPSCEANDSTAMOD-003`, `FITLMAPSCEANDSTAMOD-004`

## Goal
Create one canonical foundation scenario payload (Westy’s War slice) embedded in Game Spec YAML and load it into a complete initial state with pool/out-of-play placement accounting.

## Architecture Contract
- Canonical execution path: `GameSpecDoc` YAML -> parser/validator/compiler -> `GameDef` -> simulation.
- FITL map/piece/scenario content must be encoded in `GameSpecDoc` YAML data (for example `dataAssets`) and compiled through generic pipelines.
- `data/fitl/...` may be used as fixture/reference material only and must not be a required runtime input for compilation/execution.
- No FITL-specific branching in compiler/runtime/kernel modules; add reusable primitives instead.

## Assumption Reassessment (2026-02-11)
- Scenario/map/piece-catalog ingestion in this codebase currently happens in the generic CNL parse/validate/compile pipeline, not via FITL-specific runtime setup code in `src/kernel/initial-state.ts`.
- Map-driven section derivation is currently compiler-driven (`src/cnl/compiler.ts`) and spec validation of data-asset cross-references is handled in `src/cnl/validate-spec.ts`.
- The ticket's original expected touch list and tests referencing `validate-gamedef` FITL setup constraints and `game-loop` setup loading do not match the current generic architecture or existing test organization.

## Scope
- Keep the canonical path generic: YAML `dataAssets` -> `validateGameSpec` cross-reference checks -> `compileGameSpecToGameDef` derived sections.
- Ensure scenario references (`mapAssetId`, `pieceCatalogAssetId`) resolve consistently between validator and compiler, including identifier normalization behavior.
- Add/strengthen regression tests around scenario reference resolution and map-driven zone derivation.

## File List Expected To Touch
- `src/cnl/validate-spec.ts`
- `src/cnl/compiler.ts`
- `test/unit/validate-spec.test.ts`
- `test/integration/compile-pipeline.test.ts`

## Out Of Scope
- No alternative scenarios (A Better War, full campaign variants).
- No non-player setup options.
- No deck/event execution behavior.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-spec.test.ts`
  - validates scenario `mapAssetId`/`pieceCatalogAssetId` references against declared assets.
- `test/integration/compile-pipeline.test.ts`
  - compiles map-driven zones from embedded assets when scenario references are valid.
  - uses the same identifier normalization behavior as validator for scenario reference resolution.
- `npm run test:unit -- --coverage=false`
- `npm run test:integration`

## Invariants That Must Remain True
- No required filesystem asset lookup for scenario/map/piece-catalog resolution from `dataAssets`.
- Validation and compilation must not disagree on whether a scenario asset reference resolves.

## Outcome
- Completion date: 2026-02-11.
- Actual implementation changes:
  - Aligned compiler scenario asset-id resolution with validator normalization (`NFC`) so canonical-equivalent ids resolve consistently.
  - Added regression coverage for scenario reference validation and normalized reference compilation.
  - Reframed ticket scope/acceptance criteria to the generic CNL parse/validate/compile data-asset path.
- Deviations from original ticket plan:
  - No changes were needed in `src/kernel/initial-state.ts`, `src/kernel/validate-gamedef.ts`, or `test/integration/game-loop.test.ts`.
  - Validation/enforcement remains generic and data-driven at CNL/compiler layer rather than FITL-specific runtime setup logic.
- Verification:
  - `npm run build`
  - `npm run test:unit -- --coverage=false`
  - `npm run test:integration`

# ARCDECANDGEN-013: Rename Compiler + YAML from Operations to Pipelines
**Status**: ✅ COMPLETED

**Phase**: 4A — part 3 (Unified Action Resolution Pipeline — compiler + YAML layer)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-011 (type renames), ARCDECANDGEN-012 (runtime renames), ARCDECANDGEN-002 (compiler split)

## Goal

Complete the operation → pipeline rename in the compiler and GameSpecDoc layers. Update FITL production YAML.

## File List (files to touch)

### Files to modify
- `src/cnl/compile-operations.ts` — `lowerOperationProfiles` → `lowerActionPipelines`, update output field to `actionPipelines`, update internal field mapping (`legality.when` → `legality`, `cost.validate` → `costValidation`, `cost.spend` → `costEffects`, `resolution` → `stages`, `partialExecution.mode` → `atomicity` with value mapping `forbid→atomic`/`allow→partial`, `linkedSpecialActivityWindows` → `linkedWindows`)
- `src/cnl/game-spec-doc.ts` — `operationProfiles` → `actionPipelines` in GameSpecDoc type
- `src/cnl/validate-extensions.ts` — validate `actionPipelines` section instead of `operationProfiles`
- `src/cnl/section-identifier.ts` — update section name recognition
- `src/cnl/compiler-core.ts` — update section wiring
- `data/games/fire-in-the-lake.md` — rename YAML section `operationProfiles` → `actionPipelines`, rename fields in each profile per the mapping above

### Test fixtures to update
- Any test fixtures (`.md` files in `test/fixtures/`) referencing `operationProfiles` YAML sections

## Out of Scope

- **No new features** — pure rename + field flattening
- **No changes to** `src/kernel/` (done in 011, 012)
- **No changes to** `src/agents/`, `src/sim/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### Invariants that must remain true
- No `operationProfile` string appears anywhere in the codebase (grep verification)
- FITL production spec compiles successfully with renamed YAML
- `compileProductionSpec()` produces a valid `gameDef` with `actionPipelines` field
- All FITL integration tests pass

## Outcome

- Completion date: February 13, 2026
- What changed:
  - Compiler/GameSpecDoc extension layer and FITL production YAML were renamed from `operationProfiles` to `actionPipelines`.
  - Field mappings were flattened to pipeline terminology (`legality`, `costValidation`, `costEffects`, `stages`, `atomicity`, `linkedWindows`).
  - CNL compiler wiring, section identification, and extension validation paths now resolve `actionPipelines`.
- Deviations from original plan:
  - None noted in the archived ticket.
- Verification results:
  - Archive-time grep check showed no remaining `operationProfiles` references in `src/cnl`, `data/games/fire-in-the-lake.md`, or `test/fixtures`.
  - Archive-time grep check confirmed `actionPipelines` usage in compiler/doc/validation/section files and FITL YAML.

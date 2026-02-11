# FITLMAPSCEANDSTAMOD-007 - Negative Asset Fixtures and Diagnostic Hardening

**Status**: Proposed
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

## Scope
- Add invalid inline-asset fixture specs for unknown ids, bounds violations, illegal status dimensions, and inventory mismatches.
- Add golden diagnostics tests for compile-time and load-time failures.
- Normalize diagnostic shape so error outputs remain stable and reviewable.

## File List Expected To Touch
- `test/fixtures/spec/fitl-invalid-unknown-id.md` (new)
- `test/fixtures/spec/fitl-invalid-bounds.md` (new)
- `test/fixtures/spec/fitl-invalid-status-transition.md` (new)
- `test/fixtures/spec/fitl-invalid-inventory-mismatch.md` (new)
- `test/unit/validate-gamedef.golden.test.ts`
- `test/unit/compiler.golden.test.ts`
- `test/integration/compile-pipeline.test.ts`

## Out Of Scope
- No changes to valid scenario/map data.
- No operation/turn/coup/event semantics.
- No AI/simulation behavior changes.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-gamedef.golden.test.ts`
  - includes stable diagnostics for each negative FITL fixture.
- `test/unit/compiler.golden.test.ts`
  - compile failures show source path + `entityId` consistently for embedded assets.
- `test/integration/compile-pipeline.test.ts`
  - invalid embedded assets fail fast without crashing the pipeline.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Diagnostics are deterministic and stable for golden testing.
- Failures are explicit (no silent clamping or ignored invalid entries).
- Non-FITL existing compile diagnostics remain unchanged unless intentionally extended.

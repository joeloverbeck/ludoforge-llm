# FITLMAPSCEANDSTAMOD-007 - Negative Asset Fixtures and Diagnostic Hardening

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/15a-fitl-foundation-gap-analysis-matrix.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-002`, `FITLMAPSCEANDSTAMOD-003`, `FITLMAPSCEANDSTAMOD-004`, `FITLMAPSCEANDSTAMOD-005`

## Goal
Add a dedicated negative-fixture suite for malformed FITL assets to guarantee fail-fast compile/load diagnostics with precise source context.

## Scope
- Add invalid fixture assets for unknown ids, bounds violations, illegal status dimensions, and inventory mismatches.
- Add golden diagnostics tests for compile-time and load-time failures.
- Normalize diagnostic shape so error outputs remain stable and reviewable.

## File List Expected To Touch
- `test/fixtures/gamedef/fitl-invalid-unknown-id.json` (new)
- `test/fixtures/gamedef/fitl-invalid-bounds.json` (new)
- `test/fixtures/gamedef/fitl-invalid-status-transition.json` (new)
- `test/fixtures/gamedef/fitl-invalid-inventory-mismatch.json` (new)
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
  - compile failures show `assetPath` + `entityId` consistently.
- `test/integration/compile-pipeline.test.ts`
  - invalid assets fail fast without crashing the pipeline.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Diagnostics are deterministic and stable for golden testing.
- Failures are explicit (no silent clamping or ignored invalid entries).
- Non-FITL existing compile diagnostics remain unchanged unless intentionally extended.

# FITLMAPSCEANDSTAMOD-008 - FITL Initial-State Snapshot and Non-FITL Regression

**Status**: Proposed
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-005`, `FITLMAPSCEANDSTAMOD-006`, `FITLMAPSCEANDSTAMOD-007`

## Goal
Lock deterministic FITL initial-state serialization and prove no behavioral regressions for existing non-FITL compile/runtime paths.

## Scope
- Add FITL initial-state golden fixture and snapshot test.
- Add serialization roundtrip assertion for FITL state shape.
- Add explicit non-FITL regression checks in compile/sim paths.

## File List Expected To Touch
- `test/fixtures/trace/fitl-foundation-initial-state.golden.json` (new)
- `test/unit/serde.test.ts`
- `test/unit/initial-state.test.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/integration/sim/simulator-golden.test.ts`

## Out Of Scope
- No event-card execution tests (Spec 20).
- No operation legality sequencing tests (Spec 17/18).
- No coup-round scoring/victory checks (Spec 19).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/initial-state.test.ts`
  - FITL foundation scenario snapshot remains byte-stable.
- `test/unit/serde.test.ts`
  - FITL state serialize/deserialize roundtrip is lossless.
- `test/integration/determinism-full.test.ts`
  - same seed + same moves remains byte-identical with FITL assets present.
- `test/integration/compile-pipeline.test.ts`
  - existing non-FITL fixtures compile unchanged.
- `npm test`

## Invariants That Must Remain True
- Deterministic initial-state serialization for FITL assets.
- Existing non-FITL games still compile and run unchanged.
- No FITL-specific branches introduced in generic compiler/kernel modules.

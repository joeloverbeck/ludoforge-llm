# FITLMAPSCEANDSTAMOD-008 - FITL Initial-State Snapshot and Non-FITL Regression

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-005`, `FITLMAPSCEANDSTAMOD-006`, `FITLMAPSCEANDSTAMOD-007`

## Goal
Lock deterministic FITL initial-state serialization and prove no behavioral regressions for existing non-FITL compile/runtime paths.

## Architecture Contract
- Canonical execution path: `GameSpecDoc` YAML -> parser/validator/compiler -> `GameDef` -> simulation.
- FITL initialization and regression checks must run from compiled YAML-only inputs without requiring runtime filesystem asset reads.
- Non-FITL regressions must confirm newly added primitives remain reusable and game-agnostic (no FITL-specific branching).

## Reassessed Assumptions (2026-02-11)
- `test/fixtures/spec/` does not exist in this repository. CNL fixtures live under `test/fixtures/cnl/`.
- Current `test/unit/initial-state.test.ts` and `test/unit/serde.test.ts` cover generic kernel behavior, but do not yet snapshot a FITL-shaped initial state compiled from embedded `dataAssets`.
- `test/integration/compile-pipeline.test.ts` already includes non-FITL and data-asset compile regressions; this ticket should extend coverage only where FITL initial-state determinism is still missing.
- `test/integration/determinism-full.test.ts` is a generic hash-timeline replay and should remain unchanged unless a concrete regression is found.

## Scope (Updated)
- Add one FITL foundation inline CNL fixture under existing `test/fixtures/cnl/` structure.
- Add one FITL initial-state golden JSON fixture and assert deterministic byte-stable serialization from YAML-embedded assets.
- Add FITL-shaped game-state serde roundtrip assertion using the compiled initial state.
- Keep non-FITL integration coverage intact; only add regression checks if current suites miss the target behavior.

## File List Expected To Touch
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` (new)
- `test/fixtures/trace/fitl-foundation-initial-state.golden.json` (new)
- `test/unit/serde.test.ts`
- `test/unit/initial-state.test.ts`
- `test/integration/compile-pipeline.test.ts` (only if a targeted non-FITL regression assertion is missing)

## Out Of Scope
- No event-card execution tests (Spec 20).
- No operation legality sequencing tests (Spec 17/18).
- No coup-round scoring/victory checks (Spec 19).

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/initial-state.test.ts`
  - FITL foundation initial-state snapshot from embedded `dataAssets` remains byte-stable.
- `test/unit/serde.test.ts`
  - FITL-shaped state serialize/deserialize roundtrip is lossless.
- `test/integration/compile-pipeline.test.ts`
  - existing non-FITL fixtures compile unchanged.
- `npm run test:unit`
- `npm run test:integration`

## Invariants That Must Remain True
- Deterministic initial-state serialization for FITL assets.
- Existing non-FITL games still compile and run unchanged.
- No FITL-specific branches introduced in generic compiler/kernel modules.
- FITL initialization remains executable from YAML-only inputs.

## Outcome
- Completion date: 2026-02-11
- Implemented changes:
  - Added `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` as a canonical FITL inline-asset CNL fixture.
  - Added `test/fixtures/trace/fitl-foundation-initial-state.golden.json` for deterministic FITL initial-state snapshot assertions.
  - Extended `test/unit/initial-state.test.ts` with a FITL initial-state golden snapshot test compiled from embedded `dataAssets`.
  - Extended `test/unit/serde.test.ts` with a FITL-shaped initial-state serialize/deserialize roundtrip assertion compiled from embedded `dataAssets`.
- Deviations from original plan:
  - Did not modify `test/integration/determinism-full.test.ts` or `test/integration/sim/simulator-golden.test.ts`; existing non-FITL regression coverage was already sufficient after reassessment.
  - Updated fixture path assumptions from non-existent `test/fixtures/spec/` to the repository’s actual `test/fixtures/cnl/` structure.
- Verification:
  - `npm run test:unit` passed.
  - `npm run test:integration` passed.

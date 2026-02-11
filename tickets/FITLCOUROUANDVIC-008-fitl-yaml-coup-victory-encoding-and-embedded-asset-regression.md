# FITLCOUROUANDVIC-008 - FITL YAML Coup/Victory Encoding and Embedded-Asset Regression

**Status**: Planned  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001` through `FITLCOUROUANDVIC-007`

## Goal
Encode complete foundation Coup/victory behavior in FITL `GameSpecDoc` YAML fixtures and add integration regression tests proving compile+run works from embedded YAML assets without required runtime `data/fitl/...` reads.

## Implementation Tasks
1. Add/extend FITL compiler fixtures with declarative Coup phase plan and victory formulas.
2. Ensure all required map/piece/scenario data stays representable as embedded `dataAssets`.
3. Add integration tests that compile fixture YAML and execute through simulation to Coup/victory completion.
4. Add explicit regression asserting no required runtime reads from `data/fitl/...` for those tests.

## File List Expected To Touch
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`
- `test/fixtures/trace/fitl-turn-flow.golden.json`
- `test/fixtures/trace/fitl-coup-victory.golden.json` (new)
- `test/integration/fitl-turn-flow-golden.test.ts`
- `test/integration/fitl-coup-victory.test.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/unit/data-assets.test.ts`

## Out Of Scope
- Adding optional rules excluded by Spec 19 (deception marker, handicap).
- Engine/runtime primitive design changes beyond what earlier tickets require.
- Event-card implementation (Spec 20).

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- `node --test dist/test/unit/data-assets.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Canonical execution path stays `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.
- Embedded fixture assets are sufficient runtime inputs for tested scenarios.
- Golden traces remain deterministic across repeated runs with identical seeds/inputs.


# FITLCOUROUANDVIC-008 - FITL YAML Coup/Victory Encoding and Embedded-Asset Regression

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001` through `FITLCOUROUANDVIC-007`

## Goal
Encode foundation Coup/victory declarations in FITL `GameSpecDoc` YAML fixtures and add integration regression coverage proving compile+run works from embedded YAML `dataAssets` without required runtime `data/fitl/...` reads.

## Assumption Reassessment (2026-02-11)
- `coupPlan`/`victory` runtime support is already implemented and covered at unit/integration level (`test/unit/terminal.test.ts`, existing `test/integration/fitl-coup-victory.test.ts`).
- Current `test/integration/fitl-coup-victory.test.ts` builds `GameDef` directly and does not validate compile-from-YAML with embedded FITL assets.
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` currently focuses on baseline turn-flow/data-asset compile coverage and intentionally avoids coupling to coup/victory terminal scenarios.
- No dedicated embedded-asset fixture currently exercises coup/victory compile+run end-to-end.
- The ticket should therefore target fixture + integration regression coverage, not kernel/runtime feature additions.

## Implementation Tasks
1. Add a dedicated FITL compiler fixture that includes embedded `map`/`pieceCatalog`/`scenario` assets plus declarative `coupPlan` and `victory` sections.
2. Add integration coverage that parses + compiles that fixture and executes to both:
   - a during-Coup threshold win, and
   - a final-Coup margin-ranked win.
3. Assert the fixture scenario is self-contained (no `data/fitl/...` references) and compiles/runs successfully from embedded YAML assets.

## File List Expected To Touch
- `test/fixtures/cnl/compiler/fitl-foundation-coup-victory-inline-assets.md` (new)
- `test/integration/fitl-coup-victory.test.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/unit/data-assets.test.ts` (only if additional envelope assertions are needed)

## Out Of Scope
- Adding optional rules excluded by Spec 19 (deception marker, handicap).
- Engine/runtime primitive design changes beyond what earlier tickets require.
- Event-card implementation (Spec 20).

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- `node --test dist/test/unit/data-assets.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Canonical execution path stays `GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.
- Embedded fixture assets are sufficient compile/runtime inputs for tested scenarios.
- Golden traces remain deterministic across repeated runs with identical seeds/inputs.

## Outcome
- Completion date: 2026-02-11
- Actually changed:
  - Added `test/fixtures/cnl/compiler/fitl-foundation-coup-victory-inline-assets.md` with embedded map/piece/scenario assets and declarative `coupPlan`/`victory`.
  - Reworked `test/integration/fitl-coup-victory.test.ts` to parse+compile fixture YAML and execute both during-Coup threshold and final-Coup ranking outcomes.
  - Added compile pipeline regression coverage for the new fixture in `test/integration/compile-pipeline.test.ts`.
- Deviations from original plan:
  - Did not modify `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md` to avoid coupling baseline initial-state fixture behavior to coup/victory terminal scenarios.
  - Did not require kernel/runtime source changes because coup/victory execution support already existed.
- Verification results:
  - `npm run build`
  - `npm run test:unit -- --coverage=false --testPathPattern='(data-assets|no-hardcoded-fitl-audit)'`
  - `node --test dist/test/integration/fitl-coup-victory.test.js`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `node --test dist/test/unit/data-assets.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

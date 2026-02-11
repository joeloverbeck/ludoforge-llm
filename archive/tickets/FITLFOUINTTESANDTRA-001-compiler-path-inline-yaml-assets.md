# FITLFOUINTTESANDTRA-001 - Compiler Path Integration for Inline FITL YAML Assets

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: none

## Goal
Verify FITL foundation specs run through the canonical path (`GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation) using embedded YAML assets only.

## Assumption Reassessment (updated)
- `test/integration/compile-pipeline.test.ts` already contains FITL inline-asset parse/validate/compile coverage and structural `GameDef` invariant assertions.
- Canonical-path simulation coverage for the same inline FITL fixture already exists in `test/integration/fitl-coup-victory.test.ts`.
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.golden.json` is not present and is not required to satisfy this ticket.
- Existing coverage already asserts no runtime dependency on `data/fitl/...` paths for these inline-asset tests.

## Implementation Tasks
1. Keep/confirm integration coverage for inline FITL YAML fixture parsing, validation, and compile success.
2. Keep/confirm structural `GameDef` invariants required by runtime for foundation scenarios.
3. Keep/confirm canonical-path simulation coverage from the same inline YAML fixture.
4. Keep/confirm no runtime dependency on `data/fitl/...` filesystem artifacts for these tests.

## File list it expects to touch
- `tickets/FITLFOUINTTESANDTRA-001-compiler-path-inline-yaml-assets.md`

## Out of scope
- Event-card behavior assertions (card 82, card 27).
- Operation legality and limited-op behavioral assertions.
- Coup-phase resource/support/victory recomputation assertions beyond existing compile-path fixture checks.
- Golden trace byte-identity checks.
- Architecture-audit and non-FITL regression tests.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- `node --test dist/test/integration/parse-validate-full-spec.test.js`
- `node --test dist/test/unit/compiler-diagnostics.test.js`

## Invariants that must remain true
- Compile/runtime path remains generic and game-agnostic.
- FITL compile + simulation success is achievable with YAML-embedded data assets only.
- Compiler diagnostics stay deterministic for identical malformed input.

## Outcome
- Completion date: 2026-02-11
- What changed:
  - Reassessed and corrected ticket assumptions/scope to match the existing implementation and tests.
  - Updated acceptance criteria to include canonical-path simulation verification (`fitl-coup-victory` integration test).
  - Removed the incorrect expectation of a required `fitl-foundation-inline-assets.golden.json` fixture.
- Deviations from original plan:
  - No engine/compiler/runtime code changes were necessary because the required behavior was already implemented and covered.
  - No new test files were added; ticket completion was achieved by correcting scope and verifying existing tests.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/compile-pipeline.test.js` passed.
  - `node --test dist/test/integration/fitl-coup-victory.test.js` passed.
  - `node --test dist/test/integration/parse-validate-full-spec.test.js` passed.
  - `node --test dist/test/unit/compiler-diagnostics.test.js` passed.

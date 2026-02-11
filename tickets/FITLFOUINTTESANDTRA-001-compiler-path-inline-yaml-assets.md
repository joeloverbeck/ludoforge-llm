# FITLFOUINTTESANDTRA-001 - Compiler Path Integration for Inline FITL YAML Assets

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: none

## Goal
Add integration coverage proving FITL foundation specs compile and simulate through the canonical path (`GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation) using embedded YAML assets only.

## Implementation Tasks
1. Add/extend integration test coverage for inline FITL YAML fixture text parsing, validation, and compile success.
2. Assert structural `GameDef` invariants required by runtime for foundation scenarios.
3. Assert no runtime dependency on `data/fitl/...` filesystem artifacts for these tests.

## File list it expects to touch
- `test/integration/compile-pipeline.test.ts`
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.md`
- `test/fixtures/cnl/compiler/fitl-foundation-inline-assets.golden.json` (new or updated)

## Out of scope
- Event-card behavior assertions (card 82, card 27).
- Operation legality and limited-op behavioral assertions.
- Coup-phase resource/support/victory recomputation assertions.
- Golden trace byte-identity checks.
- Architecture-audit and non-FITL regression tests.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/parse-validate-full-spec.test.js`
- `node --test dist/test/unit/compiler-diagnostics.test.js`

## Invariants that must remain true
- Compile/runtime path remains generic and game-agnostic.
- FITL compile success is achievable with YAML-embedded data assets only.
- Compiler diagnostics stay deterministic for identical malformed input.


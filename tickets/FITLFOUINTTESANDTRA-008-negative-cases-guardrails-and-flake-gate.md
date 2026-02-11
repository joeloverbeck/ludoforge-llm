# FITLFOUINTTESANDTRA-008 - Negative Cases, Guardrails, and Flake Gate

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-006`, `FITLFOUINTTESANDTRA-007`

## Goal
Add negative-path and guardrail tests for malformed/incomplete FITL YAML, missing required data assets, and nondeterministic-ordering regressions, including repeated-run stability checks.

## Implementation Tasks
1. Add malformed/incomplete FITL YAML failure cases with deterministic diagnostics assertions.
2. Add missing-required-data failures that stop compile/simulation early with clear error messaging.
3. Add repeated-run stability gate around deterministic FITL integration scenarios to catch flakiness.

## File list it expects to touch
- `test/unit/compiler-diagnostics.test.ts`
- `test/integration/parse-validate-full-spec.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/fixtures/cnl/compiler/compile-fitl-assets-malformed.md`
- `test/fixtures/cnl/compiler/compile-fitl-assets-malformed.golden.json`

## Out of scope
- New FITL gameplay capabilities.
- Architecture hardcoding policy changes.
- Non-FITL regression scenario expansion beyond minimal sanity coverage.
- Trace fixture format redesign.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler-diagnostics.test.js`
- `node --test dist/test/integration/parse-validate-full-spec.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `npm test`

## Invariants that must remain true
- Malformed or incomplete YAML failures remain deterministic and reproducible.
- Required declarative FITL data omissions fail early with clear diagnostics.
- No flaky FITL deterministic tests across repeated executions.


# FITLFOUINTTESANDTRA-007 - Architecture Audit and Non-FITL Regression Coverage

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-004`, `FITLFOUINTTESANDTRA-005`

## Goal
Enforce Spec 15a-aligned audits proving FITL logic remains declarative and that at least one non-FITL game path still compiles/runs unchanged.

## Implementation Tasks
1. Extend hardcoding-audit tests for generic runtime/compiler modules (`src/kernel/**`, `src/cnl/**`).
2. Add/extend regression integration test for one non-FITL game spec path.
3. Ensure audit failures provide deterministic, actionable diagnostics.

## File list it expects to touch
- `test/unit/no-hardcoded-fitl-audit.test.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/integration/sim/simulator.test.ts`
- `test/fixtures/cnl/compiler/compile-valid.md` (only if needed for explicit non-FITL regression path fixture)

## Out of scope
- FITL scenario behavior changes.
- Golden trace fixture churn.
- New kernel/compiler features outside audit or regression assertions.
- Performance benchmarking.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `node --test dist/test/integration/sim/simulator.test.js`
- `npm test`

## Invariants that must remain true
- Engine/compiler core paths remain game-agnostic.
- FITL behavior is driven by declarative payloads, not hardcoded branches.
- Non-FITL compile/sim path remains green without FITL-specific toggles.


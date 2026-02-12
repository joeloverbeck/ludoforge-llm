# FITLFOUINTTESANDTRA-007 - Architecture Audit and Non-FITL Regression Coverage

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-004`, `FITLFOUINTTESANDTRA-005`

## Goal
Enforce Spec 15a-aligned audits proving FITL logic remains declarative and that at least one non-FITL game path still compiles/runs unchanged.

## Assumption Reassessment
- Existing `test/unit/no-hardcoded-fitl-audit.test.ts` already scans `src/kernel/**` and `src/cnl/**`, but diagnostics ordering is tied to filesystem traversal order.
- Existing non-FITL regression in `test/integration/compile-pipeline.test.ts` proves parse/validate/expand/compile for `compile-valid.md`, but does not exercise simulation runtime.
- `test/integration/sim/simulator.test.ts` currently validates simulator behavior using in-memory `GameDef` objects, not a non-FITL `GameSpecDoc` compile path.
- `test/fixtures/cnl/compiler/compile-valid.md` already exists and should remain unchanged unless runtime coverage requires fixture-level changes.

## Implementation Tasks
1. Make hardcoding-audit failure output deterministic and actionable (stable ordering of scanned files/violations).
2. Add a non-FITL compile-to-simulation regression test in `test/integration/sim/simulator.test.ts` that compiles a non-FITL `GameSpecDoc` and runs it through simulation.
3. Keep existing non-FITL compile-path regression assertions in `test/integration/compile-pipeline.test.ts` green without fixture churn.

## File list it expects to touch
- `test/unit/no-hardcoded-fitl-audit.test.ts`
- `test/integration/sim/simulator.test.ts`
- `test/integration/compile-pipeline.test.ts` (read/verify; edit only if required by assertion alignment)
- `test/fixtures/cnl/compiler/compile-valid.md` (no change expected)

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

## Outcome
- **Completion date**: 2026-02-12
- **What changed**:
  - Updated this ticket's assumptions to match current repository reality before implementation.
  - Made hardcoded FITL audit diagnostics deterministic/actionable via stable ordering and explicit failure message formatting.
  - Added non-FITL regression coverage that compiles `compile-valid.md` and executes simulation via `runGames`.
- **Deviations from original plan**:
  - Did not modify `test/fixtures/cnl/compiler/compile-valid.md`; existing fixture was sufficient.
  - Did not change `test/integration/compile-pipeline.test.ts`; existing compile-path assertions already covered non-FITL compile regression.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `node --test dist/test/integration/sim/simulator.test.js`
  - `npm test`

# GAMSPECOM-008 - Pipeline Orchestration and Final Validation

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Assemble the full compile pipeline (`expand -> lower -> spatial validate -> gameDef validate -> deterministic diagnostics`) and enforce `gameDef: null` behavior on compile errors.

## Reassessed Assumptions (2026-02-10)
- `src/cnl/compiler.ts`, `src/cnl/compiler-diagnostics.ts`, and exports in `src/cnl/index.ts` already exist and already implement the core orchestration path.
- `compileGameSpecToGameDef` already runs macro expansion, lowering, deterministic diagnostic sort+dedupe+cap, and `gameDef: null` on any error.
- Spec 07 adjacency diagnostics are already included via `validateGameDef` (which calls spatial adjacency validation internally), so a separate explicit adjacency merge stage is not required in `compiler.ts`.
- The ticket's expected test file paths are stale. Current tests live directly under `test/unit/` and `test/integration/`, not nested under `test/unit/cnl/` or `test/integration/cnl/`.

## Updated Implementation Tasks
1. Keep existing pipeline implementation as-is unless a failing test reveals a real defect.
2. Add focused pipeline integration coverage for currently under-tested invariants:
   - compile determinism/idempotency on pre-expanded docs
   - adjacency validation diagnostics flow into compiler diagnostics
   - `gameDef` is `null` when any error exists
3. Run hard verification (`npm run build`, targeted tests, `npm test`).

## File List (Expected to Touch)
- `test/integration/compile-pipeline.test.ts` (new)
- `tickets/GAMSPECOM-008-pipeline-orchestration-and-final-validation.md`

## Out of Scope
- New macro types beyond Spec 08b.
- Kernel runtime execution behavior changes.
- Parser/validator (Spec 08a) rule changes.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/compile-pipeline.test.js`
- `npm test`

### Invariants that must remain true
- Compiler never throws for user-authored inputs; errors are represented as diagnostics.
- If returned diagnostics include no errors, `validateGameDef` yields zero errors.
- Diagnostics are stable ordered by source offset, then `path`, severity rank, then `code`.
- Duplicate-equivalent diagnostics are removed deterministically.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Reassessed and corrected stale ticket assumptions (existing compiler orchestration and diagnostic pipeline were already implemented).
  - Added `test/integration/compile-pipeline.test.ts` to verify:
    - deterministic compile behavior for raw vs pre-expanded docs
    - adjacency diagnostics surfaced through compile results
    - `gameDef` is `null` when error diagnostics exist
  - Added a validator regression test in `test/unit/validate-gamedef.test.ts` and a minimal fix in `src/kernel/validate-gamedef.ts` so binding-qualified selectors like `hand:$p` validate correctly against player-owned zone bases.
- **Deviation from original plan**:
  - No compiler orchestration rewrite was needed; existing implementation already satisfied most tasks.
  - Work focused on assumption correction plus targeted test coverage and one validator edge-case bugfix exposed by the new pipeline test.
- **Verification**:
  - `npm run build`
  - `node --test dist/test/integration/compile-pipeline.test.js`
  - `node --test dist/test/unit/validate-gamedef.test.js`
  - `npm test`

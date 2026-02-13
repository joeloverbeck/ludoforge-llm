# ARCDECANDGEN-005: Split `validate-gamedef.ts` into 4 focused files

**Status**: ✅ COMPLETED
**Phase**: 1E (File Decomposition — Pure Refactoring)
**Priority**: P0
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-004)

## Goal

Split `src/kernel/validate-gamedef.ts` (1291 lines) into 4 cohesive files.

## File List (files to touch)

### New files to create
- `src/kernel/validate-gamedef-core.ts` (~150 lines) — `validateGameDef`, section dispatch
- `src/kernel/validate-gamedef-structure.ts` (~350 lines) — metadata, zones, tokenTypes, turnStructure, vars validation
- `src/kernel/validate-gamedef-behavior.ts` (~450 lines) — actions, triggers, endConditions, effects, conditions validation
- `src/kernel/validate-gamedef-extensions.ts` (~350 lines) — turnFlow, operationProfiles, coupPlan, victory, eventCards validation

### Files to modify
- `src/kernel/validate-gamedef.ts` — gut contents, replace with barrel re-exports
- `src/kernel/index.ts` — adjust only if export surface changes (expected: no change)

## Reassessed Assumptions (2026-02-13)

- The codebase still has a monolithic `src/kernel/validate-gamedef.ts` at 1291 lines, so the split is still required.
- `src/kernel/index.ts` already exports `validate-gamedef.ts`; no consumer import churn is expected.
- `validateInitialPlacementsAgainstStackingConstraints` is part of the current public API and must remain exported from `src/kernel/validate-gamedef.ts` after the split.
- The hardcoded test count (`1078`) is stale. Acceptance is updated to require that all currently existing tests in the targeted suites pass.

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming**
- **No import changes** in consumers
- **No test changes**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all currently existing tests pass with zero behavioral regressions
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/validate-gamedef.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/kernel/validate-gamedef*.ts`)

## Outcome

- **Completed on**: 2026-02-13
- **What changed (actual)**:
  - Split `src/kernel/validate-gamedef.ts` into:
    - `src/kernel/validate-gamedef-core.ts`
    - `src/kernel/validate-gamedef-structure.ts`
    - `src/kernel/validate-gamedef-behavior.ts`
    - `src/kernel/validate-gamedef-extensions.ts`
  - Converted `src/kernel/validate-gamedef.ts` into a barrel re-export.
  - Preserved public exports, including `validateGameDef` and `validateInitialPlacementsAgainstStackingConstraints`.
- **Deviations from original plan**:
  - `src/kernel/index.ts` required no changes.
  - Acceptance language was updated to remove a stale fixed test count and require all current tests to pass.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (140/140 test files passing).
  - `madge` circular check could not be executed in this environment because `madge` is not locally installed.

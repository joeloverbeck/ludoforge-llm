# ARCDECANDGEN-005: Split `validate-gamedef.ts` into 4 focused files

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
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming**
- **No import changes** in consumers
- **No test changes**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/validate-gamedef.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/kernel/validate-gamedef*.ts`)

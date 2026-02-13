# ARCDECANDGEN-003: Split `validate-spec.ts` into 5 focused files

**Phase**: 1C (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001, 002)

## Goal

Split `src/cnl/validate-spec.ts` (1688 lines) into 5 cohesive files. `validate-spec.ts` becomes a barrel re-export.

## File List (files to touch)

### New files to create
- `src/cnl/validate-spec-core.ts` (~300 lines) — `validateGameSpec`, section dispatch, unknown-key detection, suggestion engine (Levenshtein)
- `src/cnl/validate-metadata.ts` (~200 lines) — metadata, constants, globalVars, perPlayerVars validation
- `src/cnl/validate-zones.ts` (~250 lines) — zone, tokenType, setup validation
- `src/cnl/validate-actions.ts` (~400 lines) — action, trigger, endCondition, effectMacro validation
- `src/cnl/validate-extensions.ts` (~500 lines) — turnFlow, operationProfile, coupPlan, victory, eventCard, dataAsset validation

### Files to modify
- `src/cnl/validate-spec.ts` — gut contents, replace with barrel re-exports
- `src/cnl/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming** of any function or export
- **No import changes** in consumers
- **No test changes**
- **No changes to** `src/kernel/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/cnl/validate-spec.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/cnl/validate*.ts`)

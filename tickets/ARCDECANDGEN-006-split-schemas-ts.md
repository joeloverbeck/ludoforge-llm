# ARCDECANDGEN-006: Split `schemas.ts` into 4 focused files

**Phase**: 1F (File Decomposition — Pure Refactoring)
**Priority**: P0
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-005)

## Goal

Split `src/kernel/schemas.ts` (1397 lines) into 4 cohesive files.

## File List (files to touch)

### New files to create
- `src/kernel/schemas-core.ts` (~350 lines) — GameDef, GameState, core section schemas
- `src/kernel/schemas-ast.ts` (~400 lines) — EffectAST, ConditionAST, ValueExpr, query schemas
- `src/kernel/schemas-extensions.ts` (~350 lines) — turnFlow, operationProfile, coupPlan, victory, eventCard schemas
- `src/kernel/schemas-gamespec.ts` (~300 lines) — GameSpecDoc validation schemas (if any currently in schemas.ts)

### Files to modify
- `src/kernel/schemas.ts` — gut contents, replace with barrel re-exports
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming**
- **No import changes** in consumers
- **No test changes**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/` (JSON Schema files), `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/schemas.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/kernel/schemas*.ts`)

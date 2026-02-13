# ARCDECANDGEN-002: Split `compiler.ts` into 7 focused files

**Phase**: 1B (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: L
**Dependencies**: None (can be done in parallel with ARCDECANDGEN-001)

## Goal

Split `src/cnl/compiler.ts` (2285 lines — the largest file) into 7 cohesive files. `compiler.ts` becomes a thin barrel re-exporting `compileGameSpecToGameDef` and types.

## File List (files to touch)

### New files to create
- `src/cnl/compiler-core.ts` (~300 lines) — `compileGameSpecToGameDef`, `compileExpandedDoc`, `resolveCompileLimits`, `CompileOptions`, `CompileLimits` — orchestration
- `src/cnl/compile-turn-flow.ts` (~170 lines) — `lowerTurnFlow` and all its helpers
- `src/cnl/compile-operations.ts` (~420 lines) — `lowerOperationProfiles` and helpers
- `src/cnl/compile-victory.ts` (~310 lines) — `lowerVictory`, `lowerCoupPlan` and helpers
- `src/cnl/compile-event-cards.ts` (~160 lines) — `lowerEventCards`, `lowerEventCardSide` and helpers
- `src/cnl/compile-data-assets.ts` (~200 lines) — data asset derivation logic (zone materialization from map, tokenTypes from pieceCatalog, eventCardSet selection)
- `src/cnl/compile-lowering.ts` (~350 lines) — shared lowering utilities: `lowerConstants`, `lowerVarDefs`, `lowerTokenTypes`, `lowerTurnStructure`, `lowerActions`, `lowerTriggers`, `lowerEndConditions`

### Files to modify
- `src/cnl/compiler.ts` — gut contents, replace with barrel re-exports
- `src/cnl/index.ts` — may need adjustment if it re-exports from compiler directly

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming** of any function, type, or export
- **No import changes** in any consumer file
- **No test changes**
- **No changes to** `src/kernel/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`
- **No changes to** the other `src/cnl/compile-*.ts` files that already exist (`compile-conditions.ts`, `compile-effects.ts`, `compile-selectors.ts`, `compile-zones.ts`)

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/cnl/compiler.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies between split files (verify: `npx madge --circular src/cnl/compile*.ts src/cnl/compiler*.ts`)
- `import { compileGameSpecToGameDef } from '../cnl/compiler'` works identically

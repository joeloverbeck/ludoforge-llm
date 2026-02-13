# ARCDECANDGEN-004: Split `effects.ts` into 5 focused files

**Phase**: 1D (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-003)

## Goal

Split `src/kernel/effects.ts` (1445 lines) into 5 cohesive files by effect domain.

## File List (files to touch)

### New files to create
- `src/kernel/effect-dispatch.ts` (~120 lines) — `applyEffect`, `applyEffects`, `effectTypeOf`, budget management, the dispatch `switch`
- `src/kernel/effects-var.ts` (~120 lines) — `handleSetVar`, `handleAddVar`
- `src/kernel/effects-token.ts` (~550 lines) — `handleMoveToken`, `handleMoveAll`, `handleMoveTokenAdjacent`, `handleDraw`, `handleShuffle`, `handleCreateToken`, `handleDestroyToken`, `handleSetTokenProp`
- `src/kernel/effects-control.ts` (~250 lines) — `handleIf`, `handleForEach`, `handleLet`
- `src/kernel/effects-choice.ts` (~350 lines) — `handleChooseOne`, `handleChooseN`, `handleRollRandom`, `handleSetMarker`, `handleShiftMarker`

### Files to modify
- `src/kernel/effects.ts` — gut contents, replace with barrel re-exports
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming** of any function or export
- **No import changes** in consumers
- **No test changes**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/effects.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/kernel/effect*.ts`)
- `effects-token.ts` is the largest at ~550 lines — acceptable (under 600 limit)

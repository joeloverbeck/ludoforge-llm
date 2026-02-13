# ARCDECANDGEN-007: Split `legal-moves.ts` and `apply-move.ts`, consolidate `resolveOperationProfile`

**Phase**: 1G (File Decomposition — Pure Refactoring)
**Priority**: P0
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-006)

## Goal

1. Split `src/kernel/legal-moves.ts` (330 lines) into 2 files
2. Split `src/kernel/apply-move.ts` (366 lines) into 2 files
3. Consolidate the duplicated `resolveOperationProfile` function into a single source of truth in `apply-move-pipeline.ts`, imported by both consumers

## File List (files to touch)

### New files to create
- `src/kernel/legal-moves-turn-order.ts` (~170 lines) — `isMoveAllowedByTurnFlowOptionMatrix`, `applyTurnFlowWindowFilters`, `isLookaheadCardCoup`, `compareFactionByInterruptPrecedence`, `resolveInterruptWinnerFaction`, `hasOverrideToken`, `containsToken`
- `src/kernel/apply-move-pipeline.ts` (~160 lines) — `resolveOperationProfile`, `toOperationExecutionProfile`, pipeline stage execution (the canonical copy; removes duplication)

### Files to modify
- `src/kernel/legal-moves.ts` — extract turn-order functions to `legal-moves-turn-order.ts`, import `resolveOperationProfile` from `apply-move-pipeline.ts` instead of local copy
- `src/kernel/apply-move.ts` — extract pipeline functions to `apply-move-pipeline.ts`
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure extraction and de-duplication
- **No renaming** (renaming happens in ARCDECANDGEN-012)
- **No test changes**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all 1078 existing tests pass with zero modifications
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `legal-moves.ts` and `apply-move.ts` remain identical (barrel re-exports where needed)
- `resolveOperationProfile` exists in exactly ONE file (`apply-move-pipeline.ts`), imported by both `legal-moves.ts` and `apply-move.ts`
- No circular dependencies (verify: `npx madge --circular src/kernel/legal-moves*.ts src/kernel/apply-move*.ts`)
- The consolidated `resolveOperationProfile` produces identical results to both previous copies — add an integration test that calls both code paths with the same input and asserts identical output (per spec risk registry)

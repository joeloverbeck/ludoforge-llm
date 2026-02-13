# ARCDECANDGEN-004: Split `effects.ts` into 5 focused files

**Status**: ✅ COMPLETED

**Phase**: 1D (File Decomposition — Pure Refactoring)
**Priority**: P0 — prerequisite for Phase 2+
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-003)

## Goal

Split `src/kernel/effects.ts` (1445 lines) into 5 cohesive files by effect domain.

## Assumption Reassessment (2026-02-13)

- `src/kernel/effects.ts` is still a single 1445-line file, so the split is still required.
- The hardcoded test count in this ticket (`1078`) is stale and should not be treated as a contract.
- This remains a pure refactor, but additive tests are allowed if the split reveals an uncovered invariant or edge case.

## File List (files to touch)

### New files to create
- `src/kernel/effect-dispatch.ts` (~120 lines) — `applyEffect`, `applyEffects`, `effectTypeOf`, budget management, the dispatch `switch`
- `src/kernel/effects-var.ts` (~120 lines) — `applySetVar`, `applyAddVar`
- `src/kernel/effects-token.ts` (~550 lines) — `applyMoveToken`, `applyMoveAll`, `applyMoveTokenAdjacent`, `applyDraw`, `applyShuffle`, `applyCreateToken`, `applyDestroyToken`, `applySetTokenProp`
- `src/kernel/effects-control.ts` (~250 lines) — `applyIf`, `applyForEach`, `applyLet`
- `src/kernel/effects-choice.ts` (~350 lines) — `applyChooseOne`, `applyChooseN`, `applyRollRandom`, `applySetMarker`, `applyShiftMarker`

### Files to modify
- `src/kernel/effects.ts` — gut contents, replace with barrel re-exports
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure move-and-re-export
- **No renaming** of any function or export
- **No import changes** in consumers
- **No test rewrites for behavior drift**
- **No test changes unless needed to capture uncovered invariants/edge cases**
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `test/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all currently existing tests pass
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `src/kernel/effects.ts` remain identical
- No file in the new split exceeds 600 lines
- No circular dependencies (verify: `npx madge --circular src/kernel/effect*.ts`)
- `effects-token.ts` is the largest at ~550 lines — acceptable (under 600 limit)

## Outcome

- **Completion date**: 2026-02-13
- **What changed**: Reassessed stale assumptions before implementation (`handle*` naming mismatch, hardcoded test count, strict no-test-change wording).
- **What changed**: Split `src/kernel/effects.ts` into `src/kernel/effect-dispatch.ts`, `src/kernel/effects-var.ts`, `src/kernel/effects-token.ts`, `src/kernel/effects-control.ts`, and `src/kernel/effects-choice.ts`.
- **What changed**: Converted `src/kernel/effects.ts` into a thin compatibility barrel (`applyEffect`, `applyEffects`) to preserve public API.
- **Deviation vs original plan**: No functional/API deviations in kernel behavior; only ticket assumption wording was updated to reflect current repository reality.
- **Deviation vs original plan**: No test files were modified because existing coverage already caught extraction drift and passed after correction.
- **Verification**: `npm run typecheck` passed.
- **Verification**: `npm run lint` passed.
- **Verification**: `npm test` passed (140/140).
- **Verification**: `npx madge --circular ...` could not be executed in this environment due network/DNS restriction (`EAI_AGAIN` fetching `madge`).

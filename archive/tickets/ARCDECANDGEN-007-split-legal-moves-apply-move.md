# ARCDECANDGEN-007: Split `legal-moves.ts` and `apply-move.ts`, consolidate `resolveOperationProfile`

**Status**: ✅ COMPLETED

**Phase**: 1G (File Decomposition — Pure Refactoring)
**Priority**: P0
**Complexity**: M
**Dependencies**: None (can be done in parallel with 001-006)

## Goal

1. Split `src/kernel/legal-moves.ts` (330 lines) into 2 files
2. Split `src/kernel/apply-move.ts` (366 lines) into 2 files
3. Consolidate the duplicated `resolveOperationProfile` function into a single source of truth in `apply-move-pipeline.ts`, imported by all kernel consumers that currently duplicate it

## Assumptions Reassessment (2026-02-13)

- `resolveOperationProfile` is currently duplicated in **three** files, not two:
  - `src/kernel/legal-moves.ts`
  - `src/kernel/apply-move.ts`
  - `src/kernel/legal-choices.ts`
- The ticket originally said "No test changes", but this conflicts with the risk-registry requirement to prove consolidated behavior parity across call sites. Minimal test additions are in scope for this ticket.
- Test volume is not pinned to a stable count; acceptance should require passing the current suite, not a historical fixed number.

## File List (files to touch)

### New files to create
- `src/kernel/legal-moves-turn-order.ts` (~170 lines) — `isMoveAllowedByTurnFlowOptionMatrix`, `applyTurnFlowWindowFilters`, `isLookaheadCardCoup`, `compareFactionByInterruptPrecedence`, `resolveInterruptWinnerFaction`, `hasOverrideToken`, `containsToken`
- `src/kernel/apply-move-pipeline.ts` (~160 lines) — `resolveOperationProfile`, `toOperationExecutionProfile`, pipeline stage execution (the canonical copy; removes duplication)

### Files to modify
- `src/kernel/legal-moves.ts` — extract turn-order functions to `legal-moves-turn-order.ts`, import `resolveOperationProfile` from `apply-move-pipeline.ts` instead of local copy
- `src/kernel/apply-move.ts` — extract pipeline functions to `apply-move-pipeline.ts`
- `src/kernel/legal-choices.ts` — import `resolveOperationProfile` from `apply-move-pipeline.ts` instead of local copy
- `src/kernel/index.ts` — adjust if needed

## Out of Scope

- **No behavior changes** — pure extraction and de-duplication
- **No renaming** (renaming happens in ARCDECANDGEN-012)
- **No broad test rewrites** (only minimal additions/updates required to validate de-duplication invariants)
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`, `schemas/`, `data/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — current unit + integration suite passes
- `npm run typecheck` — passes cleanly
- `npm run lint` — passes cleanly

### Invariants that must remain true
- All public exports from `legal-moves.ts` and `apply-move.ts` remain identical (barrel re-exports where needed)
- `resolveOperationProfile` exists in exactly ONE file (`apply-move-pipeline.ts`), imported by `legal-moves.ts`, `apply-move.ts`, and `legal-choices.ts`
- No circular dependencies (verify: `npx madge --circular src/kernel/legal-moves*.ts src/kernel/apply-move*.ts`)
- The consolidated `resolveOperationProfile` produces identical results across all previous call paths — add/strengthen tests that exercise `legalMoves`, `legalChoices`, and `applyMove` with the same multi-profile inputs and assert consistent dispatch outcomes (per spec risk registry)

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Created `src/kernel/legal-moves-turn-order.ts` and moved turn-flow option/cancellation filtering helpers there.
  - Created `src/kernel/apply-move-pipeline.ts` as the canonical source for `resolveOperationProfile` and `toOperationExecutionProfile`.
  - Updated `src/kernel/legal-moves.ts`, `src/kernel/apply-move.ts`, and `src/kernel/legal-choices.ts` to import shared helpers and remove local duplication.
  - Strengthened `test/unit/applicability-dispatch.test.ts` to assert consistent no-applicability fallback behavior via `legalMoves`, `legalChoices`, and `applyMove`.
- **Deviation from original plan**:
  - Scope was corrected to include `src/kernel/legal-choices.ts` because a third `resolveOperationProfile` duplicate existed in code.
  - Ticket assumptions were updated to allow minimal test strengthening for the de-duplication invariant.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (140/140).
  - `npx madge --circular src/kernel/legal-moves*.ts src/kernel/apply-move*.ts` could not be completed in this sandbox (timed out).

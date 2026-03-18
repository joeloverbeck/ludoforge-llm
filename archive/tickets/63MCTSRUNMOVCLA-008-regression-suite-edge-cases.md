# 63MCTSRUNMOVCLA-008: Full Regression Suite + Edge Case Tests

**Status**: NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — tests only
**Deps**: 63MCTSRUNMOVCLA-007

## Problem

After the full migration (tickets 001-007), a comprehensive regression pass is needed to confirm no behavioral regressions across all MCTS test surfaces. Additionally, edge cases identified in the spec (section 7.6) need explicit test coverage to prevent future regressions.

## Assumption Reassessment (2026-03-16)

1. Texas Hold'em MCTS tests exist in `packages/engine/test/e2e/mcts/` — **confirmed** (default, fast, strong, mode-compare, campaign-bench).
2. MCTS unit tests in `packages/engine/test/unit/agents/mcts/` — **confirmed** (~12 test files).
3. MCTS integration tests in `packages/engine/test/integration/` — **confirmed** (`mcts-decision-integration.test.ts`).
4. The `pnpm -F @ludoforge/engine test` command runs all unit + integration tests — **confirmed**.
5. E2E MCTS tests gated behind env vars — **confirmed**.

## Architecture Check

1. Pure test ticket — validates the entire change series.
2. Edge case tests encode the spec's section 7.6 invariants as executable assertions.
3. No production code changes.

## What to Change

### 1. Run full MCTS test suite

All existing MCTS tests must pass:
- Unit tests: materialization, search, rollout, expansion, node, visitor, config, solver, MAST, belief, state-cache, diagnostics, decision-expansion
- Integration: `mcts-decision-integration.test.ts`
- E2E: Texas Hold'em (all modes), FITL (all modes)

### 2. Add edge case tests

New file: `packages/engine/test/unit/agents/mcts/classification-edge-cases.test.ts`

| Test | Description |
|------|-------------|
| only-pass-moves | State with only `pass` (complete) moves → all in `ready`, no pending, no decision roots |
| all-pending-moves | State with all pending moves → all in `pending`, no ready, only decision root children |
| mixed-ready-pending | Both concrete and decision root children coexist at root |
| single-option-forced | Single-option forced decision → decision expansion compresses |
| pool-exhaustion-during-decision-roots | Pool exhaustion during decision root creation → graceful degradation, remaining pending moves skipped |
| pending-zero-legal-options | Pending move whose first decision has 0 legal options → `expandDecisionNode` returns `'illegal'`, backprop loss |

### 3. Verify no old vocabulary in production code

Grep for:
- `concreteActionIds` — must not appear in any production source file
- `materializeConcreteCandidates` — must not appear in any production source file
- `materializeOrFastPath` — must not appear in any production source file
- `MctsTemplateDroppedEvent` — must not appear in any production source file
- `templateDropped` (as event type) — must not appear in any production source file
- `concreteCount` / `templateCount` (in visitor events) — must not appear in any production source file

### 4. Texas Hold'em regression

Run Texas Hold'em MCTS E2E tests to confirm no regression for a game that was already working. These tests exercise the "all moves complete" path and should be unaffected by the changes.

## Files to Touch

- `packages/engine/test/unit/agents/mcts/classification-edge-cases.test.ts` (new)
- Potentially minor adjustments to existing test files if edge case testing reveals issues

## Out of Scope

- Production code changes (all done in tickets 001-006)
- FITL default/strong test tuning (62MCTSSEAVIS-017)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Performance benchmarking of `legalChoicesEvaluate` overhead
- Runner integration

## Acceptance Criteria

### Tests That Must Pass

1. All unit tests in `packages/engine/test/unit/agents/mcts/` pass.
2. `mcts-decision-integration.test.ts` passes.
3. Texas Hold'em E2E tests pass (all modes: default, fast, strong, mode-compare).
4. FITL MCTS E2E tests pass (all modes: fast from ticket 007, default, strong).
5. New edge case tests pass (6 cases above).
6. Zero references to old vocabulary in production source files.
7. `pnpm -F @ludoforge/engine test` — full suite passes.
8. `pnpm turbo typecheck` — no type errors.
9. `pnpm turbo lint` — no lint errors.

### Invariants

1. No production source code changes in this ticket.
2. `legalChoicesEvaluate` is the sole source of truth for move classification in MCTS (no `concreteActionIds` fallback anywhere).
3. Determinism preserved: same seed + same moves = same classification, same tree, same result.
4. Game-agnostic: no game-specific identifiers in any production MCTS code.
5. Rollout isolation: rollout uses `completeTemplateMove` for pending moves, not incremental expansion.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/classification-edge-cases.test.ts` — 6 edge case tests from spec section 7.6

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e` (with appropriate env vars)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Archival Note

Archived on 2026-03-18 as part of the MCTS retirement cleanup. This work item remained unfinished and was removed from the active planning surface so the repository no longer presents MCTS as current architecture.

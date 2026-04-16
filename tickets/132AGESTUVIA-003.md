# 132AGESTUVIA-003: Agent retry integration test (S4.3)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/132AGESTUVIA-001.md`, `archive/tickets/132AGESTUVIA-002.md`

## Problem

Tickets 001 (shared viability predicate) and 002 (split `completionUnsatisfiable` + retry extension) fix two independent defects that together produce the `agentStuck` crash. A dedicated cross-cut test ensures the combination yields the expected behavior: given a template move classified VIABLE by the shared predicate from 001, `preparePlayableMoves` with the default `pendingTemplateCompletions = 3` — plus 002's extended retry budget — MUST return at least one playable move. Without this test, a future change that regresses either fix independently could silently break the combined contract that spec 132 is chartered to restore.

## Assumption Reassessment (2026-04-16)

1. `preparePlayableMoves` lives in `packages/engine/src/agents/prepare-playable-moves.ts` — confirmed.
2. `DEFAULT_COMPLETIONS_PER_TEMPLATE = 3` at `packages/engine/src/agents/policy-agent.ts:21` — confirmed.
3. `NOT_VIABLE_RETRY_CAP = 7` at `packages/engine/src/agents/prepare-playable-moves.ts:22` — confirmed.
4. After 001 and 002 land, the shared viability predicate exists and `drawDeadEnd` is retryable — prerequisite verified by 001's and 002's acceptance criteria; if either regresses, this test catches it.

## Architecture Check

1. Test-only diff; zero production code change.
2. Integration-level coverage between kernel (001) and agent (002) layers catches combination regressions that unit tests miss.
3. No FITL-specific dependency — uses synthetic GameDef fixtures, consistent with Foundation #1.

## What to Change

### 1. New agent-unit test file

Create `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` with at least these cases:

- **Primary S4.3 assertion**: a synthetic template move that the shared viability predicate reports VIABLE but whose random-draw distribution contains ≥1 `drawDeadEnd` option. Calling `preparePlayableMoves` with `pendingTemplateCompletions = 3` returns `completedMoves.length >= 1 || stochasticMoves.length >= 1`.
- **Retry-budget invariant**: a template whose draws are MOSTLY dead-ends but with ≥1 valid option. Assert the retry loop finds the valid option within `NOT_VIABLE_RETRY_CAP` attempts and does not exceed that cap (inspect `preparePlayableMoves`' returned statistics to verify).
- **Structural failure short-circuit**: a template that is genuinely structurally unsatisfiable (e.g., `chooseN{min:3, max:3}` over an empty options set) causes `preparePlayableMoves` to return empty `completedMoves` and `stochasticMoves` WITHOUT retrying, preserving 002's break-on-structural behavior.

## Files to Touch

- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (new)

## Out of Scope

- Production code changes — all necessary production changes are in 001 and 002.
- FITL-specific scenarios — 132AGESTUVIA-005's scope.
- Broader policy-agent behavior tests.

## Acceptance Criteria

### Tests That Must Pass

1. New file's primary S4.3 assertion passes.
2. Retry-budget invariant: no draw sequence exceeds `NOT_VIABLE_RETRY_CAP`.
3. Structural short-circuit preserved.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. After 001 + 002, any VIABLE template (per shared predicate) yields at least one playable move within bounded retries.
2. Structural failures do not trigger the retry loop — 002's short-circuit contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` — S4.3 coverage plus retry-budget and structural short-circuit invariants.

### Commands

1. `pnpm -F @ludoforge/engine test test/unit/agents/prepare-playable-moves-retry.test.ts`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

# 132AGESTUVIA-003: Agent retry integration test (S4.3)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/132AGESTUVIA-001.md`, `archive/tickets/132AGESTUVIA-002.md`

## Problem

Tickets 001 (shared viability predicate) and 002 (split `completionUnsatisfiable` + retry extension) fix two independent defects that together produce the `agentStuck` crash. A dedicated cross-cut test is still required, but the live post-002 contract is narrower than this ticket originally claimed: `preparePlayableMoves` now extends retries for `drawDeadEnd` outcomes up to the bounded `NOT_VIABLE_RETRY_CAP`, yet it does NOT guarantee success for every VIABLE template on every RNG seed. A dedicated agent-level test must therefore prove the real restored contract: bounded `drawDeadEnd` retries occur, viable completions remain reachable on representative seeds, and genuine structural failures still short-circuit immediately. Without this test, a future change that regresses either the retry extension or the structural short-circuit could silently break the combined contract that spec 132 is chartered to restore.

## Assumption Reassessment (2026-04-16)

1. `preparePlayableMoves` lives in `packages/engine/src/agents/prepare-playable-moves.ts` — confirmed.
2. `DEFAULT_COMPLETIONS_PER_TEMPLATE = 3` at `packages/engine/src/agents/policy-agent.ts:21` — confirmed.
3. `NOT_VIABLE_RETRY_CAP = 7` at `packages/engine/src/agents/prepare-playable-moves.ts:22` — confirmed.
4. After 001 and 002 land, the shared viability predicate exists and `drawDeadEnd` is retryable — prerequisite verified by 001's and 002's acceptance criteria; if either regresses, this test catches it.
5. Live evidence on current `HEAD` shows the stronger original wording here was wrong: a synthetic VIABLE template can still exhaust `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 10` attempts on some deterministic RNG seeds and return no playable move. The real contract is bounded retry, not universal success — confirmed.

## Architecture Check

1. Test-only diff; zero production code change.
2. Integration-level coverage between kernel (001) and agent (002) layers catches combination regressions that unit tests miss.
3. No FITL-specific dependency — uses synthetic GameDef fixtures, consistent with Foundation #1.

## What to Change

### 1. New agent-unit test file

Create `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` with at least these cases:

- **Primary S4.3 assertion**: a synthetic template move that the shared viability predicate reports VIABLE and whose random-draw distribution contains both successful and `drawDeadEnd` branches. Using a representative deterministic success seed, calling `preparePlayableMoves` with the default policy-agent budget of `pendingTemplateCompletions = 3` returns at least one playable move.
- **Retry-budget invariant**: the same synthetic template under a deterministic all-dead-end seed exhausts retries at exactly `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP`, returns no playable move, and never exceeds that cap (inspect `preparePlayableMoves`' returned statistics to verify).
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
2. Retry-budget invariant: no draw sequence exceeds `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP`, and the retry extension is only consumed on `drawDeadEnd` / `notViable` outcomes.
3. Structural short-circuit preserved.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. After 001 + 002, `drawDeadEnd` outcomes extend bounded retries for VIABLE templates, but the total attempt budget remains capped.
2. Structural failures do not trigger the retry loop — 002's short-circuit contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` — S4.3 coverage plus retry-budget and structural short-circuit invariants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completion date: 2026-04-17

Added `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` as the dedicated S4.3 agent-level proof. The new file uses synthetic `chooseN` fixtures to confirm the shared viability predicate still reports the template as VIABLE before completion, that a representative success seed (`1n`) yields a playable move within the policy-agent budget of `pendingTemplateCompletions = 3`, that a deterministic dead-end seed (`2n`) consumes the bounded retry extension exactly up to `3 + NOT_VIABLE_RETRY_CAP` and then stops with `drawDeadEnd`, and that a genuine structural failure (`chooseN{min:3,max:3}` over `['a','b']`) still short-circuits after one attempt with `structurallyUnsatisfiable`.

## Verification

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
3. `node --test dist/test/unit/kernel/move-completion-retry.test.js`
4. `pnpm -F @ludoforge/engine test`

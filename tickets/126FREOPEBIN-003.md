# 126FREOPEBIN-003: Add agent fallback for uncompletable per-zone binding templates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents (PolicyAgent, GreedyAgent, RandomAgent)
**Deps**: None

## Problem

~30% of FITL simulation seeds end with `agentStuck` because `PolicyAgent` cannot complete templates for legal moves containing per-zone interpolated bindings (e.g., `$movingTroops@{$space}`). The agent classifies legal moves by template and attempts parameter completion via `preparePlayableMoves()`. When all templates fail, it throws `NoPlayableMovesAfterPreparationError` — even though the legal-move list is non-empty and the moves are valid.

## Assumption Reassessment (2026-04-11)

1. `PolicyAgent` in `packages/engine/src/agents/policy-agent.ts` throws `NoPlayableMovesAfterPreparationError` at line 90 — confirmed.
2. `NoPlayableMovesAfterPreparationError` defined in `packages/engine/src/agents/no-playable-move.ts` line 3 — confirmed.
3. `GreedyAgent` (line 63) and `RandomAgent` (line 30) also throw the same error — confirmed. All three agents need the fallback.
4. The error propagates to the simulator which records `agentStuck` stop reason — this is the mechanism that ends the game.

## Architecture Check

1. The fallback is engine-agnostic — it applies to the generic `Agent` interface, not FITL-specific logic.
2. This aligns with Foundation 10 (Bounded Computation): the game should always be able to advance if legal moves exist.
3. No backwards-compatibility shims — the existing error path is replaced with a fallback, not aliased.

## What to Change

### 1. Investigate template completion failure

Before implementing the fallback, investigate why the template matcher fails on per-zone bindings. Read the `preparePlayableMoves` and `buildCompletionChooseCallback` code paths. Determine if:
- (a) The legal moves are valid but the template matcher can't handle interpolated binding names → fallback is correct
- (b) The legal moves are malformed → fix belongs in the enumerator (ticket 001), not here

### 2. Add random fallback in all three agents

If investigation confirms (a): when `preparePlayableMoves` returns zero playable moves but the input `legalMoves` list is non-empty, fall back to random selection from `legalMoves` instead of throwing `NoPlayableMovesAfterPreparationError`. Apply to `PolicyAgent`, `GreedyAgent`, and `RandomAgent`.

Log a diagnostic warning when the fallback triggers (agent name, action count, reason) so the issue is visible in simulation traces without crashing.

### 3. Preserve error for truly empty legal-move lists

If `legalMoves` itself is empty, the agents should still throw — that indicates a kernel bug, not a template matching limitation.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/test/unit/agents/agent-fallback.test.ts` (new)

## Out of Scope

- Zone filter probe fix (ticket 001)
- Enumeration budgets (ticket 002)
- Full PolicyAgent AI strategy overhaul
- Template matcher improvements beyond the fallback

## Acceptance Criteria

### Tests That Must Pass

1. Unit: PolicyAgent with non-empty legal moves but zero completable templates returns a random move instead of throwing
2. Unit: PolicyAgent with empty legal-move list still throws `NoPlayableMovesAfterPreparationError`
3. Unit: GreedyAgent and RandomAgent exhibit the same fallback behavior
4. Existing suite: `pnpm turbo test`

### Invariants

1. Agents never crash when legal moves exist (Foundation 10)
2. Determinism preserved — random fallback uses the PRNG from agent context, not `Math.random()`
3. Diagnostic warning appears in simulation trace when fallback triggers

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/agent-fallback.test.ts` — new file testing fallback behavior for all three agent types

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "agent-fallback"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`

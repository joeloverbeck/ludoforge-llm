# 126FREOPEBIN-003: Add agent fallback for uncompletable per-zone binding templates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agents (PolicyAgent, GreedyAgent, RandomAgent)
**Deps**: `archive/tickets/126FREOPEBIN-005.md`

## Problem

~30% of FITL simulation seeds end with `agentStuck` because `PolicyAgent` cannot complete templates for legal moves containing per-zone interpolated bindings (e.g., `$movingTroops@{$space}`). The agent classifies legal moves by template and attempts parameter completion via `preparePlayableMoves()`. When all templates fail, it throws `NoPlayableMovesAfterPreparationError` — even though the legal-move list is non-empty and the moves are valid.

## Assumption Reassessment (2026-04-11)

1. `PolicyAgent` in `packages/engine/src/agents/policy-agent.ts` throws `NoPlayableMovesAfterPreparationError` at line 90 — confirmed.
2. `NoPlayableMovesAfterPreparationError` defined in `packages/engine/src/agents/no-playable-move.ts` line 3 — confirmed.
3. `GreedyAgent` and `RandomAgent` already fall back to `stochasticMoves`; they still throw `NoPlayableMovesAfterPreparationError` when every pending template is unsatisfiable and no stochastic fallback exists — confirmed.
4. The error propagates to the simulator which records `agentStuck` stop reason — this is the mechanism that ends the game once kernel discovery no longer crashes first.
5. Live seed `1021`, previously grouped with the `agentStuck` cohort, currently crashes earlier on the `legalChoices` surface with `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` for missing `$targetSpaces`. Ticket `126FREOPEBIN-005` is now the prerequisite boundary before this ticket's FITL reproducer is reachable.

## Architecture Check

1. The fallback remains engine-agnostic — it applies to shared agent/template-preparation behavior, not FITL-specific logic.
2. This aligns with Foundation 10 (Bounded Computation): the game should always be able to advance if legal moves exist.
3. No backwards-compatibility shims — the existing error path is replaced with a fallback, not aliased.

## What to Change

### 1. Investigate template completion failure

Before implementing the fallback, investigate why the template matcher fails on the remaining post-`005` unsatisfiable legal moves. Read the `preparePlayableMoves` and `buildCompletionChooseCallback` code paths. Determine if:
- (a) The legal moves are valid but the template matcher can't handle interpolated binding names → fallback is correct
- (b) The legal moves are malformed → fix belongs in the enumerator (ticket 001), not here

### 2. Add random fallback in all three agents

If investigation confirms (a): when `preparePlayableMoves` returns zero playable moves but the input `legalMoves` list is non-empty, fall back to random selection from `legalMoves` instead of throwing `NoPlayableMovesAfterPreparationError`. Reassess whether the correct boundary is all three agents or a narrower shared-preparation / `PolicyAgent`-first fix, since `GreedyAgent` and `RandomAgent` already have stochastic fallbacks.

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
- Remaining legalChoices crash prerequisite (ticket 005)
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

# PHANTMOV-001: Simulator defensive catch for uncompletable template moves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/sim/simulator.ts`, all agent implementations
**Deps**: None

## Problem

When `enumerateLegalMoves` returns template moves (viable but incomplete), the
agent tries to randomly complete them via `preparePlayableMoves`. If ALL template
completions fail viability re-check, the agent receives zero playable moves and
throws. The simulator crashes instead of treating this as a `noLegalMoves` state.

Reproduction: FITL seed 1009, move 3 — NVA has 1 legal move (`rally` free
operation template) that is viable at the template level but every random
completion fails `probeMoveViability`. All three agent types (PolicyAgent,
GreedyAgent, RandomAgent) throw.

This violates FOUNDATIONS.md #6 ("Legal moves must be listable") because a move
reported as legal is actually unplayable. PHANTMOV-002 addresses the root cause
at the kernel level; this ticket is the immediate defensive fix.

## Assumption Reassessment (2026-03-29)

1. `simulator.ts` calls `agent.chooseMove()` at line ~133 without try-catch.
   Confirmed: no error handling around agent calls.
2. `enumerateLegalMoves` returns `ClassifiedMove[]` with optimistic viability.
   Confirmed: template moves can be `viable: true, complete: false`.
3. All three agents throw on zero playable moves. Confirmed: `PolicyAgent`
   (policy-eval.ts:577), `GreedyAgent` (greedy-agent.ts:62), `RandomAgent`
   (random-agent.ts:29).

## Architecture Check

1. The simulator already handles `noLegalMoves` as a stop reason (line 120-123).
   Wrapping `agent.chooseMove()` in a try-catch that maps uncompletable-template
   errors to `noLegalMoves` extends this existing pattern naturally.
2. This is game-agnostic — no FITL-specific logic. Any game with template moves
   can hit this edge case.
3. No backwards-compatibility shims. The simulator gains robustness without
   changing its external API.

## What to Change

### 1. Simulator defensive catch

In `packages/engine/src/sim/simulator.ts`, wrap the `agent.chooseMove()` call
(~line 133) in a try-catch. If the agent throws due to zero playable moves
(detect by error message pattern or error code), treat it as `noLegalMoves`:

```typescript
let selected;
try {
  selected = agent.chooseMove({ ... });
} catch (err) {
  // Template moves that passed optimistic viability may fail all completions.
  // Treat as noLegalMoves rather than crashing the simulation.
  stopReason = 'noLegalMoves';
  break;
}
```

Add a `warnings` field or stderr log so the occurrence is observable (not
silently swallowed).

### 2. Agent-level graceful degradation (optional companion)

Alternatively or additionally, make `preparePlayableMoves` return an explicit
signal when zero playable moves remain, and have each agent check this before
calling `evaluatePolicyMove`. This prevents the throw from happening in the
first place.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify)
- `packages/engine/test/unit/simulator.test.ts` or equivalent (new test)

## Out of Scope

- Fixing the kernel-level root cause (why template moves are reported as legal
  when they can't be completed). That's PHANTMOV-002.
- Changing the Agent interface.

## Acceptance Criteria

### Tests That Must Pass

1. Seed 1009 with FITL spec completes without error (game ends with
   `noLegalMoves` stop reason instead of crash)
2. All other seeds still produce identical results (determinism preserved)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Determinism: same seed + same actions = identical stateHash
2. Simulator never crashes on valid GameDef inputs
3. No game-specific logic in simulator

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/simulator-phantom-moves.test.ts` — test that
   simulator handles agent failures from uncompletable templates gracefully

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

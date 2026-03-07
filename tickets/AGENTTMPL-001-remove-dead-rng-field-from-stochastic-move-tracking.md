# AGENTTMPL-001: Remove Dead rng Field from Stochastic Move Tracking

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent stochastic fallback data structures
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-009-stochastic-template-resolution-contract-for-agents.md

## Problem

Both `RandomAgent` and `GreedyAgent` store `{ move: Move; rng: Rng }` in their `stochasticMoves` arrays, but the per-move `rng` snapshot is never read. When a stochastic fallback is selected, the agents use the outer `rng` cursor (which has advanced past all moves), not the stored per-entry `rng`. The unused field is misleading — it suggests per-move rng tracking that does not actually happen.

## Assumption Reassessment (2026-03-08)

1. `RandomAgent` stores `stochasticMoves: { move: Move; rng: Rng }[]` at `random-agent.ts:12` but only reads `.move` at lines 28 and 31; `.rng` is never accessed. — **Verified**.
2. `GreedyAgent` stores the same shape at `greedy-agent.ts:45` and only reads `.move` at lines 73 and 76; `.rng` is never accessed. — **Verified**.
3. Both agents return the outer `rng` cursor, not any per-entry rng. — **Verified** at `random-agent.ts:28,30` and `greedy-agent.ts:73,75`.

## Architecture Check

1. Removing the dead field makes the data structure match its actual usage, reducing cognitive load and preventing future confusion about which rng is authoritative.
2. Purely engine-internal agent logic — no GameSpecDoc or game-specific concerns.
3. No backwards-compatibility: just simplify the type from `{ move, rng }` to `Move`.

## What to Change

### 1. Simplify `stochasticMoves` to `Move[]` in both agents

Change:
```typescript
const stochasticMoves: { move: Move; rng: Rng }[] = [];
// ...
stochasticMoves.push({ move: result.move, rng: result.rng });
// ...
return { move: stochasticMoves[0]!.move, rng };
return { move: stochasticMoves[index]!.move, rng: nextRng };
```

To:
```typescript
const stochasticMoves: Move[] = [];
// ...
stochasticMoves.push(result.move);
// ...
return { move: stochasticMoves[0]!, rng };
return { move: stochasticMoves[index]!, rng: nextRng };
```

### 2. Remove unused `Rng` import if it becomes unused

After simplification, check whether `Rng` is still needed in `random-agent.ts` imports (it will no longer be needed there).

## Files to Touch

- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)

## Out of Scope

- Changing the stochastic fallback selection policy
- Extracting shared fallback logic (see AGENTTMPL-002)

## Acceptance Criteria

### Tests That Must Pass

1. All existing agent tests pass unchanged (no behavioral change).
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Agent stochastic fallback behavior is identical before and after this change.
2. Determinism for identical seeds is preserved.

## Test Plan

### New/Modified Tests

None — this is a pure internal refactor with no behavioral change. Existing tests cover the behavior.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`

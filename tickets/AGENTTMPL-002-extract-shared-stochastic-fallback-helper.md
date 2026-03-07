# AGENTTMPL-002: Extract Shared Stochastic Fallback Helper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — agent stochastic fallback logic extraction
**Deps**: tickets/AGENTTMPL-001-remove-dead-rng-field-from-stochastic-move-tracking.md

## Problem

Both `RandomAgent` and `GreedyAgent` contain identical stochastic fallback blocks:

```typescript
if (completedMoves.length === 0 && stochasticMoves.length > 0) {
  if (stochasticMoves.length === 1) {
    return { move: stochasticMoves[0]!.move, rng };
  }
  const [index, nextRng] = nextInt(rng, 0, stochasticMoves.length - 1);
  return { move: stochasticMoves[index]!.move, rng: nextRng };
}
```

This is a DRY violation. If the stochastic fallback policy changes (e.g., logging, weighting, more sophisticated selection), both agents need manual synchronization. The duplicated "pick one randomly from N" pattern also appears in the completed-move selection path.

## Assumption Reassessment (2026-03-08)

1. `RandomAgent` stochastic fallback block at `random-agent.ts:26-32` is identical to `GreedyAgent` at `greedy-agent.ts:71-77`. — **Verified**.
2. The "pick one from N with rng" pattern also appears at `random-agent.ts:42-47` (completed moves) and implicitly at `greedy-agent.ts:115` (tied moves). — **Verified**.
3. No existing shared agent utility module exists — agents import directly from kernel. — **Verified**: `packages/engine/src/agents/` contains only agent classes and `evaluate-state.ts`, `select-candidates.ts`.

## Architecture Check

1. A shared `selectStochasticFallback(moves, rng)` helper codifies the stochastic fallback as a canonical agent contract, not an ad-hoc implementation detail duplicated across agents.
2. A `pickRandom(items, rng)` utility eliminates the repeated "select one from array" pattern.
3. Both utilities are game-agnostic — they operate on `Move[]` and `Rng`, with no GameSpecDoc concerns.
4. No backwards-compatibility: replace inline code with the helper directly.

## What to Change

### 1. Create `packages/engine/src/agents/agent-move-selection.ts`

Export two helpers:

```typescript
/** Pick one item uniformly at random. Returns the item and advanced rng. */
export const pickRandom = <T>(items: readonly T[], rng: Rng): { item: T; rng: Rng };

/** Stochastic fallback: pick one move from stochastic candidates when no completed moves exist. */
export const selectStochasticFallback = (
  stochasticMoves: readonly Move[],
  rng: Rng,
): { move: Move; rng: Rng };
```

### 2. Use helpers in both agents

Replace the duplicated stochastic fallback blocks and the "pick one from N" patterns with calls to the shared helpers.

### 3. Remove redundant out-of-range guard in RandomAgent

`random-agent.ts:43-46` has a dead `undefined` check after `completedMoves[index]` that the stochastic path at line 31 does not have. After extracting `pickRandom`, this inconsistency disappears naturally.

## Files to Touch

- `packages/engine/src/agents/agent-move-selection.ts` (new)
- `packages/engine/src/agents/random-agent.ts` (modify)
- `packages/engine/src/agents/greedy-agent.ts` (modify)

## Out of Scope

- Changing the stochastic fallback policy itself (just extracting it)
- Modifying the GreedyAgent's tied-move selection (uses `selectCandidatesDeterministically` which has different semantics)
- Runner-side changes

## Acceptance Criteria

### Tests That Must Pass

1. All existing agent tests pass unchanged (no behavioral change).
2. Stochastic fallback determinism tests still pass for both agents.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Agent move selection behavior is identical before and after extraction.
2. Determinism for identical seeds is preserved.
3. Stochastic fallback policy is defined in exactly one place.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/agent-move-selection.test.ts` — Unit tests for `pickRandom` and `selectStochasticFallback`: single item returns it unchanged, multiple items are deterministic for same seed, index is always in bounds.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint && pnpm turbo typecheck`

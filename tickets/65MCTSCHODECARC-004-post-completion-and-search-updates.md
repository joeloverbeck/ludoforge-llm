# 65MCTSCHODECARC-004: Update `postCompleteSelectedMove` and Search for `chooseN` Trees

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/mcts/mcts-agent.ts`, potentially `search.ts`
**Deps**: 65MCTSCHODECARC-001, 65MCTSCHODECARC-002, 65MCTSCHODECARC-003

## Problem

`postCompleteSelectedMove` walks the decision subtree by following highest-visit children to extract a move. With the new incremental `chooseN` tree (ticket 003), the walk must correctly traverse deeper `chooseN` sub-trees (multiple levels per decision) and handle confirm nodes. Additionally, `search.ts` may need minor adjustments for selection/backpropagation through the deeper `chooseN` trees.

## What to Change

### 1. Update decision subtree walk in `postCompleteSelectedMove`

The existing walk (lines ~58–100 of `mcts-agent.ts`) follows `bestChild.nodeKind === 'decision'` children by highest visit count. This already works for deeper trees — it naturally follows the most-visited path through `chooseN` levels.

Verify and adjust:
- The walk correctly terminates at a confirm node (which has a complete `partialMove.params[bind]` array) or at the deepest decision node.
- When the walk reaches a confirm node, its `partialMove` carries the finalized array and is used for `legalChoicesEvaluate` / `completeTemplateMove`.
- If the walk does NOT reach a confirm node (e.g., insufficient search depth), the `completeTemplateMove` fallback handles the remaining `chooseN` selections. Verify that `completeTemplateMove` correctly handles a partial array (some items already selected, need more to reach `min`).

### 2. Verify `completeTemplateMove` handles partial `chooseN` arrays

`completeTemplateMove` (in `move-completion.ts`) calls `selectFromChooseN` which already handles `chooseN` correctly. But verify:
- If `partialMove.params[bind]` is already an array with some items, `legalChoicesDiscover` returns remaining options with the correct `min`/`max` adjusted for already-selected count.
- `selectFromChooseN` picks from these remaining options and appends to the existing array.

### 3. Verify search selection through `chooseN` sub-trees

In `search.ts`, `selectDecisionChild()` selects among a decision node's children. For `chooseN` nodes, children include both "add option X" children and (when valid) a confirm child. Verify:
- UCT selection works correctly over these mixed children.
- Confirm nodes accumulate visits and rewards normally via backpropagation.
- No special handling is needed — decision child selection should be uniform regardless of `chooseN` vs `chooseOne`.

### 4. Verify solver mode interaction

If solver mode (`provenResult`) interacts with decision nodes, verify that `chooseN` nodes (including confirm nodes) are handled correctly — or explicitly document that solver does not apply to `chooseN` sub-trees.

## Files to Touch

- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify — `postCompleteSelectedMove` walk logic)
- `packages/engine/src/agents/mcts/search.ts` (verify — selection/backprop through deeper trees; modify only if needed)

## Out of Scope

- Decision expansion logic (ticket 003)
- Node metadata (ticket 001)
- Param storage (ticket 002)
- Test fixtures (ticket 005)
- Kernel or compiler changes
- `move-completion.ts` changes (it already handles `chooseN` correctly via `selectFromChooseN`)

## Acceptance Criteria

### Tests That Must Pass

1. All existing MCTS unit tests pass
2. All existing decision-expansion tests pass
3. `postCompleteSelectedMove` correctly extracts array-valued params when the decision walk reaches a confirm node
4. `postCompleteSelectedMove` correctly falls back to `completeTemplateMove` when the walk does not reach a confirm node
5. `pnpm turbo build` — no type errors
6. `pnpm turbo typecheck` — clean
7. `pnpm turbo lint` — clean

### Invariants

1. `postCompleteSelectedMove` always returns a move that passes `legalChoicesEvaluate` (or falls back through the full chain)
2. `chooseOne` walk behavior is completely unchanged
3. Backpropagation works correctly through `chooseN` sub-trees (rewards propagate to root)
4. No kernel, compiler, or agent interface changes
5. Determinism: same seed + same tree → identical walk result

## Test Plan

### New/Modified Tests

1. Integration tests validating `postCompleteSelectedMove` with `chooseN` trees are created in ticket 006

### Commands

1. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint`
2. `pnpm -F @ludoforge/engine test` (full engine unit suite)

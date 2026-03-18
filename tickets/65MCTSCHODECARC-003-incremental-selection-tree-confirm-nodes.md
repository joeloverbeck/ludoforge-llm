# 65MCTSCHODECARC-003: Incremental `chooseN` Selection Tree with Confirm Nodes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/mcts/decision-expansion.ts`
**Deps**: 65MCTSCHODECARC-001, 65MCTSCHODECARC-002

## Problem

The current decision tree creates one child node per `chooseN` option as if it were `chooseOne`. A `chooseN` with `min: 2` from 5 options is fundamentally unrepresentable — there is no mechanism to combine multiple children into a single array-valued selection. This ticket implements the incremental selection tree where each level adds one item to the growing array, with "confirm" nodes at valid stopping points.

## What to Change

### 1. Implement incremental `chooseN` tree expansion in `expandPendingDecision`

When `request.type === 'chooseN'`, instead of creating one child per option (as for `chooseOne`), build an incremental selection tree:

- Each child represents adding one more option to the current selection array.
- To avoid duplicate permutations (`['A','B']` vs `['B','A']`), only expand options with index > the last-selected option's index (lexicographic ordering).
- Maximum depth per `chooseN` decision = `max` (or `K` if `max > K`, where K = option count).

### 2. Implement confirm nodes

When `request.canConfirm === true` (i.e., `selected.length >= min`), add a "confirm" child that advances to the next decision (or completes the move) with the current accumulated array.

Confirm nodes are modeled as ordinary decision children whose `partialMove` carries the finalized array param. They do NOT require a new `nodeKind` — they are decision nodes that, when expanded, trigger discovery of the *next* pending decision (or return `'complete'` if no decisions remain).

Implementation approach:
- When `canConfirm` is true, create an extra child node with the current partial move (no new item appended). This child's `partialMove.params[bind]` is the accumulated array.
- Mark this child distinctly (e.g., `decisionBinding: '$confirm:' + originalBinding`) so selection and diagnostics can identify it.
- When this confirm child is subsequently expanded via `expandDecisionNode`, call `legalChoicesDiscover` on its `partialMove`. The kernel sees the completed array and advances to the next decision (or returns `'complete'`).

### 3. Re-discover after each selection

After each item is added to the `chooseN` selection (each level of the tree), call `legalChoicesDiscover` with the updated partial move to get:
- The remaining valid options (the kernel filters already-selected items).
- The updated `canConfirm` status.

This is already the pattern for chained decisions. For `chooseN`, the partial move's param grows at each level.

### 4. Handle empty selection (min: 0)

When `min === 0`, the root-level confirm node represents an empty selection `[]`. The confirm child's `partialMove.params[bind]` should be `[]` (empty array, initialized by ticket 002's array-accumulation logic or explicitly set here).

### 5. Handle forced-sequence compression for `chooseN`

If a `chooseN` level has exactly 1 remaining option AND `canConfirm` is false (must pick), the forced-sequence compression should apply: skip node allocation, advance `partialMove` in-place, recurse.

If `canConfirm` is true with 1 remaining option, there are 2 choices (confirm current OR add the option), so forced-sequence does NOT apply.

### 6. Progressive widening interaction

When the option count at a `chooseN` level exceeds `decisionWideningCap`, progressive widening limits expansion. This already works via `filterChooseNOptions` — no changes needed, but verify the interaction is correct with the new incremental tree.

## Files to Touch

- `packages/engine/src/agents/mcts/decision-expansion.ts` (modify — `expandPendingDecision` for `chooseN` path, confirm node creation, re-discovery loop)

## Out of Scope

- `postCompleteSelectedMove` changes (ticket 004)
- Test fixtures (ticket 005)
- Unit tests for this logic (ticket 005 — tested together with fixtures)
- Kernel or compiler changes
- `chooseOne` expansion (must remain unchanged)
- Combinatorial explosion optimization (future spec concern)
- Search/backpropagation changes (ticket 004 covers any needed adjustments)

## Acceptance Criteria

### Tests That Must Pass

1. All existing `decision-expansion.test.ts` tests pass (chooseOne path unchanged)
2. `pnpm turbo build` — no type errors
3. `pnpm turbo typecheck` — clean
4. `pnpm turbo lint` — clean
5. All existing MCTS unit tests pass

### Invariants

1. `chooseOne` expansion behavior is completely unchanged
2. `chooseN` tree depth per decision ≤ `max` (or option count, whichever is smaller)
3. No duplicate selections in the tree (lexicographic ordering enforced)
4. Confirm nodes are only present when `canConfirm === true`
5. Empty selection `[]` is a valid child when `min === 0`
6. Forced-sequence compression applies to `chooseN` levels with exactly 1 option and `canConfirm === false`
7. No kernel, compiler, or agent interface changes
8. Node pool allocation per `chooseN` decision is bounded by progressive widening at each level

## Test Plan

### New/Modified Tests

1. Tests for incremental tree structure are created in ticket 005 (requires game def fixtures)

### Commands

1. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-expansion"` (regression)
3. `pnpm -F @ludoforge/engine test` (full engine unit suite)

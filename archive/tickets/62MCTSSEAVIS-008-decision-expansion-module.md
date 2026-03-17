# 62MCTSSEAVIS-008: Decision Expansion Module

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — agents/mcts (new file)
**Deps**: 62MCTSSEAVIS-007, 62MCTSSEAVIS-001

## Problem

The core of incremental decision expansion: given a decision node and game state, call `legalChoicesDiscover()` and handle all response kinds to create child nodes. This replaces `completeTemplateMove()` random completion in-tree.

## What to Change

### 1. Create `decision-expansion.ts`

Implement `expandDecisionNode(def, state, node, pool, visitor?)`:

- Call `legalChoicesDiscover(def, state, node.partialMove)`
- Handle response kinds:
  - **`pending` (chooseOne)**: Each `ChoiceOption` becomes a child decision node candidate
  - **`pending` (chooseN)**: Iterative expansion — each individual pick is a separate decision node. Use `ChoicePendingChooseNRequest` options with resolution metadata:
    - `legality === 'legal'` → expand as child
    - `legality === 'unknown'` → progressive widening candidate
    - `legality === 'illegal'` → prune (never expand)
    - `resolution: 'exact'` options preferred over `'provisional'`
  - **`complete`**: Decision sequence is done — return completed move for `applyMove`
  - **`illegal`**: Prune this path — backpropagate loss
  - **`pendingStochastic`**: Chance node with weighted outcomes

### 2. Progressive widening bypass

When `optionCount <= decisionWideningCap` (from config, default 12), expand all options immediately — no widening overhead.

### 3. Forced-sequence compression

If a decision step has exactly 1 legal option, skip node allocation — advance the partial move directly and recurse.

## Files to Touch

- `packages/engine/src/agents/mcts/decision-expansion.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify — add re-export)

## Out of Scope

- Search loop integration (62MCTSSEAVIS-010)
- Rollout integration (62MCTSSEAVIS-011)
- Decision key generation (62MCTSSEAVIS-009)
- Changes to `legalChoicesDiscover()` itself (62MCTSSEAVIS-014/015)
- Pool sizing changes (62MCTSSEAVIS-012)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `expandDecisionNode` with `pending` chooseOne response creates child candidates for each option
2. Unit test: `expandDecisionNode` with `pending` chooseN response creates per-pick child nodes using resolution metadata
3. Unit test: chooseN — `legality === 'illegal'` options are never expanded
4. Unit test: chooseN — `legality === 'unknown'` options are treated as widening candidates
5. Unit test: `expandDecisionNode` with `complete` response returns the completed move
6. Unit test: `expandDecisionNode` with `illegal` response signals prune
7. Unit test: progressive widening bypass — when optionCount <= 12, all options expanded immediately
8. Unit test: forced-sequence compression — single-option step skips node allocation
9. Unit test: visitor receives `decisionNodeCreated` events for each allocated decision node
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalChoicesDiscover()` is the sole API for decision expansion — no direct parameter filling
2. Decision nodes do NOT compute game state — state lives on ancestor state node
3. Forced-sequence compression produces identical results to single-option expansion
4. Progressive widening only activates when `optionCount > decisionWideningCap`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-expansion.test.ts` — all response kinds, chooseN iterative, widening bypass, forced-sequence compression

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern decision-expansion`
2. `pnpm turbo build && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - Created `packages/engine/src/agents/mcts/decision-expansion.ts` with `expandDecisionNode()` — handles all `ChoiceRequest` response kinds (pending chooseOne/chooseN, complete, illegal, pendingStochastic), forced-sequence compression, progressive widening bypass, pool exhaustion graceful degradation.
  - `DiscoverChoicesFn` injected via `DecisionExpansionContext` for testability (defaults to kernel `legalChoicesDiscover`).
  - `DecisionExpansionResult` is a 5-variant discriminated union: `expanded`, `complete`, `illegal`, `stochastic`, `poolExhausted`.
  - Pool node wiring uses mutable casts (same pattern as `search.ts`).
  - Added re-exports in `index.ts` for `expandDecisionNode`, all result types, `DiscoverChoicesFn`, and `createDecisionChildNode`.
  - Created `packages/engine/test/unit/agents/mcts/decision-expansion.test.ts` — 15 tests across 8 suites covering all 9 acceptance criteria plus diagnostics accumulator integration.
- **Deviations**: Signature is `expandDecisionNode(node, pool, ctx)` with a `DecisionExpansionContext` object instead of positional args — cleaner API for the many required context fields (def, state, playerCount, decisionWideningCap, visitor, accumulator, runtime, discoverChoices).
- **Verification**: `pnpm turbo build` passes, `pnpm turbo typecheck` passes (all 3 packages), 15/15 new tests pass, full engine suite 4866/4866 pass.

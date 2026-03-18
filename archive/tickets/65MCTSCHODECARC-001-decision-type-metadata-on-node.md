# 65MCTSCHODECARC-001: Add `decisionType` Metadata to MctsNode

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/mcts/node.ts`
**Deps**: None (first ticket in series)

## Problem

When `postCompleteSelectedMove` extracts a move from the decision tree, it has no knowledge of whether a binding came from `chooseOne` (correctly a scalar) or `chooseN` (should be an array). The `ChoicePendingRequest.type` field is available during expansion but not stored in the tree. This ticket adds the metadata field so downstream code can distinguish decision types.

## What to Change

### 1. Add `decisionType` field to `MctsNode`

In `MctsNode` interface, add:

```typescript
/** Type of decision at this node. Null for state nodes and root. */
decisionType: 'chooseOne' | 'chooseN' | null;
```

### 2. Update `createRootNode`

Set `decisionType: null` in the root node factory.

### 3. Update `createChildNode`

Set `decisionType: null` for state child nodes (they are not decisions).

### 4. Update `createDecisionChildNode`

Add a `decisionType` parameter and store it on the created node:

```typescript
export function createDecisionChildNode(
  parent: MctsNode,
  move: Move,
  moveKey: MoveKey,
  decisionPlayer: PlayerId,
  decisionBinding: string,
  playerCount: number,
  decisionType: 'chooseOne' | 'chooseN',  // NEW
): MctsNode
```

### 5. Update all call sites that wire decision child nodes

In `decision-expansion.ts`, pass `request.type` to `wireDecisionChild()` (the pool-based node wiring helper — `createDecisionChildNode` is not used here). Update `wireDecisionChild` to accept and store a `decisionType` parameter on the allocated node. All existing calls currently create `chooseOne` nodes (since `chooseN` expansion doesn't work yet), so they should pass the actual `request.type`.

## Files to Touch

- `packages/engine/src/agents/mcts/node.ts` (modify — add field, update factories)
- `packages/engine/src/agents/mcts/decision-expansion.ts` (modify — pass `decisionType` to `createDecisionChildNode`)

## Out of Scope

- Changing how `chooseN` params are stored (ticket 002)
- Incremental selection tree / confirm nodes (ticket 003)
- `postCompleteSelectedMove` changes (ticket 004)
- Any kernel or compiler changes
- Test fixtures for `chooseN` game defs (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. All existing `decision-expansion.test.ts` tests pass with the new field present
2. All existing MCTS unit/integration/e2e tests pass unchanged (the new field is additive)
3. `pnpm turbo build` — no type errors
4. `pnpm turbo typecheck` — clean
5. `pnpm turbo lint` — clean

### Invariants

1. `MctsNode.decisionType` is `null` for all state nodes and the root node
2. `MctsNode.decisionType` is `'chooseOne'` or `'chooseN'` for all decision nodes
3. No behavioral change — this ticket only adds metadata, does not change expansion or materialization logic
4. Node pool allocation size unchanged (one new field per node does not affect pool count)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/decision-expansion.test.ts` — add assertions on existing tests to verify `decisionType` is set correctly on expanded decision children (both `chooseOne` and `chooseN` request types)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="decision-expansion"` (targeted)
2. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint && pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-18
- **What changed**:
  - Added `decisionType: 'chooseOne' | 'chooseN' | null` to `MctsNode` interface
  - Updated `createRootNode`, `createChildNode` (set `null`), `createDecisionChildNode` (new param)
  - Updated `wireDecisionChild` in `decision-expansion.ts` to accept and store `decisionType` from `request.type`
  - Updated `resetNode` in `node-pool.ts` to reset `decisionType` to `null`
  - Updated decision root wiring in `search.ts` to set `decisionType: null`
  - Added test assertions for `decisionType` in `node.test.ts` and `decision-expansion.test.ts`
  - Updated all test call sites across 5 test files
- **Deviations from original plan**:
  - Ticket section 5 corrected: `decision-expansion.ts` uses `wireDecisionChild` (pool-based), not `createDecisionChildNode`. Ticket updated before implementation.
  - Also updated `node-pool.ts` (resetNode) and `search.ts` (decision root wiring) — not listed in original "Files to Touch" but required for correctness.
- **Verification**: build ✅, typecheck ✅, lint ✅, 5190 tests pass (0 fail)

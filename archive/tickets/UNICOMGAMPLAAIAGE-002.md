# UNICOMGAMPLAAIAGE-002: Node Structure, Node Pool, and Move-Key Canonicalization

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new files in agents/mcts/
**Deps**: UNICOMGAMPLAAIAGE-001

## Problem

The MCTS search requires an open-loop node structure keyed by action history, a memory-efficient node pool, and deterministic canonical move serialization for deduplication. These are foundational data structures used by every subsequent search ticket.

## Assumption Reassessment (2026-03-13)

1. No existing MCTS node types exist — confirmed.
2. `Move` type in `types-core.ts` contains `actionId` and `params` (record of `MoveParamValue`) — confirmed.
3. `fork` exists in `kernel/prng.ts` for RNG splitting — confirmed.
4. Node storage is explicitly mutable and pooled per spec §Performance Requirements — intentional exception to engine immutability.

## Architecture Check

1. Node is a mutable struct — spec explicitly allows this for search perf. Isolated to MCTS internals, never exposed to kernel.
2. `MoveKey` canonicalization must be stable across equivalent param ordering — uses sorted key serialization.
3. Node pool scales with search budget, not a fixed size.

## What to Change

### 1. Create `packages/engine/src/agents/mcts/move-key.ts`

- `type MoveKey = string`
- `function canonicalMoveKey(move: Move): MoveKey` — deterministic serialization including `actionId`, sorted params, and compound payload. Must be stable across equivalent param orderings.

### 2. Create `packages/engine/src/agents/mcts/node.ts`

- `MctsNode` interface (mutable fields as per spec §Node Structure):
  - `move: Move | null` (null for root)
  - `moveKey: MoveKey | null`
  - `parent: MctsNode | null`
  - `visits: number`
  - `availability: number`
  - `totalReward: number[]` (per-player cumulative)
  - `heuristicPrior: number[] | null`
  - `children: MctsNode[]`
  - `provenResult: ProvenResult | null`
- `ProvenResult` type (win/loss/draw as per spec).
- `createRootNode(playerCount: number): MctsNode`
- `createChildNode(parent: MctsNode, move: Move, moveKey: MoveKey, playerCount: number): MctsNode`

### 3. Create `packages/engine/src/agents/mcts/node-pool.ts`

- `NodePool` interface with `capacity`, `allocate()`, `reset()`.
- `createNodePool(capacity: number, playerCount: number): NodePool` — pre-allocates node array, `allocate()` returns next available, `reset()` returns index to 0.
- Sizing rule: `capacity = max(iterations + 1, rootLegalMoveCount * 4)`.

### 4. Update `packages/engine/src/agents/mcts/index.ts`

Add re-exports for `move-key.ts`, `node.ts`, `node-pool.ts`.

## Files to Touch

- `packages/engine/src/agents/mcts/move-key.ts` (new)
- `packages/engine/src/agents/mcts/node.ts` (new)
- `packages/engine/src/agents/mcts/node-pool.ts` (new)
- `packages/engine/src/agents/mcts/index.ts` (modify)
- `packages/engine/test/unit/agents/mcts/move-key.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/node.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/node-pool.test.ts` (new)

## Out of Scope

- Selection formula (ISUCT) — ticket 005.
- Progressive widening logic — ticket 006.
- Backpropagation — ticket 010.
- Solver proven-result propagation — ticket 014.
- Any kernel file changes.

## Acceptance Criteria

### Tests That Must Pass

1. `canonicalMoveKey` produces identical keys for moves with same actionId+params regardless of param insertion order.
2. `canonicalMoveKey` produces different keys for moves with different actionId or different param values.
3. `canonicalMoveKey` handles compound payloads deterministically.
4. `createRootNode` returns node with `move: null`, `visits: 0`, `totalReward` array of length `playerCount` filled with 0.
5. `createChildNode` links parent correctly, initializes fresh stats.
6. Node pool `allocate()` returns distinct nodes up to capacity.
7. Node pool `allocate()` throws when capacity exceeded.
8. Node pool `reset()` allows re-allocation from start.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `MoveKey` is a pure function of `Move` — no RNG, no state dependency.
2. Node pool never exceeds declared capacity.
3. All MCTS node types are internal to `agents/mcts/` — not exported from top-level `agents/index.ts`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/move-key.test.ts` — canonical key stability, ordering invariance, distinctness.
2. `packages/engine/test/unit/agents/mcts/node.test.ts` — root creation, child creation, parent linking.
3. `packages/engine/test/unit/agents/mcts/node-pool.test.ts` — allocation, capacity enforcement, reset.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/agents/mcts/`
2. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-13
- **What changed**:
  - Created `packages/engine/src/agents/mcts/move-key.ts` — `MoveKey` type alias + `canonicalMoveKey()` with sorted-param serialization and recursive compound payload handling
  - Created `packages/engine/src/agents/mcts/node.ts` — `MctsNode` interface (mutable stats), `ProvenResult` type, `createRootNode()`, `createChildNode()`
  - Created `packages/engine/src/agents/mcts/node-pool.ts` — `NodePool` interface, `createNodePool()` with pre-allocation, capacity enforcement, and reset
  - Updated `packages/engine/src/agents/mcts/index.ts` — re-exports for all new modules
  - Created 3 test files: `move-key.test.ts` (12 tests), `node.test.ts` (18 tests), `node-pool.test.ts` (9 tests)
- **Deviations**: None
- **Verification**: 39/39 new tests pass, 4247/4247 full engine suite pass, lint 0 errors, typecheck clean

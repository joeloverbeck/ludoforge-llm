# 63MCTSRUNMOVCLA-004: Integrate `classifyMovesForSearch` into `search.ts`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS `search.ts`, `materialization.ts` (remove old functions)
**Deps**: 63MCTSRUNMOVCLA-002

## Problem

`search.ts` partitions root legal moves using `concreteActionIds` (compile-time) and then materializes "concrete" moves via `materializeOrFastPath`. This causes crashes for actions without template params but with inline decisions. The new `classifyMovesForSearch` (from ticket 002) must replace this partition + materialize block.

## Assumption Reassessment (2026-03-16, corrected)

1. The partition block splitting into `concreteMoves[]` and `templateMoves[]` — **GONE**. Previous tickets (001-003) already removed the `concreteActionIds`-based partition. Lines 318-329 now call `materializeOrFastPath` on ALL moves (no split).
2. Materialization block at lines ~321-329 calls `materializeOrFastPath` on ALL moves — **confirmed** (but not "concrete moves only" as originally stated).
3. Decision root creation loop for `templateMoves` — **DOES NOT EXIST**. There is no decision root creation in `runOneIteration`. This is NEW functionality to ADD.
4. Forced-sequence compression at lines ~340-379 checks `candidates.length === 1` only — **confirmed** (no `templateMoves.length === 0` check exists).

## Architecture Check

1. Unified code path: all moves go through `classifyMovesForSearch` regardless of action definition structure. Eliminates the concrete/template bifurcation.
2. Decision roots now created for ALL pending moves (not just "template" ones), correctly routing actions like `rally`, `march` that have inline decisions.
3. No backwards-compatibility shims.

## What to Change

### 1. Replace partition + materialize block in `runOneIteration`

Remove:
- The `concreteActionIds`-based partition loop (lines ~319-331)
- The `materializeOrFastPath` call block (lines ~333-347)

Replace with:
```typescript
const classification = classifyMovesForSearch(def, currentState, movesAtNode, runtime, config.visitor);
const candidates = classification.ready;
```

### 2. Update decision root creation

Change the decision root loop to iterate `classification.pending` instead of `templateMoves`:
```typescript
for (const pendingMove of classification.pending) {
  const rootKey = templateDecisionRootKey(pendingMove.actionId);
  // ... same decision root wiring as current template handling
}
```

### 3. Update forced-sequence compression

Change from:
```typescript
if (candidates.length === 1 && templateMoves.length === 0)
```
to:
```typescript
if (candidates.length === 1 && classification.pending.length === 0)
```

### 4. Remove `materializeOrFastPath` from `materialization.ts`

Since ticket 005 will handle the rollout side, and this ticket replaces the search side, `materializeOrFastPath` can be removed. If ticket 005 hasn't landed yet, keep the function but remove the search.ts call site.

### 5. Update `mcts/index.ts` exports

Remove `materializeConcreteCandidates` export if no longer used (check rollout.ts call sites — if ticket 005 hasn't landed, keep it temporarily).

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify — replace partition/materialize/decision-root blocks)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — remove `materializeOrFastPath` if safe)
- `packages/engine/src/agents/mcts/index.ts` (modify — update exports)
- `packages/engine/test/unit/agents/mcts/search.test.ts` (modify — update tests that assert partition behavior)
- `packages/engine/test/unit/agents/mcts/search-decision.test.ts` (modify — decision roots now created for pending moves)
- `packages/engine/test/unit/agents/mcts/search-visitor.test.ts` (modify — visitor event emission changes)
- `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (delete — fast path removed)

## Out of Scope

- Rollout changes (ticket 005)
- Visitor event type renames (ticket 006)
- FITL MCTS fast validation (ticket 007)
- Kernel changes
- Runner changes
- Performance optimization of `legalChoicesEvaluate`

## Acceptance Criteria

### Tests That Must Pass

1. Existing `search.test.ts` tests pass (move selection, expansion, backpropagation behavior unchanged for already-working games).
2. `search-decision.test.ts` tests pass — decision root nodes are created for pending moves.
3. Moves from parameterless actions with inline decisions now get decision root nodes (not fast-pathed to `applyMove`).
4. Forced-sequence compression still works: single ready move + 0 pending = compressed (no node allocation).
5. `pnpm -F @ludoforge/engine build` — compiles cleanly.
6. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. All moves classified at runtime via `legalChoicesEvaluate` — no compile-time partition.
2. Decision root nodes created for every unique pending `actionId`.
3. Ready candidates (`classification.ready`) passed to `selectExpansionCandidate` — these are guaranteed complete.
4. No game-specific identifiers introduced.
5. Determinism preserved: same seed + same moves = same tree structure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/search.test.ts` — update partition-related assertions
2. `packages/engine/test/unit/agents/mcts/search-decision.test.ts` — verify pending moves get decision roots
3. Remove `packages/engine/test/unit/agents/mcts/materialization-fastpath.test.ts` (if not already removed in ticket 001)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `packages/engine/src/agents/mcts/search.ts`: Replaced `materializeOrFastPath` call in `runOneIteration` with `classifyMovesForSearch`. Added decision root creation loop for `classification.pending` moves (each unique pending `actionId` gets a `nodeKind: 'decision'` child via `templateDecisionRootKey`). Updated forced-sequence compression guard to require `classification.pending.length === 0`. Updated `totalCandidateCount` to include both ready and pending moves.
- **Deviations from original plan**:
  - Ticket assumed a partition block (`concreteMoves[]`/`templateMoves[]`) and decision root creation loop already existed — they did not. Previous tickets (001-003) had already removed the partition; decision root creation was new code, not a replacement.
  - `materializeOrFastPath` and `materializeConcreteCandidates` kept in `materialization.ts` and `index.ts` exports because `rollout.ts` still uses them (ticket 005 handles rollout).
  - `materialization-fastpath.test.ts` kept (not deleted) for the same reason.
  - Ticket assumption reassessment section corrected in-place.
- **Verification**: `pnpm -F @ludoforge/engine build` clean, `pnpm turbo typecheck` 3/3 pass, `pnpm -F @ludoforge/engine test` 4962 tests / 0 failures.

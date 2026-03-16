# 63MCTSRUNMOVCLA-003: Implement `materializeMovesForRollout`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS `materialization.ts`
**Deps**: 63MCTSRUNMOVCLA-001

## Problem

The rollout phase needs a classification function that differs from the in-tree version: pending moves should be randomly completed via `completeTemplateMove` (not incrementally expanded), because rollout does not build tree structure. The current `materializeConcreteCandidates` does this correctly but `materializeOrFastPath` wraps it with a flawed fast-path bypass that skips `legalChoicesEvaluate` for "concrete" actions. The new `materializeMovesForRollout` replaces both functions with correct runtime classification and no fast-path bypass.

## Assumption Reassessment (2026-03-16)

1. `materializeConcreteCandidates` (lines 47-134 of `materialization.ts`) already calls `legalChoicesEvaluate` and routes pending moves to `completeTemplateMove` — **confirmed**.
2. `materializeOrFastPath` (lines 148-184) short-circuits when all moves are from `concreteActionIds` — **confirmed**, this is the bug.
3. `completeTemplateMove` exists and works for random parameter filling — **confirmed** from existing rollout tests.

## Architecture Check

1. `materializeMovesForRollout` is essentially `materializeConcreteCandidates` minus the `concreteActionIds` dependency, plus explicit handling of all `legalChoicesEvaluate` kinds.
2. No game-specific logic — game-agnostic random completion via existing `completeTemplateMove`.
3. Replaces two functions with one. No backwards-compatibility shims.

## What to Change

### 1. Implement `materializeMovesForRollout` in `materialization.ts`

Per spec section 2.3:
```typescript
export function materializeMovesForRollout(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  rng: Rng,
  limitPerTemplate: number,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng };
```

Logic:
- For each move, call `legalChoicesEvaluate`.
- `'complete'` → add as `ConcreteMoveCandidate` (deduplicate by moveKey).
- `'pending'` → call `completeTemplateMove` up to `limitPerTemplate` times, add completed candidates.
- `'illegal'` / `'pendingStochastic'` → skip (emit visitor event for stochastic).
- On exception → emit visitor event, skip.

This is the existing `materializeConcreteCandidates` logic, restructured with explicit kind-switching and no fast-path bypass.

### 2. Export from `mcts/index.ts`

Add `materializeMovesForRollout` to barrel export. Keep `filterAvailableCandidates` (unchanged).

### 3. Write unit tests

New file: `packages/engine/test/unit/agents/mcts/materialize-rollout.test.ts`

## Files to Touch

- `packages/engine/src/agents/mcts/materialization.ts` (modify — add function)
- `packages/engine/src/agents/mcts/index.ts` (modify — add export)
- `packages/engine/test/unit/agents/mcts/materialize-rollout.test.ts` (new)

## Out of Scope

- Integrating into `rollout.ts` call sites (ticket 005)
- Removing old `materializeConcreteCandidates` / `materializeOrFastPath` (ticket 005)
- In-tree classification (ticket 002)
- Search loop changes (ticket 004)
- Visitor event renames (ticket 006)
- Any kernel changes

## Acceptance Criteria

### Tests That Must Pass

1. **complete-passthrough**: Complete moves pass through as candidates without RNG consumption.
2. **pending-completion**: Pending moves are completed via `completeTemplateMove`; resulting candidates have valid moveKeys.
3. **completion-dedup**: Multiple completions of same template → deduplicated by moveKey.
4. **unsatisfiable**: Unsatisfiable completions → dropped, visitor event emitted.
5. **stochastic-unresolved**: Stochastic moves → dropped, visitor event emitted, RNG not consumed for that move.
6. **rng-determinism**: Same seed → same candidates in same order.
7. **no-fast-path**: Moves from parameterless actions with inline decisions → correctly classified as pending by `legalChoicesEvaluate` and completed (not fast-pathed as ready).
8. `pnpm -F @ludoforge/engine build` — compiles cleanly.
9. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. Every move is classified via `legalChoicesEvaluate` — no compile-time shortcuts.
2. RNG is consumed only for `completeTemplateMove` calls (pending moves). Classification of complete moves is pure.
3. Deduplication by `MoveKey` for all candidates.
4. No game-specific identifiers in the implementation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/materialize-rollout.test.ts` — 7 test cases per acceptance criteria

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`

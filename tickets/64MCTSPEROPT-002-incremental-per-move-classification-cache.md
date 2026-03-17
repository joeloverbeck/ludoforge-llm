# 64MCTSPEROPT-002: Incremental Per-Move Classification Cache

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — state-cache, materialization, new types
**Deps**: 64MCTSPEROPT-001

## Problem

The current `CachedStateInfo.moveClassification` stores classification as an all-or-nothing `MoveClassification` (ready/pending arrays). Every revisit to a state that lacks cached classification triggers a full `classifyMovesForSearch()` sweep — calling `legalChoicesEvaluate()` for every legal move. On FITL, this is ~1s per sweep. The spec (section 3.3) requires replacing this with incremental per-move caching so classification advances one move at a time across revisits.

## Assumption Reassessment (2026-03-17)

1. `CachedStateInfo` in `state-cache.ts` has `moveClassification?: MoveClassification` — **confirmed**.
2. `MoveClassification` in `materialization.ts` is `{ ready, pending }` — **confirmed**.
3. `classifyMovesForSearch()` iterates all moves, calling `legalChoicesEvaluate()` per move — **confirmed**.
4. Deduplication: ready by `moveKey`, pending by `actionId` (or `canonicalMoveKey` when params differ) — **confirmed** in `classifyMovesForSearch()`.
5. `getOrComputeClassification()` in `state-cache.ts` caches the whole `MoveClassification` — **confirmed**.

## Architecture Check

1. Per-move caching lets selection classify only the moves it needs, reducing `legalChoicesEvaluate` calls from O(all_moves) per revisit to O(1) per candidate.
2. Deduplication invariant preserved: only one entry per `moveKey` in the cached infos array.
3. No game-specific logic — the cache structure is generic.

## What to Change

### 1. Add new types to `state-cache.ts`

```typescript
type ClassificationStatus = 'unknown' | 'ready' | 'pending' | 'illegal' | 'pendingStochastic'

interface CachedLegalMoveInfo {
  move: Move
  moveKey: MoveKey
  status: ClassificationStatus
  oneStepHeuristic?: readonly number[] | null
}

interface CachedClassificationEntry {
  infos: CachedLegalMoveInfo[]  // mutable for incremental updates
  nextUnclassifiedCursor: number
  exhaustiveScanComplete: boolean
}
```

### 2. Replace `moveClassification` in `CachedStateInfo`

Replace `moveClassification?: MoveClassification` with `classification?: CachedClassificationEntry`.

### 3. Add `initClassificationEntry()` function

When `legalMoves()` is first cached for a state, create a `CachedClassificationEntry` with all moves set to `status: 'unknown'`. Deduplicate by `moveKey` at creation time (multiple raw moves → one entry).

### 4. Add `classifyNextCandidate()` function

Classify the move at `nextUnclassifiedCursor`, update its status, advance the cursor. Return the classified info. This is what selection will call instead of `getOrComputeClassification()`.

### 5. Add `classifySpecificMove()` function

Classify a specific move by index (for on-demand classification of an existing child's move). Return the updated status.

### 6. Add `getClassifiedMovesByStatus()` helper

Return filtered views: all `ready` infos, all `pending` infos, etc. — for callers that need the old `MoveClassification` shape.

### 7. Update `getOrComputeClassification()` to use new structure

For backward compatibility during migration: if caller needs the full classification, exhaust the cursor and return the old shape. Mark as `exhaustiveScanComplete: true`.

### 8. Preserve deduplication

Multiple raw moves mapping to the same `moveKey` must result in one `CachedLegalMoveInfo`. The first raw move encountered wins.

## Files to Touch

- `packages/engine/src/agents/mcts/state-cache.ts` (modify — new types, new functions, replace `moveClassification`)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — add single-move classify helper)
- `packages/engine/src/agents/mcts/move-key.ts` (modify — export `MoveKey` type if not already exported)

## Out of Scope

- `familyKey` support (ticket 64MCTSPEROPT-006)
- Changing how `search.ts` calls classification (ticket 64MCTSPEROPT-003)
- Sound availability checking logic (ticket 64MCTSPEROPT-003)
- Ordered lazy expansion (ticket 64MCTSPEROPT-004)
- Any changes to `config.ts` or presets

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `initClassificationEntry()` creates entries with correct `moveKey` dedup and all `unknown` statuses.
2. New unit test: `classifyNextCandidate()` advances cursor, sets correct status (`ready`/`pending`/`illegal`/`pendingStochastic`).
3. New unit test: `classifySpecificMove()` classifies by index without advancing cursor.
4. New unit test: `getClassifiedMovesByStatus('ready')` returns only ready-classified moves.
5. New unit test: deduplication — two raw moves with same `moveKey` produce one entry.
6. Backward compat: `getOrComputeClassification()` still works and returns correct `MoveClassification`.
7. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. `legalMoves()` is cached once per state — not re-called for classification.
2. `moveKey` is computed once per cached move, not rebuilt every visit.
3. Classification status is per-move, not all-or-nothing.
4. Deduplication by `moveKey` preserved (one entry per unique move key).
5. Cache size remains bounded by existing `maxStateInfoCacheEntries`.
6. `stateHash === 0n` entries are never cached (existing invariant).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/state-cache-incremental.test.ts` (new) — covers all new functions.
2. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — may need updates if it directly constructs `CachedStateInfo`.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

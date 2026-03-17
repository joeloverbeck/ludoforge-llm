# 64MCTSPEROPT-003: Sound Availability Checking in Selection

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS search selection logic
**Deps**: 64MCTSPEROPT-002

## Problem

The current selection logic assumes that if a child's `moveKey` appears in `legalMoves()`, the child is available. This is unsound: `legalChoicesEvaluate()` can still classify a raw move as `illegal`, `pending`, or `pendingStochastic`, so move-key presence alone is not proof of availability (spec section 1.3, 3.5). Selection must distinguish three cases: known available, unknown, and known unavailable.

## Assumption Reassessment (2026-03-17)

1. Selection in `search.ts` uses `isuct.ts` for scoring children — need to verify how children are filtered.
2. `CachedClassificationEntry` from ticket 002 provides per-move status — selection must consume this.
3. `pending` status corresponds to `legalChoicesEvaluate() → { kind: 'pending' }` — these are decision roots, not directly playable.
4. `pendingStochastic` must not be treated as ordinary `pending` (spec section 3.5).

## Architecture Check

1. Sound availability ensures correctness under sampled worlds and hidden information.
2. On-demand classification of unknown children avoids full-state sweeps while preserving safety.
3. No game-specific logic — the three-case check is universal.

## What to Change

### 1. Add availability classification in selection

Before a child can be scored by UCT/ISUCT, check its status in the `CachedClassificationEntry`:
- `ready` → known available (for state children)
- `pending` → known available (for decision root children)
- `illegal` / `pendingStochastic` → known unavailable, skip
- `unknown` → classify on demand using `classifySpecificMove()` from ticket 002, then re-check

### 2. Modify selection loop in `search.ts`

Filter children through availability before UCT scoring. Only "known available" children participate in score comparison.

### 3. Handle unknown-status children

When a child has `unknown` status, call `classifySpecificMove()` to resolve it before the selection decision. This is at most one `legalChoicesEvaluate()` call per unknown child per visit.

### 4. Add `classificationPolicy` config field

Add `classificationPolicy?: 'auto' | 'exhaustive' | 'lazy'` to `MctsConfig` (spec section 5). Default `'auto'`. When `'exhaustive'`, fall back to full classification sweep (backward compat). When `'lazy'`, use incremental per-move classification. `'auto'` chooses based on branching factor.

### 5. Update `validateMctsConfig` for new field

Validate `classificationPolicy` is one of the allowed values.

## Files to Touch

- `packages/engine/src/agents/mcts/search.ts` (modify — selection availability filter)
- `packages/engine/src/agents/mcts/config.ts` (modify — add `classificationPolicy`)
- `packages/engine/src/agents/mcts/isuct.ts` (modify — only if scoring needs awareness of availability)
- `packages/engine/src/agents/mcts/state-cache.ts` (modify — if additional helpers needed)

## Out of Scope

- Ordered lazy expansion (ticket 64MCTSPEROPT-004)
- Family widening (ticket 64MCTSPEROPT-006)
- Budget profiles / fallback policies (ticket 64MCTSPEROPT-009)
- Rollout/leaf evaluator changes (ticket 64MCTSPEROPT-001)
- Parallel search (Phase 6)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: child with `ready` status is scored by UCT.
2. New unit test: child with `illegal` status is skipped in selection.
3. New unit test: child with `pendingStochastic` status is skipped in selection.
4. New unit test: child with `unknown` status triggers on-demand classification before scoring.
5. New unit test: `pending` child is available for decision-root scoring.
6. New unit test: `classificationPolicy: 'exhaustive'` falls back to full sweep.
7. Differential test: for a recorded FITL state, exhaustive and lazy classification produce identical per-move statuses.
8. `pnpm -F @ludoforge/engine test` — full suite passes.
9. `pnpm turbo typecheck` passes.

### Invariants

1. No child is selected unless it is "known available" in the current state.
2. Raw move-key presence alone never upgrades a child from unknown to available.
3. `pendingStochastic` is never silently treated as ordinary `pending`.
4. No cross-world classification reuse without a valid state/determinization hash.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/availability-checking.test.ts` (new) — covers all three cases.
2. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — update if selection API changes.
3. `packages/engine/test/integration/mcts-decision-integration.test.ts` — verify no regression in decision flow.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

# 62MCTSSEAVIS-011: Rollout Integration — Decision Boundary

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents/mcts/rollout.ts
**Deps**: 62MCTSSEAVIS-007, 62MCTSSEAVIS-010

## Problem

When selection exits the tree at a decision node (partially completed move), the rollout needs to complete remaining decisions before simulation can begin. Compound action completion must NOT count toward the simulation cutoff budget.

## What to Change

### 1. Decision boundary handling in rollout

When selection ends on a `nodeKind === 'decision'` node:
1. Complete remaining decisions via `completeTemplateMove(partialMove)` — fast random completion
2. Apply the completed move to get a real game state
3. Continue to simulation phase from that state

### 2. Action-boundary cutoff accounting

Compound action completion does NOT count toward `maxSimulationDepth` cutoff. The cutoff counts complete game plies, not mid-decision steps. This respects action boundaries — never evaluate mid-compound-action.

### 3. Template moves during simulation (unchanged)

Template moves encountered during simulation continue to use existing `materializeConcreteCandidates()` → `completeTemplateMove()` path. No changes needed here.

## Files to Touch

- `packages/engine/src/agents/mcts/rollout.ts` (modify)

## Out of Scope

- Decision expansion logic (62MCTSSEAVIS-008)
- Search loop changes (62MCTSSEAVIS-010)
- Pool sizing (62MCTSSEAVIS-012)
- Changes to `completeTemplateMove()` itself
- Changes to `materializeConcreteCandidates()`
- Rollout mode configuration (already from 63MCTSPERROLLFRESEA)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: rollout from decision node completes via `completeTemplateMove(partialMove)`
2. Unit test: completed move is applied exactly once to produce game state
3. Unit test: compound action completion does NOT increment cutoff counter
4. Unit test: simulation after decision completion uses `rolloutMode` as configured
5. Unit test: rollout from state node is unchanged (no decision handling triggered)
6. Unit test: failed `completeTemplateMove` at boundary is handled gracefully (backpropagate loss)
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `completeTemplateMove()` is the only method for random decision completion at simulation boundary
2. Simulation cutoff counts complete game plies, not decision steps
3. Rollout behavior for concrete-only games is identical to pre-change
4. `rolloutMode` (pure/hybrid/heuristic from 63MCTSPERROLLFRESEA) controls simulation strategy — orthogonal to decision handling

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/rollout-decision.test.ts` — boundary handling, cutoff accounting

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern rollout`
2. `pnpm turbo build && pnpm turbo typecheck`

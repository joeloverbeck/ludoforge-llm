# 63MCTSPERROLLFRESEA-006: Confidence-based root stopping

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `agents/mcts/config.ts`, `agents/mcts/search.ts`, `agents/mcts/diagnostics.ts`
**Deps**: 63MCTSPERROLLFRESEA-001 (diagnostics accumulator for `rootStopReason`), 63MCTSPERROLLFRESEA-002 (rollout modes must exist so diagnostics include `rolloutMode`)

## Problem

The current early-stop rule in `runSearch()` uses iteration count and wall-clock time only. There is no mechanism to stop early when the best root action is statistically separated from the runner-up. This wastes iterations on searches where the outcome is already clear, or exits too early when the outcome is still uncertain.

The spec replaces naive visit-ratio stopping with a Hoeffding-bound confidence test.

## Assumption Reassessment (2026-03-14)

1. `runSearch()` loop currently checks: solver-proven root, wall-clock deadline after `minIterations`, iteration budget exhaustion — confirmed.
2. There is no existing confidence-based or visit-ratio early stopping — confirmed.
3. `MctsNode` has `visits`, `totalReward` (per-player array) fields — confirmed.
4. `root.children` is a `Map<string, MctsNode>` — confirmed.
5. The root player can be determined from `GameState.currentPlayer` — confirmed.

## Architecture Check

1. The Hoeffding bound is a well-known statistical bound for bounded random variables — appropriate for MCTS rewards in [0, 1].
2. The combined confidence + visit-ratio guard is conservative: it avoids both noisy early exits (Hoeffding prevents statistical mistakes) and over-confident exits on insufficient data (visit-ratio prevents exploitation of small samples).
3. The stop reason is recorded in diagnostics for post-hoc analysis.

## What to Change

### 1. Add config fields in `config.ts`

- `rootStopConfidenceDelta?: number` (default: `1e-3`)
- `rootStopMinVisits?: number` (default: `16`)

Add validation: `rootStopConfidenceDelta` must be in `(0, 1)`, `rootStopMinVisits` must be a positive integer.

### 2. Implement `shouldStopByConfidence()` function in `search.ts`

Pure function that takes the root node, root player ordinal, delta, and min visits, and returns `boolean`:

```ts
function shouldStopByConfidence(
  root: MctsNode,
  rootPlayerOrdinal: number,
  delta: number,
  minVisits: number,
): boolean {
  // Find best and runner-up children by mean reward
  // Check both have >= minVisits
  // Compute Hoeffding radius for each
  // Check confidence intervals don't overlap
  // Check visit ratio guard (best.visits > 2 * runnerUp.visits)
}
```

### 3. Wire into `runSearch()` loop

Add confidence check in the iteration loop. Stop precedence order:
1. Solver-proven root
2. Wall-clock deadline after `minIterations`
3. Confidence-based root stop (after `minIterations`)
4. Iteration budget exhaustion

When confidence stop fires, set `accum.rootStopReason = 'confidence'` in the diagnostics accumulator. Also set the reason for other stop conditions: `'solver'`, `'time'`, `'iterations'`.

### 4. Add `rootStopReason` to `MctsSearchDiagnostics`

The field was declared in ticket 001's extension of `MctsSearchDiagnostics`. This ticket populates it with the actual stop reason.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify)
- `packages/engine/src/agents/mcts/search.ts` (modify)
- `packages/engine/src/agents/mcts/diagnostics.ts` (modify — only if `rootStopReason` population requires changes here)
- `packages/engine/test/unit/agents/mcts/root-confidence-stop.test.ts` (new)
- `packages/engine/test/unit/agents/mcts/config.test.ts` (modify)

## Out of Scope

- MAST policy — that is 63MCTSPERROLLFRESEA-003.
- State-info cache — that is 63MCTSPERROLLFRESEA-004.
- Forced-sequence compression — that is 63MCTSPERROLLFRESEA-005.
- Rollout mode refactor — that is 63MCTSPERROLLFRESEA-002.
- Re-tuning `minIterations` for named presets.
- Any changes to the selection formula (UCB, ISUCT).
- Solver logic changes.

## Acceptance Criteria

### Tests That Must Pass

1. **root-confidence-stop.test.ts**: When the best child has a statistically separated mean reward from the runner-up (confidence intervals don't overlap) AND visit ratio > 2:1 AND both have >= `rootStopMinVisits`, the search stops early.
2. **root-confidence-stop.test.ts**: When confidence intervals overlap, the search does NOT stop early (continues to iteration budget).
3. **root-confidence-stop.test.ts**: When either child has fewer than `rootStopMinVisits` visits, the search does NOT stop early.
4. **root-confidence-stop.test.ts**: Confidence stop does not fire before `minIterations` are completed.
5. **root-confidence-stop.test.ts**: `rootStopReason` is `'confidence'` when confidence stop fires.
6. **root-confidence-stop.test.ts**: `rootStopReason` is `'iterations'` when iteration budget is exhausted normally.
7. **root-confidence-stop.test.ts**: `rootStopReason` is `'time'` when wall-clock deadline causes stop.
8. **root-confidence-stop.test.ts**: Same seed + same config = same iteration count (determinism of stop decision).
9. **config.test.ts**: `rootStopConfidenceDelta` defaults to `1e-3`.
10. **config.test.ts**: `rootStopMinVisits` defaults to `16`.
11. **config.test.ts**: Validation rejects `rootStopConfidenceDelta` outside `(0, 1)`.
12. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.

### Invariants

1. Determinism: the stop decision is a pure function of deterministic search statistics — same seed + same config = same iteration count.
2. Stop precedence: solver > time > confidence > iterations.
3. `rootStopReason` is always populated when diagnostics are enabled.
4. The Hoeffding bound assumes rewards in [0, 1] — this is consistent with the existing sigmoid normalization in `evaluate.ts`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/root-confidence-stop.test.ts` — new: tests all stop conditions, precedence, and determinism.
2. `packages/engine/test/unit/agents/mcts/config.test.ts` — modified: validation tests for `rootStopConfidenceDelta` and `rootStopMinVisits`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/unit/agents/mcts/root-confidence-stop.test.js`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck && pnpm turbo lint`

# 63MCTSRUNMOVCLA-005: Integrate `materializeMovesForRollout` into `rollout.ts`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — MCTS `rollout.ts`, `materialization.ts` (remove old functions)
**Deps**: 63MCTSRUNMOVCLA-003

## Problem

Both rollout functions (`rollout()` and `simulateToCutoff()`) use materialization functions that contain the flawed fast-path bypass. `rollout()` calls `materializeConcreteCandidates` (mostly correct but still has `concreteActionIds` awareness). `simulateToCutoff()` calls `materializeOrFastPath` (broken — skips `legalChoicesEvaluate` for "concrete" actions). Both must switch to `materializeMovesForRollout` (from ticket 003).

## Assumption Reassessment (2026-03-16)

1. `rollout()` at line ~169 calls `materializeConcreteCandidates()` — **confirmed**.
2. `simulateToCutoff()` at line ~282 calls `materializeOrFastPath()` — **confirmed**.
3. `simulateToCutoff()` has a forced-sequence compression block (lines ~298-317) that checks `matResult.fastPath` — this must change since `materializeMovesForRollout` has no `fastPath` flag.

## Architecture Check

1. Both rollout functions get consistent behavior: runtime classification for every move, random completion for pending moves.
2. `simulateToCutoff()` forced-sequence compression changes from `fastPath && candidates.length === 1` to checking candidate count alone (all moves classified at runtime, no separate "template" bucket to worry about).
3. No backwards-compatibility shims.

## What to Change

### 1. Replace `materializeConcreteCandidates` in `rollout()`

At line ~169, replace:
```typescript
const { candidates, rng: nextRng } = materializeConcreteCandidates(
  def, simState, legalMovesResult, simRng, config.templateCompletionsPerVisit, runtime, ...
);
```
with:
```typescript
const { candidates, rng: nextRng } = materializeMovesForRollout(
  def, simState, legalMovesResult, simRng, config.templateCompletionsPerVisit, runtime, ...
);
```

### 2. Replace `materializeOrFastPath` in `simulateToCutoff()`

At line ~282, replace:
```typescript
const matResult = materializeOrFastPath(
  def, simState, legalMovesResult, simRng, config.templateCompletionsPerVisit, runtime, ...
);
```
with:
```typescript
const matResult = materializeMovesForRollout(
  def, simState, legalMovesResult, simRng, config.templateCompletionsPerVisit, runtime, ...
);
```

### 3. Update forced-sequence compression in `simulateToCutoff()`

The current check uses `matResult.fastPath && candidates.length === 1`. Since `materializeMovesForRollout` doesn't return a `fastPath` flag, change to:
```typescript
if (candidates.length === 1)
```
This is safe because runtime classification already ensures all candidates are complete — a single candidate means only one legal option, which is the definition of a forced sequence.

### 4. Remove old functions from `materialization.ts`

After this ticket + ticket 004, the following are dead code:
- `materializeConcreteCandidates` — replaced by `materializeMovesForRollout` (rollout) and `classifyMovesForSearch` (search)
- `materializeOrFastPath` — replaced by both new functions

Remove both. Update `mcts/index.ts` exports accordingly.

### 5. Update rollout imports

Change imports in `rollout.ts` from old function names to `materializeMovesForRollout`.

## Files to Touch

- `packages/engine/src/agents/mcts/rollout.ts` (modify — replace materialization calls, update forced-sequence check)
- `packages/engine/src/agents/mcts/materialization.ts` (modify — remove `materializeConcreteCandidates`, `materializeOrFastPath`)
- `packages/engine/src/agents/mcts/index.ts` (modify — remove old exports, ensure new exports present)
- `packages/engine/test/unit/agents/mcts/rollout.test.ts` (modify — update to use new function names if directly tested)
- `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts` (modify — `simulateToCutoff` tests)
- `packages/engine/test/unit/agents/mcts/materialization.test.ts` (modify — remove tests for deleted functions, keep `filterAvailableCandidates` tests)

## Out of Scope

- Search loop changes (ticket 004)
- Visitor event renames (ticket 006)
- FITL validation (ticket 007)
- Kernel changes
- Runner changes
- `resolveDecisionBoundary()` — this handles mid-decision completion in selection phase and is unrelated to the classification bug

## Acceptance Criteria

### Tests That Must Pass

1. Existing `rollout.test.ts` tests pass — rollout produces valid simulation results.
2. Existing `hybrid-search.test.ts` tests pass — `simulateToCutoff` with forced-sequence compression works.
3. `rollout-decision.test.ts` tests pass — decision boundary resolution unaffected.
4. No `materializeConcreteCandidates` or `materializeOrFastPath` references remain in production code.
5. `pnpm -F @ludoforge/engine build` — compiles cleanly.
6. `pnpm -F @ludoforge/engine test` — full suite passes.

### Invariants

1. Every move in rollout classified via `legalChoicesEvaluate` — no fast-path bypass.
2. Pending moves in rollout completed via `completeTemplateMove` (random, not incremental).
3. RNG determinism preserved: same seed → same rollout results.
4. Forced-sequence compression in `simulateToCutoff` fires for single-candidate states.
5. No game-specific identifiers introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/rollout.test.ts` — verify rollout uses new materialization
2. `packages/engine/test/unit/agents/mcts/hybrid-search.test.ts` — verify `simulateToCutoff` forced-sequence compression without `fastPath` flag
3. `packages/engine/test/unit/agents/mcts/materialization.test.ts` — remove tests for deleted functions

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

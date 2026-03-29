# 94AGEEVADIA-003: Track completion statistics in preparePlayableMoves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/prepare-playable-moves.ts
**Deps**: 94AGEEVADIA-001

## Problem

`preparePlayableMoves` classifies legal moves into completed, stochastic, and rejected buckets, but does not report classification counts. Campaign harnesses cannot determine the completion success rate or why moves were rejected without replicating the internal classification logic.

## Assumption Reassessment (2026-03-29)

1. `PreparedPlayableMoves` interface has `completedMoves`, `stochasticMoves`, `rng` — **confirmed** (line ~38).
2. No `statistics` field exists on `PreparedPlayableMoves` — **confirmed**.
3. The classification loop processes `viability.complete`, `viability.stochasticDecision`, `!viability.viable` — **confirmed** via spec references to lines 66, 73.
4. Template completion happens via `evaluatePlayableMoveCandidate` with results `playableComplete` and `completionUnsatisfiable` — **confirmed** via spec.
5. `PolicyCompletionStatisticsTrace` type will exist after 94AGEEVADIA-001 — **dependency confirmed**.

## Architecture Check

1. Statistics tracking adds local counter variables alongside the existing classification loop — minimal change, no structural refactor.
2. The `statistics` field on `PreparedPlayableMoves` is optional, keeping the return shape backward-compatible for callers that don't need it.
3. No game-specific logic — classification categories are generic engine concepts.
4. The runtime type `PolicyCompletionStatistics` in the agents layer mirrors the trace-serialized `PolicyCompletionStatisticsTrace` from `types-core.ts` — same field names, separate type ownership per layer convention.

## What to Change

### 1. Define `PolicyCompletionStatistics` interface

In `prepare-playable-moves.ts`:

```typescript
export interface PolicyCompletionStatistics {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionUnsatisfiable: number;
}
```

### 2. Add `statistics?` to `PreparedPlayableMoves`

```typescript
export interface PreparedPlayableMoves {
  readonly completedMoves: readonly TrustedExecutableMove[];
  readonly stochasticMoves: readonly TrustedExecutableMove[];
  readonly rng: Rng;
  readonly statistics?: PolicyCompletionStatistics;
}
```

### 3. Track counters in the main classification loop

Add local mutable counters (`totalClassifiedMoves`, `completedCount`, `stochasticCount`, `rejectedNotViable`, `templateCompletionAttempts`, `templateCompletionSuccesses`, `templateCompletionUnsatisfiable`) incremented at each classification branch. Return them in the result object.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)

## Out of Scope

- Changing classification behavior (bucket assignment logic stays identical)
- Adding new classification categories
- Wiring statistics into `policy-eval.ts` or `policy-diagnostics.ts` (that is 94AGEEVADIA-004)
- Trace-serialized types (that is 94AGEEVADIA-001)

## Acceptance Criteria

### Tests That Must Pass

1. **New**: When all moves are `viability.complete === true`, `completedCount === totalClassifiedMoves` and `stochasticCount === 0`.
2. **New**: When some moves are stochastic, `stochasticCount` reflects exact count.
3. **New**: When moves are rejected as not viable, `rejectedNotViable` reflects exact count.
4. **New**: Template completion attempts, successes, and unsatisfiable counts are accurate across mixed scenarios.
5. **New**: Sum of `completedCount + stochasticCount + rejectedNotViable` equals `totalClassifiedMoves` minus moves that went to template completion.
6. Existing suite: `pnpm -F @ludoforge/engine test -- --test-name-pattern="prepare-playable"` — all existing tests pass unchanged (they ignore the new optional field).

### Invariants

1. `statistics` field is optional — existing callers are unaffected.
2. Classification behavior is identical — same moves in same buckets. Only counting is added.
3. Counter increments are local to the function scope — no shared mutable state.
4. `totalClassifiedMoves` equals `input.legalMoves.length` (every legal move entering the function is counted).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/prepare-playable-moves.test.ts` — add new test cases for statistics accuracy across all classification paths.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="prepare-playable"`
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

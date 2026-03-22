# 75ENRLEGMOVENU-003: skipMoveValidation on ExecutionOptions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — types-core.ts, apply-move.ts
**Deps**: None (independent of 001/002, but used by 005)

## Problem

When the simulator calls `applyMove` with a move that came from its own `legalMoves` call, it redundantly re-validates move legality (~239ms in Texas Hold'em profiling). This ticket adds a `skipMoveValidation` field to `ExecutionOptions` and threads it to the internal `ApplyMoveCoreOptions.skipValidation`.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions` at `types-core.ts:1343-1353` has no `skipMoveValidation` field — must be added.
2. `ApplyMoveCoreOptions` at `apply-move.ts:743-748` already has `skipValidation?: boolean` — the internal mechanism exists.
3. `applyMove` at `apply-move.ts:1537` calls `applyMoveCore` — the `coreOptions` parameter is where `skipValidation` is passed.
4. Currently `applyMove` does NOT pass any `coreOptions` to `applyMoveCore` — it constructs `coreOptions` from `options?.advanceToDecisionPoint` and the phase-transition budget only.

## Architecture Check

1. This is a pure opt-in performance optimization — callers that don't set the flag get identical behavior.
2. Safety: only the simulator (which owns the `legalMoves` → `applyMove` pipeline) should set this flag. Agents and tests don't set it.
3. No new API surface beyond one boolean field on an existing options interface (Foundation 10).

## What to Change

### 1. Add `skipMoveValidation` to `ExecutionOptions` in `types-core.ts`

```typescript
export interface ExecutionOptions {
  // ... existing fields ...
  /** Skip move legality validation in applyMove. Only safe when the move
   *  was obtained from the same legalMoves() call on the same state. */
  readonly skipMoveValidation?: boolean;
}
```

### 2. Thread to `applyMoveCore` in `apply-move.ts`

In the `applyMove` function body, when constructing `coreOptions` for the `applyMoveCore` call, include:
```typescript
skipValidation: options?.skipMoveValidation === true ? true : undefined
```

This merges with the existing `coreOptions` construction (which already handles `skipAdvanceToDecisionPoint` and `phaseTransitionBudget`).

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add field to `ExecutionOptions`)
- `packages/engine/src/kernel/apply-move.ts` (modify — thread field to `applyMoveCore`)

## Out of Scope

- Changing `enumerateLegalMoves` or `legalMoves` (ticket 002)
- Changing agents or `preparePlayableMoves` (ticket 004)
- Actually passing `skipMoveValidation: true` from the simulator (ticket 005)
- Removing or modifying `validateMove` itself — it stays intact for callers that don't skip

## Acceptance Criteria

### Tests That Must Pass

1. `applyMove` with `skipMoveValidation: true` skips the `validateMove` call and still produces a correct `ApplyMoveResult` for a legal move
2. `applyMove` with `skipMoveValidation: true` on an ILLEGAL move does NOT throw during validation (it skips it) — behavior is undefined but not a crash (the caller is responsible for only passing legal moves)
3. `applyMove` without `skipMoveValidation` (or `false`) behaves identically to before — `validateMove` is called
4. Existing suite: `pnpm turbo test` — all existing tests pass unchanged
5. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. `skipMoveValidation` only affects whether `validateMove` runs — all other `applyMove` behavior (effect execution, trigger dispatch, state transitions) is identical.
2. The internal `ApplyMoveCoreOptions.skipValidation` already exists and is trusted by `applyMoveCore` — this ticket only adds the public-facing threading.
3. Default behavior (no flag) is unchanged — this is strictly opt-in.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add tests for `skipMoveValidation: true` producing same result as without for a legal move. Verify validation is actually skipped (e.g., by timing or by checking that an illegal move doesn't throw when flag is set).

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors

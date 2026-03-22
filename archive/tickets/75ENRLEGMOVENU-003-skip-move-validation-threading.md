# 75ENRLEGMOVENU-003: skipMoveValidation on ExecutionOptions

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — types-core.ts, apply-move.ts
**Deps**: None

## Problem

When the simulator calls `applyMove` with a move that came from its own `legalMoves` call, it redundantly re-validates move legality (~239ms in Texas Hold'em profiling). This ticket adds a `skipMoveValidation` field to `ExecutionOptions` and threads it to the internal `ApplyMoveCoreOptions.skipValidation`.

## Assumption Reassessment (2026-03-22)

1. `ExecutionOptions` in `packages/engine/src/kernel/types-core.ts` still has no public `skipMoveValidation` field. This is the missing API surface for the optimization.
2. `ApplyMoveCoreOptions` in `packages/engine/src/kernel/apply-move.ts` already has `skipValidation?: boolean`, and `applyMoveCore` already honors it. The internal skip mechanism is real and exercised today by simultaneous-turn commit fan-in.
3. `applyMove` in `packages/engine/src/kernel/apply-move.ts` still routes the normal round-robin path through `applyMoveCore(..., undefined, runtime)`, so callers outside the file cannot currently opt into that internal skip path.
4. The broader Spec 75 architecture is only partially pending: `ClassifiedMove`, `alwaysCompleteActionIds`, and enriched `enumerateLegalMoves()` are already present in the codebase. This ticket is no longer introducing a new architecture; it is completing one missing public threading step.
5. `legalMoves()` still returns raw `Move[]` today. That means this ticket must stay narrowly focused on `applyMove` threading; simulator/agent adoption remains correctly out of scope for this ticket.
6. The original acceptance text overstated runtime guarantees for illegal moves. Skipping validation only removes the legality gate. It does not make arbitrary illegal or malformed moves safe to execute, and downstream runtime contracts may still throw.

## Architecture Check

1. This remains a good architectural change. The public option is narrowly scoped to exactly one skipped behavior, matches the existing internal implementation, and does not add a parallel API surface.
2. `skipMoveValidation` is cleaner than exposing a generic public `skipValidation` flag because it preserves the kernel's contract surface: callers are only allowed to bypass the outer move-legality check, not any other execution-time validation.
3. This is a pure opt-in performance optimization for trusted pipelines. Callers that do not set the flag retain identical behavior.
4. Safety boundary: only code that owns a same-state `legalMoves` -> select -> `applyMove` pipeline should set this flag.
5. Ideal long-term architecture would be a branded "trusted legal move" handoff instead of a boolean option. That would encode the trust boundary in types rather than convention. This ticket does not attempt that larger refactor and should stay minimal.

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

Today the normal `applyMove` path passes `undefined` for `coreOptions`, so this ticket should introduce a small local `coreOptions` object for the round-robin path only. Simultaneous submission handling already uses `skipValidation` internally and should remain unchanged.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add field to `ExecutionOptions`)
- `packages/engine/src/kernel/apply-move.ts` (modify — thread field to `applyMoveCore`)

## Out of Scope

- Changing `enumerateLegalMoves` or `legalMoves` (ticket 002)
- Changing agents or `preparePlayableMoves` (ticket 004)
- Actually passing `skipMoveValidation: true` from the simulator (ticket 005)
- Removing or modifying `validateMove` itself — it stays intact for callers that don't skip
- Converting the trust boundary from a boolean flag to a branded trusted-move type

## Acceptance Criteria

### Tests That Must Pass

1. `applyMove` with `skipMoveValidation: true` skips the legality gate and still produces the same `ApplyMoveResult` as the default path for a representative legal move.
2. `applyMove` with `skipMoveValidation: true` must bypass the initial legality rejection for a representative move that is illegal only because `validateMove` rejects it. The test should use a controlled case where downstream execution still succeeds so the behavior is observable and deterministic.
3. `applyMove` without `skipMoveValidation` (or with `false`) preserves the existing rejection behavior for that same illegal move.
4. Existing suite: `pnpm turbo test` — all existing tests pass unchanged
5. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. `skipMoveValidation` only affects whether `validateMove` runs — all other `applyMove` behavior (effect execution, trigger dispatch, state transitions) is identical.
2. The internal `ApplyMoveCoreOptions.skipValidation` already exists and is trusted by `applyMoveCore` — this ticket only adds the public-facing threading.
3. Default behavior (no flag) is unchanged — this is strictly opt-in.
4. This flag is not a blanket guarantee that illegal moves execute safely; it only bypasses the move-legality check at the `applyMove` boundary.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — add a parity test showing `skipMoveValidation: true` produces the same result as the default path for a legal move.
2. `packages/engine/test/unit/apply-move.test.ts` — add a focused regression test showing the public flag bypasses the initial legality rejection for a controlled validation-only illegal move, while the default path still throws.

### Commands

1. `pnpm -F @ludoforge/engine test` — engine tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors

## Outcome

- Completed: 2026-03-22
- Actual changes:
  - Added `ExecutionOptions.skipMoveValidation` to the public kernel execution surface.
  - Threaded the flag through the normal `applyMove` -> `applyMoveCore` path as `skipValidation`.
  - Added unit coverage for legal-move parity and for a controlled validation-only illegal move that demonstrates the public skip behavior.
- Deviations from original plan:
  - The ticket was corrected before implementation because Spec 75 infrastructure (`ClassifiedMove`, `alwaysCompleteActionIds`, enriched `enumerateLegalMoves`) had already landed, so this was a smaller public-threading completion than originally assumed.
  - The illegal-move acceptance criterion was tightened. The implementation does not promise arbitrary illegal moves are safe; the regression test uses a deterministic validation-only illegal move and disables auto-advance so it isolates the intended behavior.
- Verification:
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`

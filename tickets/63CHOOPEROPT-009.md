# 63CHOOPEROPT-009: Worker-local session integration and revision invalidation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — runner worker only
**Deps**: 63CHOOPEROPT-007, 63CHOOPEROPT-008

## Problem

The worker currently delegates every `advanceChooseN` call statelessly to the kernel. Each add/remove triggers two full pipeline walks. The worker needs to hold a `ChooseNSession` locally and use the session-aware fast path, falling back to the stateless path when the session is invalid or ineligible.

## Assumption Reassessment (2026-03-15)

1. `game-worker-api.ts` maintains mutable state (`def`, `state`, `runtime`, `history`) and exposes an async API via Comlink.
2. The worker already passes `GameDefRuntime` (adjacency graph, runtime table index) to kernel calls.
3. The store/bridge currently calls `advanceChooseN(partialMove, decisionKey, currentSelected, command)` — this API does NOT change.
4. There is no session concept in the worker today. The worker is stateless per-call.

## Architecture Check

1. The session is worker-local — never serialized across Comlink.
2. The bridge/store API is unchanged — the optimization is transparent.
3. Fallback to the stateless path ensures correctness even when session is invalid.
4. Revision counter is a simple worker-local integer — incremented on any state mutation.

## What to Change

### 1. Add worker-local state for session and revision

In `game-worker-api.ts`:
- Add `chooseNSession: ChooseNSession | null` — current active session
- Add `revision: number` — monotonically increasing counter

### 2. Increment revision on state mutations

Increment `revision` in:
- `applyMove()`
- `undo()`
- `reset()`
- Any other state-mutating worker method

On increment, also set `chooseNSession = null` (invalidate).

### 3. Create session on chooseN discovery

When `legalChoicesEvaluate()` returns a `chooseN` pending request:
- Check template eligibility
- If eligible: create session from template + initial state + current revision
- If not eligible: leave session null (stateless fallback)

### 4. Use session in `advanceChooseN()`

```
if (chooseNSession && isSessionValid(chooseNSession, revision)) {
  result = advanceChooseNWithSession(chooseNSession, command);
} else {
  chooseNSession = null;
  result = advanceChooseN(def, state, partialMove, decisionKey, currentSelected, command, runtime);
}
```

### 5. Conservative fallback

If the session path throws or returns unexpected results, catch and fall back to stateless path. Log a diagnostic warning (dev-only).

## Files to Touch

- `packages/runner/src/worker/game-worker-api.ts` (modify)

## Out of Scope

- Engine kernel changes (already done in Phase A + 007/008)
- Store/bridge API changes (none needed)
- UI changes (63CHOOPEROPT-011)
- Diagnostics payload (63CHOOPEROPT-010)
- `advance-choose-n.ts` changes (stateless API preserved as-is)

## Acceptance Criteria

### Tests That Must Pass

1. New test: worker creates session on chooseN discovery → subsequent add/remove uses session path
2. New test: `applyMove` increments revision → session is invalidated → next advanceChooseN falls back to stateless
3. New test: `undo` invalidates session
4. New test: non-eligible chooseN → no session created → stateless path used
5. New test: session path produces identical result to stateless path for the same toggle sequence
6. New test: rapid add/add/remove/add sequence → session correctly tracks cumulative state
7. Existing suite: `pnpm -F @ludoforge/runner test`
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Bridge/store API is UNCHANGED — `advanceChooseN(partialMove, decisionKey, currentSelected, command)` signature preserved.
2. Session is never serialized across Comlink.
3. Stateless fallback is always available — session is a transparent optimization.
4. Revision counter is monotonically increasing within a worker lifecycle.
5. Pipeline reevaluations per toggle: at most 1 when session is active (down from 2).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/worker/choose-n-session-integration.test.ts` — worker session lifecycle, revision invalidation, fallback behavior, parity with stateless path
2. Modify `packages/runner/test/worker/game-worker-api.test.ts` — verify existing advanceChooseN tests still pass with session layer

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

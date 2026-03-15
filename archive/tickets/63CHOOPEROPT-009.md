# 63CHOOPEROPT-009: Worker-local session integration and revision invalidation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — engine (template delivery callback) + runner worker
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

- `packages/engine/src/kernel/effect-context.ts` (modify — add `chooseNTemplateCallback` to `EffectContextBase`)
- `packages/engine/src/kernel/effects-choice.ts` (modify — call template callback in `applyChooseN`)
- `packages/engine/src/kernel/legal-choices.ts` (modify — add `onChooseNTemplateCreated` to `LegalChoicesRuntimeOptions`, thread to effect context)
- `packages/engine/src/kernel/runtime.ts` (modify — add `choose-n-session.js` barrel export)
- `packages/runner/src/worker/game-worker-api.ts` (modify — session integration)

## Discrepancy Correction (2026-03-16)

The original ticket assumed `ChooseNTemplate` could be constructed from just the
`ChoicePendingChooseNRequest` returned by `legalChoicesEvaluate()`. It cannot — the
template requires `prioritizedTierEntries`, `qualifierMode`, and `preparedContext`
which are internal to the discovery pipeline in `effects-choice.ts`.

**Solution**: Add a callback-based template delivery mechanism. `LegalChoicesRuntimeOptions`
gets an `onChooseNTemplateCreated` callback. This is threaded to the `EffectContext` via
a new `chooseNTemplateCallback` field on `EffectContextBase`. When `applyChooseN` builds a
pending choice in discovery mode, it also constructs the full `ChooseNTemplate` and delivers
it via the callback. The worker captures the template in its `legalChoices()` method and
creates a session from it.

This follows the existing callback pattern (`onProbeContextPrepared`, `onDeferredPredicatesEvaluated`)
and requires no changes to `EffectResult`, `effect-dispatch.ts`, or the store/bridge API.

## Out of Scope

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

## Outcome

**Completion date**: 2026-03-16

### What changed

**Engine changes (4 files):**
- `effect-context.ts` — Added `chooseNTemplateCallback` to `EffectContextBase` (type-only import of `ChooseNTemplate`)
- `effects-choice.ts` — `applyChooseN` creates full-fidelity `ChooseNTemplate` (with `preparedContext`, `prioritizedTierEntries`, `qualifierMode`) and delivers it via callback when in discovery mode
- `legal-choices.ts` — Added `onChooseNTemplateCreated` callback to `LegalChoicesRuntimeOptions`, threaded to effect context via `buildDiscoveryEffectContextBase`
- `runtime.ts` — Added `choose-n-session.js` barrel export so runner can import session types from `@ludoforge/engine/runtime`

**Runner changes (1 file):**
- `game-worker-api.ts` — Added `chooseNSession`, `revision`, and `invalidateSession()` worker-local state. `legalChoices()` captures template via callback and creates session. `advanceChooseN()` uses session when valid, falls back to stateless on mismatch or error. Revision incremented on all state mutations (`initState`, `executeAppliedMove`, `undo`).

**Tests (1 new file):**
- `choose-n-session-integration.test.ts` — 7 tests covering session creation, undo invalidation, non-eligible fallback, session/stateless parity, rapid toggle sequences, error fallback, session replacement.

### Deviations from original plan

1. **Scope expanded to engine**: Original ticket said "runner worker only". The `ChooseNTemplate` requires internal pipeline data (`prioritizedTierEntries`, `qualifierMode`, `preparedContext`) not available from `ChoicePendingChooseNRequest`. Solution: added callback-based template delivery through the existing effect context pattern.
2. **`undo` invalidation moved before early return**: `invalidateSession()` is called before the `history.length === 0` early return so that undo always invalidates the session, even when there's nothing to undo.

### Verification results

- Engine: 4742/4742 tests pass
- Runner: 1563/1563 tests pass (including 7 new session integration tests)
- Typecheck: clean (all 3 packages)

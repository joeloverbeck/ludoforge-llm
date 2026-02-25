# AIORCH-003: Promote illegal AI template execution to explicit orchestration outcome

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

After adopting atomic AI template execution, `illegal` template results are currently mapped to store outcome `'no-op'`. This conflates deterministic illegal execution failures with transient no-op retries in AI playback, weakening error semantics and delaying clear diagnostics.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/src/store/game-store.ts` maps `applyTemplateMove(...).outcome === 'illegal'` to store `error` plus `AiStepOutcome = 'no-op'`.
2. `packages/runner/src/animation/ai-playback.ts` treats `'no-op'` as retriable and only emits an error after retry exhaustion (`maxNoOpRetries`).
3. Mismatch: illegal template execution is deterministic for the current attempted move and should not be routed through retry semantics.
4. Existing tests confirm current mismatch:
   - `packages/runner/test/store/game-store.test.ts` currently expects `'no-op'` for illegal template execution.
   - `packages/runner/test/animation/ai-playback.test.ts` covers `'no-op'`, `'no-legal-moves'`, and `'uncompletable-template'`, but not explicit illegal-template outcome handling.

## Architecture Check

1. Adding an explicit store-level AI outcome (for example `illegal-template`) is cleaner and more robust than overloading `'no-op'`, because each outcome corresponds to exactly one failure class.
2. This change stays game-agnostic and runner-boundary only: no game-specific behavior is introduced into GameDef/runtime/simulation.
3. No backwards-compatibility aliases/shims: store and playback contracts update directly.

## What to Change

### 1. Add explicit illegal-template AI step outcome

Update `AiStepOutcome` and `resolveSingleAiStep` so worker `illegal` result maps to explicit `'illegal-template'` outcome and deterministic orchestration handling.

### 2. Update playback error mapping

Handle the explicit illegal-template outcome in playback with immediate, dedicated error messaging (no retry-loop semantics).

### 3. Strengthen store + playback tests

Add/adjust tests to assert explicit outcome propagation and immediate playback error path.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/animation/ai-playback.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/animation/ai-playback.test.ts` (modify)

## Out of Scope

- Engine runtime legality/completion algorithm changes.
- Game-specific AI heuristics or fallback policies.
- Visual-config/GameSpecDoc schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveAiStep` returns explicit `'illegal-template'` outcome when worker atomic execution returns `illegal`.
2. Playback emits immediate illegal-template diagnostics and does not consume retry budget intended for transient `'no-op'` outcomes.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. GameDef/runtime/simulation remain game-agnostic and unchanged in behavior.
2. AI orchestration outcomes remain semantically one-to-one (`advanced`, `no-op`, `human-turn`, `terminal`, `no-legal-moves`, `uncompletable-template`, `illegal-template`) without overloading.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — assert `resolveAiStep` returns explicit illegal-template outcome and preserves deterministic state/error behavior.
2. `packages/runner/test/animation/ai-playback.test.ts` — assert immediate `onError` handling for illegal-template outcome with no retry loop.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/store/game-store.test.ts test/animation/ai-playback.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner test`

## Outcome

- **Completion Date**: 2026-02-25
- **What Changed**:
  - Added explicit `AiStepOutcome` value `'illegal-template'` in `packages/runner/src/store/game-store.ts`.
  - Updated AI step resolution to return `'illegal-template'` (instead of `'no-op'`) when `applyTemplateMove` returns `illegal`, while preserving worker error state.
  - Updated playback orchestration in `packages/runner/src/animation/ai-playback.ts` to treat `'illegal-template'` as immediate error (no no-op retries).
  - Updated `packages/runner/test/store/game-store.test.ts` to assert `'illegal-template'` for illegal template execution.
  - Added playback coverage in `packages/runner/test/animation/ai-playback.test.ts` for immediate illegal-template `onError`.
- **Deviations From Original Plan**:
  - None. Implementation matched the ticket scope after assumption reassessment.
- **Verification Results**:
  - `pnpm -F @ludoforge/runner test -- test/store/game-store.test.ts test/animation/ai-playback.test.ts` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.

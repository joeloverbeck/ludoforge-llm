# AIORCH-001: Differentiate AI move-completion failure from no-legal-moves

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`resolveAiStep` currently treats two different states as identical: (a) there are no legal moves, and (b) a legal template move exists but could not be completed. This masks diagnostics and makes AI dead-ends harder to debug.

## Assumption Reassessment (2026-02-25)

1. `packages/runner/src/store/game-store.ts` currently maps `completeMove(...) === null` to `'no-legal-moves'`, conflating semantics.
2. `packages/runner/src/animation/ai-playback.ts` consumes `AiStepOutcome` and currently treats `'no-legal-moves'` as the only dead-end error outcome.
3. Existing tests in `packages/runner/test/store/game-store.test.ts` explicitly assert the conflated behavior (`completeMove() === null` -> `'no-legal-moves'`), so test updates are required.
4. `packages/runner/src/store/store-types.ts` does not define `AiStepOutcome`; modifying it is unnecessary for this ticket.

## Architecture Check

1. Distinguishing completion failure from legal-move absence improves observability and keeps orchestration deterministic.
2. This remains game-agnostic: it introduces generic outcome semantics (`uncompletable-template`) and does not encode game-specific branches in runtime/simulation.
3. Propagating the explicit outcome through store + playback controller is architecturally cleaner than overloading `'no-legal-moves'`, because each outcome now maps to one failure class.
4. No backwards-compatibility aliases/shims will be added; store and playback contracts update directly.

## What to Change

### 1. Add explicit AI step outcome for completion failure

Update store AI resolution flow to return a distinct outcome when template completion fails, rather than `'no-legal-moves'`.

### 2. Surface deterministic diagnostics

Add an explicit non-fatal error/warning path (or telemetry event) describing that a legal template move was uncompletable, including action id and turn metadata.

### 3. Update AI playback outcome handling

Handle the new distinct outcome in playback orchestration with a specific error message path.

### 4. Extend tests for step and turn loops

Add tests validating behavior for `resolveAiStep`, `resolveAiTurn`, and playback controller flow when completion fails.

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/animation/ai-playback.ts` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/animation/ai-playback.test.ts` (modify)

## Out of Scope

- Changing engine legality/completion algorithms.
- Adding game-specific fallback policies.

## Acceptance Criteria

### Tests That Must Pass

1. `resolveAiStep` returns distinct outcome for completion failure and does not call `applyMove`.
2. `resolveAiTurn` exits cleanly when completion failure occurs and does not set misleading no-legal-moves state.
3. Playback controller surfaces completion-failure diagnostics separately from no-legal-moves diagnostics.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. GameDef/runtime/simulation remain game-agnostic; no per-game branching added.
2. AI orchestration outcomes are semantically distinct: no legal move vs uncompletable template.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/game-store.test.ts` — add `resolveAiTurn` completion-failure branch coverage and outcome assertions.
2. `packages/runner/test/store/game-store.test.ts` — change `resolveAiStep` completion-failure expectation from `'no-legal-moves'` to `'uncompletable-template'` and assert no `applyMove`.
3. `packages/runner/test/animation/ai-playback.test.ts` — add/adjust playback diagnostics assertions for the new outcome.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/store/game-store.test.ts`
2. `pnpm -F @ludoforge/runner test -- test/animation/ai-playback.test.ts`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-25
- Actually changed:
  - Added `uncompletable-template` to `AiStepOutcome` and returned it when `completeMove` returns `null`.
  - Added deterministic store diagnostics (`INTERNAL_ERROR` with `UNCOMPLETABLE_TEMPLATE_MOVE` details including action id and active player id).
  - Updated AI playback controller to emit a distinct error message for uncompletable template outcomes.
  - Updated store + playback tests to cover the new semantics and loop behavior.
- Deviations from original plan:
  - `packages/runner/src/store/store-types.ts` was not changed because it does not own the AI step outcome contract.
  - Added playback-layer assertions explicitly because this layer consumed the old conflated outcome.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- test/store/game-store.test.ts` passed (Vitest executed full runner suite in this setup).
  - `pnpm -F @ludoforge/runner test -- test/animation/ai-playback.test.ts` passed (Vitest executed full runner suite in this setup).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.

# ANIMSYS-007: AI Turn Playback Policy and Detail Levels

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None
**Deps**: archive/tickets/ANIMSYS-002.md, archive/tickets/ANIMSYS-005.md, archive/tickets/ANIMSYS-006.md

## Problem

Spec 40 D7 requires a dedicated AI playback policy layer: configurable descriptor detail level, per-step delay, skip-current-turn, and auto-skip AI turns. The current runner has partial pieces (detail filtering and queue/controller primitives), but AI playback behavior is still coupled to `resolveAiTurn()` fast-forward semantics and UI-local controls.

## Assumption Reassessment (2026-02-19)

1. `packages/runner/src/animation/ai-playback.ts` does not exist yet.
2. Descriptor detail-level filtering (`full`/`standard`/`minimal`) already exists in `packages/runner/src/animation/trace-to-descriptors.ts` and is exposed via `AnimationController.setDetailLevel()`.
3. `packages/runner/src/ui/AITurnOverlay.tsx` exists, but speed controls are local-only state and do not drive playback policy; skip calls `resolveAiTurn()` directly.
4. `packages/runner/src/store/game-store.ts` currently exposes `resolveAiTurn()` as a fast-forward loop to the next human turn/terminal state, with no per-step delay contract and no explicit AI playback preference state.
5. `packages/runner/test/ui/AITurnOverlay.test.tsx` and `packages/runner/test/store/ai-move-policy.test.ts` already exist and should be updated, not created from scratch.
6. Existing animation queue/controller tests already cover queue mechanics; this ticket should add policy-orchestration tests rather than duplicating queue tests.

## Architecture Reassessment

A dedicated AI playback controller is more robust than continuing to drive AI turn behavior directly from `resolveAiTurn()` calls in UI components because it:

- separates policy orchestration (timing/detail/skip mode) from kernel move application;
- keeps animation controller/queue abstractions reusable and game-agnostic;
- allows deterministic per-step pacing without embedding timers in UI components;
- provides one place to enforce the invariant that auto-skip stops at the next human decision point.

No backward-compat alias behavior should be added. If API surfaces change, update all call sites and tests in this ticket.

## File List (Expected)

- `packages/runner/src/animation/ai-playback.ts` (new)
- `packages/runner/src/animation/animation-controller.ts` (update playback control surface needed by AI policy)
- `packages/runner/src/animation/index.ts` (export update)
- `packages/runner/src/store/ai-move-policy.ts` (update with AI playback speed/delay policy helpers)
- `packages/runner/src/store/game-store.ts` (add AI playback preferences + step-level AI resolution API)
- `packages/runner/src/canvas/GameCanvas.tsx` (wire AI playback controller lifecycle)
- `packages/runner/src/ui/AITurnOverlay.tsx` (bind controls to real policy state/actions)
- `packages/runner/src/ui/useKeyboardShortcuts.ts` (route AI skip shortcut through policy action)
- `packages/runner/test/animation/ai-playback.test.ts` (new)
- `packages/runner/test/store/ai-move-policy.test.ts` (update)
- `packages/runner/test/ui/AITurnOverlay.test.tsx` (update)
- `packages/runner/test/ui/useKeyboardShortcuts.test.ts` (update)
- `packages/runner/test/canvas/GameCanvas.test.ts` (update for AI playback wiring)
- `packages/runner/test/store/game-store.test.ts` (update for step-level AI resolution / policy state)

## Implementation Notes

- Introduce AI playback orchestrator that subscribes to store state and drives AI steps.
- Add AI playback preference state to the store:
  - detail level: `full | standard | minimal`
  - AI playback speed (mapped to per-step delay, default 0.5s at 1x)
  - auto-skip AI turns toggle
- Add explicit step-level AI resolution API in store for policy orchestration; retain deterministic turn progression invariant.
- Implement skip-current-turn action that:
  - immediately completes queued/current animations for current AI turn;
  - advances AI to the next human decision point.
- Implement auto-skip behavior that fast-forwards AI turns until human decision points without bypassing required human input states.
- Keep all logic game-agnostic and effect-trace-driven.

## Out of Scope

- No new GSAP preset behavior.
- No reduced-motion media-query implementation (ANIMSYS-009).
- No broad UI redesign outside AI playback controls.
- No changes to engine AI algorithms.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/ai-playback.test.ts`
2. `packages/runner/test/store/ai-move-policy.test.ts`
3. `packages/runner/test/store/game-store.test.ts`
4. `packages/runner/test/ui/AITurnOverlay.test.tsx`
5. `packages/runner/test/ui/useKeyboardShortcuts.test.ts`
6. `packages/runner/test/canvas/GameCanvas.test.ts`

### Invariants That Must Remain True

1. AI playback policy does not mutate kernel rules/state directly; it orchestrates existing store move application APIs.
2. Auto-skip AI turns never skips required human input states.
3. Default AI behavior remains deterministic when playback options are unchanged.
4. No game-specific AI animation branching is introduced.

## Outcome

- **Completion date**: 2026-02-19
- **What actually changed**:
  - Added `packages/runner/src/animation/ai-playback.ts` and wired it in `packages/runner/src/canvas/GameCanvas.tsx` so AI turn playback is policy-driven instead of UI-local.
  - Extended `packages/runner/src/store/game-store.ts` with:
    - step-level AI resolution (`resolveAiStep`);
    - AI playback preference state (`aiPlaybackDetailLevel`, `aiPlaybackSpeed`, `aiPlaybackAutoSkip`);
    - explicit skip signaling (`requestAiTurnSkip`).
  - Updated `packages/runner/src/animation/animation-controller.ts` to expose `skipAll()` for policy orchestration.
  - Updated `packages/runner/src/ui/AITurnOverlay.tsx` and `packages/runner/src/ui/useKeyboardShortcuts.ts` to use store-backed AI playback controls.
  - Added/updated tests for AI playback policy, store behavior, UI wiring, and GameCanvas lifecycle wiring.
- **Deviations from originally planned scope**:
  - Kept `resolveAiTurn()` for deterministic full-turn fast-forward semantics while adding `resolveAiStep()` for orchestrated playback, avoiding a high-churn API break in one ticket.
  - Did not create `packages/runner/src/store/ai-move-policy.ts` from scratch because it already existed; extended it with playback speed/delay helpers.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/ai-playback.test.ts test/store/ai-move-policy.test.ts test/ui/AITurnOverlay.test.tsx test/ui/useKeyboardShortcuts.test.ts test/canvas/GameCanvas.test.ts test/store/game-store.test.ts` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅

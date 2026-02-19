# ANIMSYS-008: Animation Playback Controls UI (Speed/Pause/Skip/AI Modes)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None
**Deps**: ANIMSYS-005, ANIMSYS-007

## Reassessed Baseline (Code + Tests)

Current runner state differed from the original assumptions:

1. Animation infrastructure already existed (`animation-queue`, `animation-controller`, `ai-playback`) with tests.
2. AI playback UI controls already existed in `AITurnOverlay` (`speed`, `detail`, `auto-skip`, `skip`).
3. `AnimationQueue` already supported `pause`, `resume`, `setSpeed`, `skipCurrent`, and `skipAll`.
4. `AnimationController` did **not** expose `pause`, `resume`, `setSpeed`, or `skipCurrent` to UI wiring.
5. No dedicated, always-available animation playback controls component existed in DOM UI.
6. Existing ticket file list/acceptance tests were outdated for the current architecture.

## Problem

Spec 40 requires player-facing animation playback controls for timeline speed, pause/resume, and skip-current, plus AI playback detail/auto-skip controls. AI controls were embedded in `AITurnOverlay` and available only during AI turns, while timeline controls were not exposed from controller to UI.

## Scope (Updated)

- Add a reusable DOM animation controls component.
- Expose queue control capabilities through `AnimationController`.
- Add store-backed animation control state/intents (speed, pause, skip-current token).
- Subscribe and apply those controls inside `GameCanvas` runtime.
- Keep AI detail/auto-skip controls game-agnostic and available from the shared controls surface.
- De-duplicate overlapping controls from `AITurnOverlay`.
- Ensure `.test.tsx` suites are included in runner test discovery.

## File List (Actual)

- `packages/runner/src/ui/AnimationControls.tsx` (new)
- `packages/runner/src/ui/AnimationControls.module.css` (new)
- `packages/runner/src/ui/GameContainer.tsx` (updated)
- `packages/runner/src/ui/AITurnOverlay.tsx` (updated)
- `packages/runner/src/ui/AITurnOverlay.module.css` (updated)
- `packages/runner/src/store/game-store.ts` (updated)
- `packages/runner/src/animation/animation-types.ts` (updated)
- `packages/runner/src/animation/animation-controller.ts` (updated)
- `packages/runner/src/canvas/GameCanvas.tsx` (updated)
- `packages/runner/vitest.config.ts` (updated)
- `packages/runner/test/ui/AnimationControls.test.tsx` (new)
- `packages/runner/test/ui/GameContainer.test.ts` (updated)
- `packages/runner/test/ui/AITurnOverlay.test.tsx` (updated)
- `packages/runner/test/animation/animation-controller.test.ts` (updated)
- `packages/runner/test/canvas/GameCanvas.test.ts` (updated)
- `packages/runner/test/store/game-store.test.ts` (updated)

## Architecture Rationale

This replaced a fragmented UI/control path with a cleaner architecture:

1. `AnimationControls` is the single shared playback-controls surface.
2. `AITurnOverlay` is now focused on AI-turn status + immediate skip.
3. UI writes intents to store; `GameCanvas` applies intents to `AnimationController`.
4. Queue capabilities are consistently reachable through `AnimationController`.
5. AI step speed and animation timeline speed remain distinct concepts.

## Out of Scope

- No changes to descriptor mapping semantics.
- No changes to timeline builder internals or GSAP preset definitions.
- No preference persistence/session storage in this ticket.
- No game-specific labels, rules, or behavior.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/ui/AnimationControls.test.tsx`
2. `packages/runner/test/ui/GameContainer.test.ts`
3. `packages/runner/test/ui/AITurnOverlay.test.tsx`
4. `packages/runner/test/animation/animation-controller.test.ts`
5. `packages/runner/test/canvas/GameCanvas.test.ts`
6. `packages/runner/test/store/game-store.test.ts`

### Invariants That Must Remain True

1. Playback controls never block normal move input while animations are idle.
2. Control actions map deterministically to queue/controller APIs.
3. Existing overlay components continue rendering correctly.
4. UI and control logic remain fully game-agnostic.
5. AI step-speed control and timeline-speed control remain distinct concepts.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Implemented global `AnimationControls` UI with timeline speed, pause/resume, skip-current, AI detail, and AI auto-skip.
  - Extended `AnimationController` to expose `setSpeed`, `pause`, `resume`, and `skipCurrent`.
  - Added store-level animation playback state/intents and wired them to runtime in `GameCanvas` subscriptions.
  - Simplified `AITurnOverlay` to avoid overlapping control ownership.
  - Fixed runner Vitest discovery to include `.test.tsx` files so UI tests are actually executed.
- **Deviations from original plan**:
  - Added `packages/runner/vitest.config.ts` change because `.tsx` suites were previously excluded and would have invalidated acceptance testing confidence.
  - Updated `AITurnOverlay` scope more than initially implied to remove duplicated control surface and enforce single-source UI ownership.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (`83` files, `599` tests).
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.

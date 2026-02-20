# VISFIX-006: AI Action Announcement Floating Labels

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When AI players take actions (fold, call, raise, check, etc.), there is no immediate in-canvas feedback indicating what happened. The state advances, but players must infer the action from downstream state changes or the event log. We want short-lived floating labels near the acting AI player’s area (fade in, hold, fade out) to make AI turns legible without blocking input or gameplay flow.

## Assumption Reassessment (2026-02-20)

### Confirmed

1. `packages/runner/src/store/game-store.ts` is still the authoritative move-application boundary. `resolveSingleAiStep` is the right place to capture AI move announcements.
2. `packages/runner/src/canvas/GameCanvas.tsx` remains the correct integration point for Pixi world-layer renderers.
3. Runner already has GSAP and existing animation orchestration; an independent GSAP timeline for transient labels remains valid.

### Discrepancies vs Current Architecture

1. The ticket’s proposed `actionAnnouncements: ReadonlyMap<PlayerId, string>` + `clearActionAnnouncement` in store is too UI-specific for store state. The store should expose canonical move-application events, not presentation strings and lifecycle cleanup actions.
2. The runner already has a generic move application signal (`onMoveApplied`) used for session history tracking. We should align with that architecture and avoid introducing a second, UI-only announcement protocol in the store.
3. A `Map<PlayerId, string>` cannot represent rapid same-player back-to-back actions without overwrite. Robust behavior requires per-player sequencing/queueing at the renderer layer.

## Architecture Decision

Use a generic, canonical `appliedMoveEvent` in store (actor + move + monotonic sequence) and keep announcement composition/animation entirely inside a dedicated canvas renderer.

Why this is preferable long-term:

1. Keeps store state engine-adjacent and reusable (what move happened, by whom) instead of UI text/state machine artifacts.
2. Keeps rendering concerns (text formatting, timing, queueing, fade semantics) in canvas renderer code where other visual effects live.
3. Avoids aliasing between store + renderer cleanup state (`clearActionAnnouncement`) and reduces coupling.

## Updated Scope

### 1. Add canonical applied-move event state in `game-store.ts`

In `packages/runner/src/store/game-store.ts`:

- Add `appliedMoveEvent` state containing:
  - `sequence` (monotonic number)
  - `actorId`
  - `actorSeat`
  - `move`
- Emit/update `appliedMoveEvent` whenever a move is successfully applied:
  - human flow (`confirmMove`)
  - AI flow (`resolveSingleAiStep`)
- Do **not** store announcement text or lifecycle-clear actions in store.

### 2. Create `action-announcement-renderer.ts`

New file: `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`

Responsibilities:

- Subscribe to `appliedMoveEvent`
- Filter to AI-originated events only
- Resolve anchor position from current render-model zones owned by the acting player
- Render transient Pixi `Text` in world space (effects layer)
- Animate with independent GSAP timeline: fade in -> hold -> fade out
- Manage per-player queueing to avoid overlap/loss for rapid successive AI moves
- Cleanup text/timelines on completion and renderer destroy

### 3. Wire into `GameCanvas.tsx`

In `packages/runner/src/canvas/GameCanvas.tsx`:

- Instantiate action-announcement renderer against `effectsGroup`
- Start it with other runtime controllers
- Destroy it during runtime teardown
- Keep integration via dependency injection pattern used by existing canvas runtime tests

## Files to Touch

- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/store/game-store.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts` (new)

## Out of Scope

- Human action floating labels
- Persisted announcement history/logging
- Audio/haptics
- Visual-config-driven timing/styling knobs
- Coupling announcement playback to animation queue drain

## Acceptance Criteria

1. Successful AI moves emit an `appliedMoveEvent` and produce a floating label near the acting AI player zone
2. Labels animate fade in/hold/fade out via independent GSAP timeline
3. Rapid consecutive AI moves for the same player are queued and displayed in order (no silent overwrite)
4. Human moves do not produce AI floating labels
5. Renderer teardown clears active timelines/display objects cleanly
6. Existing suite remains green: `pnpm -F @ludoforge/runner test`

## Invariants

1. Announcement visuals do not block kernel/store execution
2. Announcement animation timelines remain independent from `AnimationQueue` / AI playback sequencing
3. No engine/kernel/GameSpecDoc changes
4. Store holds canonical move-event data only (no UI-lifecycle cleanup API)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts`
- Emits label for AI move events
- Ignores human move events
- Queues same-player rapid events
- Cleans up on timeline completion and destroy

2. `packages/runner/test/store/game-store.test.ts`
- `confirmMove` and `resolveAiStep` emit `appliedMoveEvent` with actor metadata and sequence progression

3. `packages/runner/test/canvas/GameCanvas.test.ts`
- Runtime creates, starts, and destroys the action announcement renderer

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-20
- Implemented:
  - Added canonical `appliedMoveEvent` + `appliedMoveSequence` state in `game-store.ts`, emitted from both human (`confirmMove`) and AI (`resolveSingleAiStep`) successful move paths.
  - Added `action-announcement-renderer.ts` on Pixi `effectsGroup`, with independent GSAP timeline and per-player queueing for rapid same-player AI actions.
  - Wired renderer startup/teardown into `GameCanvas` runtime lifecycle with DI-compatible construction for existing runtime tests.
  - Extended tests in store and canvas runtime, and added dedicated renderer tests for AI-only filtering, queue behavior, completion cleanup, and destroy behavior.
- Deviations from original plan:
  - Intentionally did not add UI-specific `actionAnnouncements` map or `clearActionAnnouncement` action to store.
  - Replaced that design with canonical move-event state plus renderer-local announcement lifecycle, which is cleaner and more extensible.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

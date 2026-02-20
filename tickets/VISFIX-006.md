# VISFIX-006: AI Action Announcement Floating Labels

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

When AI players take actions (fold, call, raise, check, etc.), there is no visual feedback indicating what happened. The game state updates silently, making it difficult for the human player to follow the action. A floating text label near the AI player's zone — fading in, holding briefly, then fading out — provides clear, non-intrusive action announcements.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/src/store/game-store.ts` contains `resolveSingleAiStep` (line 614) which processes individual AI moves. This is the correct emission point for action announcements — it has access to the chosen action/move details.
2. The game store uses Zustand and the existing pattern of state slices with actions. Adding an `actionAnnouncements` map and `clearActionAnnouncement` action follows established patterns.
3. GSAP is already available in the runner (used by the animation system). An independent GSAP timeline for announcement fade is appropriate — it should NOT go through the AnimationQueue since announcements are fire-and-forget UI effects, not game-state-synchronized animations.
4. `GameCanvas.tsx` manages the PixiJS application lifecycle and can host the announcement renderer.

## Architecture Check

1. Separating announcements into a dedicated renderer (`action-announcement-renderer.ts`) follows the existing pattern of one renderer per visual concern (zone-renderer, token-renderer, adjacency-renderer, table-overlay-renderer). This is cleaner than embedding announcement logic in zone-renderer or a UI overlay.
2. Emitting from `resolveSingleAiStep` ensures announcements are only shown for AI players by construction — no need for an `isAI` check in the renderer.
3. Using an independent GSAP timeline (not AnimationQueue) avoids coupling announcement timing to game-state animation playback, which could delay or skip announcements.

## What to Change

### 1. Add announcement state to game-store.ts

In `packages/runner/src/store/game-store.ts`:

- Add `actionAnnouncements: ReadonlyMap<PlayerId, string>` to the store state (maps player ID to announcement text, e.g. "Fold", "Raise 200")
- Add `clearActionAnnouncement(playerId: PlayerId): void` action
- In `resolveSingleAiStep`, after a successful AI move, set the announcement for that player (extract action display name from the move result)

### 2. Create action-announcement-renderer.ts

New file: `packages/runner/src/canvas/renderers/action-announcement-renderer.ts`

Responsibilities:
- Subscribe to `actionAnnouncements` from the game store
- When an announcement appears for a player, create a PixiJS `Text` object near that player's zone
- Animate with GSAP: fade in (0.3s) → hold (1.5s) → fade out (0.7s) ≈ 2.5s total
- On animation complete, destroy the `Text` object and call `clearActionAnnouncement`
- Position the text below/above the player zone (use zone position from the render model)
- Style: semi-bold, white text with dark shadow for contrast

### 3. Wire into GameCanvas.tsx

In `packages/runner/src/canvas/GameCanvas.tsx`:
- Instantiate the action-announcement-renderer
- Provide it access to the PixiJS stage/container and the game store
- Clean up on unmount

## Files to Touch

- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` (new)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)

## Out of Scope

- Announcements for human player actions (human already sees their own choices in the UI)
- Announcement history/log (event log panel already covers this)
- Sound effects or haptic feedback
- Configurable announcement duration via visual config
- Announcements during animation playback synchronization

## Acceptance Criteria

### Tests That Must Pass

1. When an AI player takes an action, a floating label appears near their zone displaying the action name
2. The label fades in, holds for ~1.5s, then fades out (total ~2.5s)
3. Multiple simultaneous announcements (e.g. rapid AI turns) display correctly without overlap
4. Announcements are cleared from the store after the animation completes
5. No announcements appear for human player actions
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Announcement rendering does not block or delay kernel execution
2. GSAP timelines for announcements are independent of the AnimationQueue
3. No engine/kernel/GameSpecDoc changes required
4. Store state is cleaned up — no stale announcements accumulate

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/action-announcement-renderer.test.ts` — unit tests for announcement creation, GSAP timeline setup, cleanup after animation
2. `packages/runner/test/store/game-store.test.ts` — verify `actionAnnouncements` state updates and `clearActionAnnouncement` action

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint`

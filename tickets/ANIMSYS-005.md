# ANIMSYS-005: Animation Queue + Store Flag Integration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: ANIMSYS-004

## Problem

Spec 40 requires a queue to sequence timelines and coordinate `animationPlaying` gating in the store/canvas-updater path. Without this queue contract, rapid move sequences, skip actions, and speed control are unreliable.

## File List (Expected)

- `packages/runner/src/animation/animation-queue.ts` (new)
- `packages/runner/src/store/game-store.ts` (small integration touch, if required)
- `packages/runner/test/animation/animation-queue.test.ts` (new)
- `packages/runner/test/store/game-store.test.ts` (update)
- `packages/runner/test/canvas/canvas-updater.test.ts` (update)

## Implementation Notes

- Implement queue API from Spec 40 D5: enqueue/skipCurrent/skipAll/pause/resume/setSpeed/destroy.
- Toggle store `animationPlaying` true on first active enqueue; false when drained.
- Apply speed changes to active timeline via `timeScale(multiplier)`.
- Add overflow guard at queue length > 50 (auto-skip oldest queued timelines).
- Ensure `destroy()` kills active/queued timelines and leaves store flag false.

## Out of Scope

- No effectTrace->descriptor mapping.
- No GameCanvas lifecycle wiring.
- No AI detail-level filtering logic.
- No UI controls.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/animation-queue.test.ts`
2. `packages/runner/test/store/game-store.test.ts`
3. `packages/runner/test/canvas/canvas-updater.test.ts`

### Invariants That Must Remain True

1. `animationPlaying` never remains stuck `true` after queue drain/destroy.
2. Queue operations are idempotent/safe when empty.
3. Canvas-updater deferred-flush behavior stays consistent with `animationPlaying` semantics.
4. Queue overflow protection prevents unbounded memory growth.

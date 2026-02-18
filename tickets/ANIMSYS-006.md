# ANIMSYS-006: Animation Controller + GameCanvas Runtime Wiring

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: ANIMSYS-002, ANIMSYS-004, ANIMSYS-005

## Problem

Spec 40 requires a controller that watches store `effectTrace`, builds timelines, and enqueues playback from the canvas runtime. This orchestration does not exist yet, and failure isolation requirements are not implemented.

## File List (Expected)

- `packages/runner/src/animation/animation-controller.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (update)
- `packages/runner/src/animation/index.ts` (update)
- `packages/runner/test/animation/animation-controller.test.ts` (new)
- `packages/runner/test/canvas/GameCanvas.test.ts` (update)

## Implementation Notes

- Instantiate controller in `createGameCanvasRuntime` with sprite refs and position snapshot access.
- Subscribe to store effect-trace changes and execute pipeline:
  1. `traceToDescriptors`
  2. `buildTimeline`
  3. `queue.enqueue`
- Ensure controller teardown is included in runtime `destroy()`.
- Add fatal-init guard: if controller setup fails, game remains playable and `animationPlaying` is not forced true.

## Out of Scope

- No DOM playback controls.
- No AI playback delay/skip policy.
- No reduced-motion media-query listener.
- No per-game preset override loading from YAML.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/animation-controller.test.ts`
2. `packages/runner/test/canvas/GameCanvas.test.ts`
3. `packages/runner/test/canvas/canvas-updater.test.ts` (regression)

### Invariants That Must Remain True

1. Animation failures never block move application or game progression.
2. Controller observes store updates without introducing duplicate subscriptions/memory leaks.
3. GameCanvas runtime init/destroy remains deterministic.
4. Engine-worker bridge interfaces remain unchanged.

# ANIMSYS-006: Animation Controller + GameCanvas Runtime Wiring

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: archive/tickets/ANIMSYS-002.md, archive/tickets/ANIMSYS-004.md, archive/tickets/ANIMSYS-005.md

## Problem

Spec 40 Layer 3 integration is still incomplete: the runner has descriptor mapping (Layer 1), timeline building (Layer 2), and queue playback primitives, but no controller that subscribes to store `effectTrace` and orchestrates the runtime pipeline from `GameCanvas`.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/animation-controller.ts` does not exist yet.
2. `packages/runner/src/canvas/GameCanvas.tsx` currently initializes canvas/render/update/interaction subsystems but does not instantiate an animation controller.
3. `packages/runner/test/animation/animation-controller.test.ts` does not exist yet; `packages/runner/test/canvas/GameCanvas.test.ts` exists and must be extended for controller lifecycle and fatal-init isolation.
4. `packages/runner/test/canvas/canvas-updater.test.ts` already validates `animationPlaying` gating behavior and should remain unchanged as regression coverage.
5. Dependencies `ANIMSYS-002/004/005` are already completed and archived; dependency references should point to `archive/tickets/...`.

## Architecture Reassessment

Adding a dedicated `AnimationController` and wiring it from `GameCanvas` is more beneficial than embedding this logic inside `GameCanvas` or queue code because it:

- keeps Layer 3 orchestration explicit and testable (store subscription -> descriptor mapping -> timeline build -> queue enqueue);
- preserves single responsibility boundaries between canvas rendering and animation playback policy;
- keeps failure isolation centralized (controller init/runtime failures degrade gracefully without blocking gameplay);
- remains game-agnostic and extensible for later tickets (AI playback and reduced-motion policies).

No backward-compat aliases are needed; this ticket should implement the direct architecture and rely on tests to lock behavior.

## File List (Expected)

- `packages/runner/src/animation/animation-controller.ts` (new)
- `packages/runner/src/animation/index.ts` (update export)
- `packages/runner/src/animation/gsap-setup.ts` (typing alignment for controller/queue timeline contract)
- `packages/runner/src/canvas/GameCanvas.tsx` (update runtime wiring)
- `packages/runner/test/animation/animation-controller.test.ts` (new)
- `packages/runner/test/canvas/GameCanvas.test.ts` (update)
- `packages/runner/test/canvas/canvas-updater.test.ts` (regression)

## Implementation Notes

- Add an `AnimationController` that subscribes to store `effectTrace` changes and executes:
  1. `traceToDescriptors`
  2. `buildTimeline`
  3. `queue.enqueue`
- Controller must expose `start()`, `destroy()`, `setDetailLevel()`, and `setReducedMotion()`.
- Skip queueing when no visual descriptors are produced.
- On reduced-motion mode, do not leave playback queued; complete/skip immediately.
- Wire controller creation in `createGameCanvasRuntime`.
- Fatal-init guard: if controller setup fails, canvas runtime still initializes and remains playable; `animationPlaying` is not forced `true`.
- Ensure runtime `destroy()` tears controller down exactly once.

## Out of Scope

- No DOM playback controls (ANIMSYS-008).
- No AI playback delay/skip policy (ANIMSYS-007).
- No `matchMedia` reduced-motion listener plumbing (ANIMSYS-009).
- No game-specific preset loading from YAML (Spec 42).

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/animation-controller.test.ts`
2. `packages/runner/test/canvas/GameCanvas.test.ts`
3. `packages/runner/test/canvas/canvas-updater.test.ts` (regression)
4. `packages/runner/test/animation/animation-queue.test.ts` (regression)

### Invariants That Must Remain True

1. Animation failures never block move application or game progression.
2. Controller observes `effectTrace` updates without duplicate subscriptions or leaks.
3. `GameCanvas` runtime init/destroy remains deterministic.
4. Engine-worker bridge interfaces remain unchanged.

## Outcome

- **Completion date**: 2026-02-19
- **What actually changed**:
  - Added `packages/runner/src/animation/animation-controller.ts` implementing Layer 3 orchestration:
    - subscribes to `effectTrace`;
    - maps descriptors via `traceToDescriptors`;
    - builds timelines via `buildTimeline`;
    - enqueues via `AnimationQueue`.
  - Added reduced-motion handling at controller level (`setReducedMotion`) so queued playback is skipped and incoming timelines are fast-forwarded instead of queued.
  - Wired controller into `packages/runner/src/canvas/GameCanvas.tsx` with guarded initialization and deterministic teardown.
  - Added fatal-init isolation: if controller setup fails, runtime remains playable and explicitly keeps `animationPlaying` false.
  - Added `packages/runner/test/animation/animation-controller.test.ts`.
  - Extended `packages/runner/test/canvas/GameCanvas.test.ts` for controller lifecycle wiring and init-failure fallback.
  - Tightened timeline typing contract in `packages/runner/src/animation/gsap-setup.ts` by extending queue timeline capabilities in `GsapTimelineLike`.
- **Deviations from originally planned scope**:
  - Included a small `gsap-setup.ts` typing alignment change to remove timeline-contract ambiguity between builder output and queue input.
  - Existing `canvas-updater` behavior required no code changes; it remained regression-only coverage.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/animation-controller.test.ts test/canvas/GameCanvas.test.ts test/canvas/canvas-updater.test.ts test/animation/animation-queue.test.ts` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo test` ✅

# ANIMSYS-005: Animation Queue + Store Flag Integration

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: archive/tickets/ANIMSYS-004.md

## Problem

Spec 40 D5 requires a playback queue that sequences timelines and controls the store `animationPlaying` gate deterministically. Without this contract, rapid move bursts, skip flows, and speed changes can race and leave the canvas-updater in inconsistent flush states.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/animation-queue.ts` does not exist yet; queue playback is currently missing.
2. Store-level `animationPlaying` support already exists in `packages/runner/src/store/game-store.ts` (`setAnimationPlaying`) and is already validated in `packages/runner/test/store/game-store.test.ts`; this ticket should integrate with that contract, not redesign store state.
3. Canvas gating/queued flush semantics already exist in `packages/runner/src/canvas/canvas-updater.ts` and are already covered by focused tests; this ticket should preserve those semantics via deterministic queue flag transitions.
4. `ANIMSYS-004` is completed and archived, so this ticket should depend on its output (timeline layer), not an active ticket file.

## Architecture Reassessment

Adding an explicit queue boundary is more beneficial than pushing playback control into controller/store code because it:

- centralizes timeline lifecycle operations (`enqueue`, skip, pause/resume, speed, destroy) behind one deterministic state machine;
- keeps store coupling minimal and generic through an injected `setAnimationPlaying` callback instead of direct store imports;
- makes queue correctness testable in isolation without GSAP runtime globals;
- prevents unbounded buildup via overflow protection while preserving game-agnostic runtime behavior.

This ticket remains scoped to Layer 3 queue behavior + store-flag integration contract. Controller wiring remains ANIMSYS-006.

## File List (Expected)

- `packages/runner/src/animation/animation-queue.ts` (new)
- `packages/runner/src/animation/index.ts` (update export)
- `packages/runner/test/animation/animation-queue.test.ts` (new)
- `tickets/ANIMSYS-005.md` (update)

## Implementation Notes

- Implement queue API from Spec 40 D5:
  - `enqueue`
  - `skipCurrent`
  - `skipAll`
  - `pause`
  - `resume`
  - `setSpeed`
  - `destroy`
  - readonly `isPlaying`
  - readonly `queueLength`
  - `onAllComplete`
- Toggle injected `setAnimationPlaying(true)` on first active enqueue and `setAnimationPlaying(false)` when fully drained.
- Apply speed changes to active timeline via `timeScale(multiplier)`.
- Add overflow guard for queued backlog `> 50` (auto-skip oldest queued timelines).
- Ensure `destroy()` kills active/queued timelines and leaves store flag false.
- Keep queue implementation independent of game-specific descriptors/rules.

## Out of Scope

- No effectTrace -> descriptor mapping changes.
- No timeline builder changes.
- No `GameCanvas` runtime/controller wiring (ANIMSYS-006).
- No DOM playback controls.
- No AI playback detail policy.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/animation-queue.test.ts`
2. `packages/runner/test/store/game-store.test.ts` (regression)
3. `packages/runner/test/canvas/canvas-updater.test.ts` (regression)

### Invariants That Must Remain True

1. `animationPlaying` never remains stuck `true` after queue drain, skip-all, or destroy.
2. Queue operations are idempotent/safe when empty.
3. Queue overflow protection prevents unbounded queued growth.
4. Existing canvas-updater deferred-flush behavior remains compatible with `animationPlaying` semantics.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added queue implementation at `packages/runner/src/animation/animation-queue.ts` with deterministic playback sequencing and lifecycle operations (`enqueue`, `skipCurrent`, `skipAll`, `pause`, `resume`, `setSpeed`, `destroy`, `onAllComplete`).
  - Integrated store-flag contract through injected callback (`setAnimationPlaying`) without direct store coupling.
  - Added overflow protection (`maxQueuedTimelines`, default `50`) with oldest queued timeline auto-skip.
  - Exported queue APIs from `packages/runner/src/animation/index.ts`.
  - Added dedicated queue tests at `packages/runner/test/animation/animation-queue.test.ts`.
- **Deviations from original plan**:
  - No direct edits to `packages/runner/src/store/game-store.ts` or `packages/runner/src/canvas/canvas-updater.ts` were needed because those contracts already existed and were preserved via regression verification.
  - Queue-store integration is callback-based rather than hardwired store imports, improving testability and extensibility.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/animation-queue.test.ts test/store/game-store.test.ts test/canvas/canvas-updater.test.ts` ✅ (runner vitest suite passed in this environment)
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅

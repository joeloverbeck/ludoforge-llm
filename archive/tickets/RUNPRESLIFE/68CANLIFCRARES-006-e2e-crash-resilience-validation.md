# 68CANLIFCRARES-006: End-to-end crash resilience validation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-001-remove-texture-null-from-neutralize-and-fallback.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-002-double-raf-disposal-queue.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-003-ticker-error-fence-and-runtime-crash-reporting.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-004-store-lifecycle-crash-states.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-005-canvas-crash-observer-and-recovery-wiring.md

## Problem

Tickets 001–005 already shipped the crash-prevention and recovery architecture. What remains is to validate the composed behavior across those pieces: a contained ticker failure escalates into a single recovery request, the canvas runtime re-mounts automatically, and the store-backed session state survives unchanged.

## Assumption Reassessment (2026-03-20)

1. The architecture described in Spec 68 is already implemented, but some names differ from the draft plan:
   - crash recovery is handled by [`packages/runner/src/canvas/canvas-crash-recovery.ts`](packages/runner/src/canvas/canvas-crash-recovery.ts), not a `canvas-crash-observer.ts` file
   - [`packages/runner/src/canvas/GameCanvas.tsx`](packages/runner/src/canvas/GameCanvas.tsx) owns recovery-triggered re-mounting by bumping an internal revision state
   - [`packages/runner/src/canvas/game-canvas-runtime.ts`](packages/runner/src/canvas/game-canvas-runtime.ts) installs the ticker fence and recreates the animation controller as part of runtime creation
2. The store lifecycle states already exist as `playing`, `canvasCrashed`, `reinitializing`, and `terminal`; there is no `running` state in the current runner architecture.
3. Current tests already cover the individual seams:
   - ticker containment in `packages/runner/test/canvas/ticker-error-fence.test.ts`
   - recovery orchestration in `packages/runner/test/canvas/canvas-crash-recovery.test.ts`
   - store crash lifecycle transitions in `packages/runner/test/store/game-store-crash-lifecycle.test.ts`
   - GameCanvas re-mount behavior in `packages/runner/test/canvas/GameCanvas.recovery.test.tsx`
4. The remaining gap is composed validation across those seams, not new production architecture.

## Architecture Check

1. This stays a validation-only ticket unless the new tests expose a real defect. Adding more production abstractions here would make the architecture worse, not better.
2. The clean approach is to extend the existing Vitest recovery harnesses instead of introducing a parallel pseudo-E2E stack. The code already has clear seams:
   - ticker fence for render-loop containment
   - `createCanvasCrashRecovery()` for store lifecycle orchestration
   - `GameCanvas` for runtime teardown/recreation
3. The validation should prove composition and invariants, not duplicate lower-level unit coverage already provided by tickets 001–005.

## What to Change

### 1. Add composed recovery validation in the existing canvas recovery test surface

Extend `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` so the test exercises the full recovery path that the component actually owns:
- start with a store fixture that carries representative session state, not only lifecycle methods
- trigger a runtime failure through the `onError` callback passed into `createGameCanvasRuntime()`
- assert:
  - lifecycle transitions through `canvasCrashed` and `reinitializing`
  - `GameCanvas` tears down the failed runtime and creates a fresh runtime
  - `canvasRecovered()` returns to `playing` or `terminal` depending on preserved store state
  - the underlying session data (`gameDef`, `gameState`, `renderModel`) is preserved throughout recovery

### 2. Add repeated-cycle validation at the component seam

Add a recovery test that performs multiple crash/re-mount cycles against the same store fixture and asserts:
- each crash schedules exactly one recovery window
- each cycle destroys the prior runtime before creating the next one
- the preserved store-backed session snapshot remains stable across cycles

### 3. Add one integration-level transient-error/non-recovery assertion

Add a test that covers the boundary between the ticker fence and recovery policy:
- a single contained ticker error must not request recovery
- only threshold-reaching crash handling should flow into the recovery path

This should live in the existing crash-recovery/ticker-fence test surface, whichever gives the cleanest proof without duplicating lower-level assertions.

## Files to Touch

- `packages/runner/test/canvas/GameCanvas.recovery.test.tsx`
- `packages/runner/test/canvas/canvas-crash-recovery.test.ts`
- `packages/runner/test/canvas/ticker-error-fence.test.ts`

## Out of Scope

- Modifying production source files unless a real failing test proves an implementation defect.
- Browser-based E2E testing with real PixiJS rendering (requires Playwright setup — future work).
- GPU memory profiling (requires browser devtools — manual validation).
- Modifying any engine package files.
- Adding crash telemetry or monitoring infrastructure.
- Handling WebGL context loss.
- Re-testing disposal queue timing or `_texture` handling already covered by tickets 001–002.
- Building special GSAP-only crash harnesses. Runtime recreation already recreates animation infrastructure; this ticket should validate that through the existing runtime boundary rather than by white-boxing animation internals.

## Acceptance Criteria

### Tests That Must Pass

1. A `GameCanvas` recovery test proves `playing -> canvasCrashed -> reinitializing -> playing` while preserving store-backed session data.
2. A `GameCanvas` recovery test proves the same flow returns to `terminal` when the preserved session is terminal.
3. A repeated-cycle recovery test proves each crash tears down the previous runtime and re-mounts exactly once.
4. A crash-handling test proves recovery requests are deduplicated within a single recovery window.
5. A ticker-fence test proves a single contained error does not trigger crash escalation.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No production code changes unless the new validation exposes a genuine bug.
2. All tests from 001–005 must continue to pass.
3. The validation must remain self-contained (no dependency on a real browser render loop, real PixiJS rendering, or real GSAP timelines).
4. The ticket validates the current architecture; it does not introduce aliases, fallback paths, or shadow abstractions.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` — extend recovery coverage to assert state preservation and repeated-cycle behavior at the actual component/runtime seam.
2. `packages/runner/test/canvas/canvas-crash-recovery.test.ts` — strengthen orchestration invariants around single recovery-window deduplication if needed.
3. `packages/runner/test/canvas/ticker-error-fence.test.ts` — keep the contained-single-error invariant explicit in the validation sweep.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/GameCanvas.recovery.test.tsx`
2. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/canvas-crash-recovery.test.ts`
3. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/ticker-error-fence.test.ts`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-20
- What actually changed:
  - corrected the ticket to match the shipped recovery architecture (`canvas-crash-recovery.ts`, `GameCanvas` remount orchestration, existing crash lifecycle states)
  - extended `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` to prove store-state preservation and repeated crash/recovery cycles
  - strengthened `packages/runner/test/canvas/ticker-error-fence.test.ts` so the non-escalation invariant for a single contained error is explicit
- Deviations from original plan:
  - no new pseudo-E2E file was added; validation stayed on the existing component/runtime seams because that is the cleaner architecture and avoids duplicating lower-level crash tests
  - no production code changes were required
- Verification results:
  - `pnpm -F @ludoforge/runner exec vitest run test/canvas/GameCanvas.recovery.test.tsx test/canvas/ticker-error-fence.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

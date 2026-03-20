# 68CANLIFCRARES-006: End-to-end crash resilience validation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68CANLIFCRARES-001-remove-texture-null-from-neutralize-and-fallback.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-002-double-raf-disposal-queue.md, archive/tickets/RUNPRESLIFE/68CANLIFCRARES-003-ticker-error-fence-and-runtime-crash-reporting.md, tickets/68CANLIFCRARES-004-store-lifecycle-crash-states.md, tickets/68CANLIFCRARES-005-canvas-crash-observer-and-recovery-wiring.md

## Problem

Tickets 001–005 implement the crash prevention and recovery mechanisms individually. This ticket validates that the full pipeline works end-to-end: a forced texture pool crash is survived, the canvas recovers automatically, game state is preserved, and GSAP animations can resume.

## Assumption Reassessment (2026-03-20)

1. After 001–005, the runner has: no `_texture` nulling (001), double-RAF disposal (002), ticker error fence (003), crash lifecycle states (004), and crash observer + recovery wiring (005).
2. GSAP animation controller creates timelines per animation descriptor. After canvas re-mount, the animation controller is re-created fresh — in-progress animations are lost (acceptable per spec).
3. The game store's `renderModel`, `gameState`, `gameDef` survive through the crash cycle (Zustand is independent of PixiJS).

## Architecture Check

1. This is a validation-only ticket — no new production code. It adds integration/e2e tests that exercise the full crash → recovery pipeline.
2. Tests use the existing test infrastructure (Vitest, mock PixiJS app, mock store) to simulate the crash scenario.

## What to Change

### 1. Add integration test: full crash → recovery cycle

New test in `packages/runner/test/canvas/crash-resilience-e2e.test.ts`:
- Set up a mock PixiJS app with ticker error fence installed.
- Set up a mock game store in `playing` state with game data.
- Wire the crash observer.
- Force a ticker error (throw inside the mock `_tick`) repeatedly to exceed the consecutive error threshold.
- Assert:
  - Store lifecycle transitioned: `playing → canvasCrashed → reinitializing`.
  - `onRecoveryNeeded` was called.
  - After simulated re-mount: `canvasRecovered()` transitions back to `playing`.
  - Game state fields (`gameDef`, `gameState`, `renderModel`) are unchanged.

### 2. Add test: no GPU resource leaks after multiple crash/recovery cycles

- Run the crash → recovery cycle 3 times.
- Assert disposal queue flushes on each teardown.
- Assert no accumulation of pending containers across cycles.

### 3. Add test: GSAP animation controller re-creation after recovery

- Verify that after recovery, a new animation controller can be created and started without errors.
- Verify the new controller receives the current store state.

## Files to Touch

- `packages/runner/test/canvas/crash-resilience-e2e.test.ts` (new)

## Out of Scope

- Modifying any production source files.
- Browser-based E2E testing with real PixiJS rendering (requires Playwright setup — future work).
- GPU memory profiling (requires browser devtools — manual validation).
- Modifying any engine package files.
- Adding crash telemetry or monitoring infrastructure.
- Handling WebGL context loss.

## Acceptance Criteria

### Tests That Must Pass

1. `crash resilience e2e > full crash → recovery cycle preserves game state` — the core pipeline test.
2. `crash resilience e2e > store lifecycle transitions through canvasCrashed → reinitializing → playing` — verify exact transition sequence.
3. `crash resilience e2e > multiple crash/recovery cycles do not leak pending disposal containers` — verify disposal queue is clean after each cycle.
4. `crash resilience e2e > animation controller can be re-created after recovery` — verify no errors on fresh controller creation.
5. `crash resilience e2e > single transient error does not trigger recovery` — verify a single ticker error is contained without crash/recovery.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No production code changes in this ticket.
2. All tests from 001–005 must continue to pass.
3. The e2e tests must be self-contained (no dependency on real browser, real PixiJS rendering, or real GSAP timelines).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/crash-resilience-e2e.test.ts` — integration tests exercising the full crash → recovery pipeline with mocked PixiJS and store infrastructure.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/canvas/crash-resilience-e2e.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

# ANIMDIAG-007: Download Button in AnimationControls

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-006

## Problem

Diagnostic data is buffered in memory but there's no way for developers to export it. A "Download Log" button in the animation controls panel lets developers see something wrong in the UI, immediately click download, and get a structured JSON file they can paste to Claude or inspect manually. Zero infrastructure required — works entirely client-side.

## Assumption Reassessment (2026-02-22)

1. `AnimationControls.tsx` exists at `packages/runner/src/ui/AnimationControls.tsx` and already renders animation playback controls.
2. `GameContainer.tsx` renders `AnimationControls`, but does **not** hold the animation controller instance. `GameCanvas` creates and owns controller lifecycle inside `createGameCanvasRuntime`.
3. The animation controller exposes `getDiagnosticBuffer()` (`packages/runner/src/animation/animation-controller.ts`), and default deps already instantiate a `DiagnosticBuffer`.
4. Existing tests already cover `AnimationControls` and `GameContainer` (`packages/runner/test/ui/AnimationControls.test.tsx`, `packages/runner/test/ui/GameContainer.test.ts`).

## Architecture Check

1. `AnimationControls` should receive an optional `diagnosticBuffer` prop; this keeps UI debug behavior local and avoids store pollution.
2. Because `GameCanvas` owns the controller, the robust path is a one-way callback from `GameCanvas` to `GameContainer` that publishes the current buffer reference; `GameContainer` then passes it into `AnimationControls`.
3. Keep dev gating at render time (`import.meta.env.DEV`) so production builds do not show the debug action.
4. No engine boundary concerns — purely runner/UI debug infrastructure.

## What to Change

### 1. Add `diagnosticBuffer` prop to `AnimationControls`

- Add optional `diagnosticBuffer?: DiagnosticBuffer` prop to the component's props type.
- Only render the download button when `import.meta.env.DEV && diagnosticBuffer` is truthy.

### 2. Add "Download Log" button

Render a button at the end of the controls section:

- `type="button"` (prevent form submission)
- CSS class matching existing control buttons (e.g., `styles.controlButton` or equivalent)
- `data-testid="animation-download-log"` for test targeting
- `onClick` calls `diagnosticBuffer.downloadAsJson()`
- Label: `"Download Log"`

### 3. Surface buffer from `GameCanvas` to `GameContainer`

- Add an optional callback prop on `GameCanvas`/runtime options to publish diagnostic buffer changes, e.g. `onAnimationDiagnosticBufferChange?: (buffer: DiagnosticBuffer | null) => void`.
- When `GameCanvas` creates the animation controller, publish `animationController?.getDiagnosticBuffer() ?? null`.
- On teardown, clear the published value (`null`) to avoid stale references.
- In `GameContainer.tsx`, store that value in local state and pass it as `diagnosticBuffer` to `AnimationControls`.

## Files to Touch

- `packages/runner/src/ui/AnimationControls.tsx` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)

## Out of Scope

- Buffer implementation (ANIMDIAG-002)
- Controller wiring (ANIMDIAG-006)
- Styling beyond matching existing button styles
- Production-mode UI

## Acceptance Criteria

### Tests That Must Pass

1. Download button renders when `import.meta.env.DEV` is true and buffer is provided.
2. Download button does NOT render when buffer is undefined.
3. Clicking the button calls `diagnosticBuffer.downloadAsJson()`.
4. Existing AnimationControls functionality unchanged.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Button only visible in dev mode — never in production builds.
2. No new dependencies added to the component beyond the buffer prop.
3. No layout changes to existing controls — button is appended at the end.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/AnimationControls.test.tsx` — add tests:
   - Button renders with buffer prop in dev mode
   - Button absent without buffer prop
   - Click handler invokes `downloadAsJson()`
2. `packages/runner/test/ui/GameContainer.test.ts` — verify `GameContainer` forwards buffer from `GameCanvas` callback into `AnimationControls`.
3. `packages/runner/test/canvas/GameCanvas.test.ts` — verify buffer publication callback receives controller buffer on init and `null` on teardown.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-02-22
- **What changed**:
  - Added optional `diagnosticBuffer` prop and dev-only `Download Log` button in `AnimationControls`.
  - Added `onAnimationDiagnosticBufferChange` callback contract in `GameCanvas` runtime/component; publishes buffer on init and `null` on teardown/error.
  - Updated `GameContainer` to keep the diagnostic buffer in local state and pass it to `AnimationControls` without introducing store-level debug state.
  - Added/updated tests in `AnimationControls`, `GameCanvas`, and `GameContainer` coverage for download behavior and callback wiring.
- **Deviations from original plan**:
  - Original ticket assumed `GameContainer` had direct animation controller access; implementation uses callback publication from `GameCanvas` (actual owner) to preserve clean ownership boundaries.
  - `GameContainer` test verifies callback wiring and initial `diagnosticBuffer` prop state; end-to-end publication behavior is validated in `GameCanvas` and `AnimationControls` tests.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

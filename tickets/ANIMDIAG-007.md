# ANIMDIAG-007: Download Button in AnimationControls

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-006

## Problem

Diagnostic data is buffered in memory but there's no way for developers to export it. A "Download Log" button in the animation controls panel lets developers see something wrong in the UI, immediately click download, and get a structured JSON file they can paste to Claude or inspect manually. Zero infrastructure required — works entirely client-side.

## Assumption Reassessment (2026-02-22)

1. `AnimationControls.tsx` exists at `packages/runner/src/ui/AnimationControls.tsx` and renders animation playback controls — to be confirmed during implementation.
2. `GameContainer.tsx` renders `AnimationControls` and has access to the animation controller — to be confirmed.
3. The animation controller exposes `getDiagnosticBuffer()` after ANIMDIAG-006.

## Architecture Check

1. Passing buffer as a prop to `AnimationControls` is the simplest approach — no new context, no store additions, minimal coupling. `GameContainer` already has controller access.
2. Dev-only rendering via `import.meta.env.DEV` ensures no production bundle bloat.
3. No engine boundary concerns — purely UI/debug infrastructure.

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

### 3. Pass buffer from `GameContainer.tsx`

- In `GameContainer.tsx`, obtain the diagnostic buffer from the animation controller via `getDiagnosticBuffer()`.
- Pass it as the `diagnosticBuffer` prop to `AnimationControls`.

## Files to Touch

- `packages/runner/src/ui/AnimationControls.tsx` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify)

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

1. `packages/runner/test/ui/AnimationControls.test.ts` (if exists, otherwise note for creation) — add tests:
   - Button renders with buffer prop in dev mode
   - Button absent without buffer prop
   - Click handler invokes `downloadAsJson()`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

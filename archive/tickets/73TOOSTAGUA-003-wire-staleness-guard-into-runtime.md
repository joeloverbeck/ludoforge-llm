# 73TOOSTAGUA-003: Wire staleness guard into game-canvas-runtime

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 73TOOSTAGUA-001, 73TOOSTAGUA-002

## Problem

The `HoverStalenessGuard` module (73TOOSTAGUA-002) and the extended `HoverTargetController` (73TOOSTAGUA-001) exist but are not connected to the canvas runtime. This ticket wires the three defense layers into `game-canvas-runtime.ts`:

1. **Canvas DOM `pointerleave`** — clears all hover targets when pointer exits the canvas element.
2. **Viewport drag detection** — clears hover targets when `viewport.moving` is true during `'moved'` events.
3. **Periodic staleness sweep** — started/stopped by `onHoverStateChanged()`, validates screen-space bounds.

## Assumption Reassessment (2026-03-21)

1. `createGameCanvasRuntime` in `game-canvas-runtime.ts` creates `hoverTargetController` at line ~244 and defines `publishHoverAnchor` at line ~492 — confirmed.
2. The viewport `'moved'` handler is attached at line ~515 as `viewport.on('moved', publishHoverAnchor)` — confirmed.
3. `coordinateBridge.canvasBoundsToScreenRect` exists and converts canvas-space bounds to `ScreenRect` — confirmed.
4. `hoverBoundsResolver` is a local function (line ~476) that gets world bounds for a `HoveredCanvasTarget` — confirmed.
5. The `destroy()` function already calls `hoverTargetController.destroy()` and `viewport.off('moved', publishHoverAnchor)` — confirmed.
6. The canvas element is accessible as `gameCanvas.app.canvas as HTMLCanvasElement` — confirmed (used in `createCoordinateBridge` at line ~475).
7. The viewport is cast to a typed interface at line ~511 for `on`/`off`; the `moving` property needs a separate type assertion.
8. Ticket `73TOOSTAGUA-001` completed with `clearAll()`, `getActiveTargets(): readonly HoveredCanvasTarget[]`, and `removeTarget(target: HoveredCanvasTarget)`; runtime wiring should use that domain-level API, not internal keys or maps.
9. The proposed runtime wiring is not currently covered by dedicated runtime tests. Existing unit suites cover the controller and guard in isolation, but `packages/runner/test/canvas/GameCanvas.test.ts` is the correct place to prove the runtime-level integration.
10. The current runtime test fixture does not yet model DOM canvas listener APIs (`addEventListener`, `removeEventListener`, `getBoundingClientRect`). The ticket must include extending that fixture, otherwise the runtime change cannot be exercised or verified at the level this repo expects.

## Architecture Check

1. All three defense layers feed into the same `HoverStalenessGuard` interface, keeping the runtime's wiring minimal (one guard instance, three trigger points).
2. DOM listeners (`pointermove`, `pointerleave`) are attached to the canvas element — the same element already used for `coordinateBridge`. Cleanup is in `destroy()`.
3. The `onTargetChange` callback already calls `publishHoverAnchor`; adding `stalenessGuard.onHoverStateChanged()` to the same callback is the natural integration point.
4. No engine/GameDef/GameSpecDoc boundaries affected — purely runner canvas interaction.
5. No backwards-compatibility shims.
6. The guard should remain a private runtime implementation detail. Injecting it into `GameCanvasRuntimeDeps` would widen the public test seam without improving production architecture; runtime tests can validate behavior through existing hover and viewport seams.

## What to Change

### 1. Add DOM pointer tracking

In `createGameCanvasRuntime`, after the canvas element is available:

- Declare `let lastPointerScreenPosition: { x: number; y: number } | null = null`.
- Create `onCanvasPointerMove` handler: sets `lastPointerScreenPosition` from `e.clientX`/`e.clientY`.
- Create `onCanvasPointerLeave` handler: sets `lastPointerScreenPosition` to `null`, calls `stalenessGuard.onCanvasPointerLeave()`.
- Attach both as DOM event listeners on the canvas element.

### 2. Create and wire the staleness guard

After `hoverTargetController` is created:

- Import `createHoverStalenessGuard` from `./interactions/hover-staleness-guard.js`.
- Create the guard instance with deps wired to `hoverTargetController`'s new methods, `lastPointerScreenPosition`, `canvasElement.getBoundingClientRect()`, and `coordinateBridge.canvasBoundsToScreenRect(hoverBoundsResolver(...))`.
- Update the `onTargetChange` callback to also call `stalenessGuard.onHoverStateChanged()`.

### 3. Extend viewport `'moved'` handler

In the existing `viewport.on('moved', ...)` callback:

- After calling `publishHoverAnchor()`, check if the viewport is actively moving via `(viewportResult.viewport as unknown as { readonly moving?: boolean }).moving`.
- If moving, call `stalenessGuard.onViewportMoving()`.

### 4. Cleanup in `destroy()`

- Call `stalenessGuard.destroy()`.
- Remove the two DOM event listeners (`pointermove`, `pointerleave`) from the canvas element.

### 5. Add runtime integration coverage

- Extend the `GameCanvas.test.ts` runtime fixture so the mocked canvas exposes `addEventListener`, `removeEventListener`, and `getBoundingClientRect`.
- Add runtime tests that prove:
  - canvas `pointerleave` clears the active hover anchor,
  - viewport `'moved'` clears hover state when `moving === true`,
  - runtime destroy removes DOM listeners in addition to the existing viewport listener teardown.

## Files to Touch

- `packages/runner/src/canvas/game-canvas-runtime.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)

## Out of Scope

- Modifying `hover-target-controller.ts` (done in 73TOOSTAGUA-001)
- Modifying `hover-staleness-guard.ts` (done in 73TOOSTAGUA-002)
- Modifying `coordinate-bridge.ts` or `hover-anchor-contract.ts`
- Changes to the store, render model, or animation system
- Changes to zone/token renderers or their hover event handlers
- Adding new deps to `GameCanvasRuntimeDeps` (the guard is created inline, not injected — it's a private implementation detail of the runtime)
- Writing integration/E2E tests requiring a real browser (manual verification covers those scenarios)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/runner typecheck` passes (the new import, guard creation, and viewport type assertion compile cleanly)
2. `pnpm -F @ludoforge/runner lint` passes
3. All existing `hover-target-controller.test.ts` tests pass (3 original + 5 added in 73TOOSTAGUA-001)
4. All `hover-staleness-guard.test.ts` tests pass (12 from 73TOOSTAGUA-002)
5. Full runner test suite passes: `pnpm -F @ludoforge/runner test`

### Invariants

1. `destroy()` removes all DOM event listeners added by this ticket — no leaks
2. `destroy()` calls `stalenessGuard.destroy()` — no lingering intervals
3. The `viewport.on('moved', ...)` handler remains a single registration (not duplicated)
4. `lastPointerScreenPosition` is module-scoped to the `createGameCanvasRuntime` closure — not exported or accessible externally
5. The staleness guard is not exposed on the `GameCanvasRuntime` public interface — it is an internal implementation detail
6. Normal tooltip behavior is unchanged: hover enter/leave still works, tooltips appear and dismiss correctly when `pointerleave` fires normally

## Test Plan

### New/Modified Tests

1. Modify `packages/runner/test/canvas/GameCanvas.test.ts` to add runtime integration coverage for the new wiring and extend the fixture with DOM-canvas listener behavior.
2. Existing `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` remains the proof for controller semantics.
3. Existing `packages/runner/test/canvas/interactions/hover-staleness-guard.test.ts` remains the proof for guard semantics.

### Commands

1. `pnpm -F @ludoforge/runner typecheck`
2. `pnpm -F @ludoforge/runner lint`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-21
- Actual change:
  - wired `HoverStalenessGuard` into `game-canvas-runtime.ts`
  - added canvas-level `pointermove` and `pointerleave` listeners
  - cleared hover state on viewport `'moved'` events while `viewport.moving === true`
  - destroyed the guard and removed DOM listeners during runtime teardown
  - extended `GameCanvas.test.ts` fixture to model DOM canvas listeners and added runtime integration coverage for pointer-leave, viewport-moving, and teardown listener cleanup
- Deviations from original plan:
  - the original ticket claimed no new tests were needed; this was corrected before implementation
  - no new public runtime deps were introduced; the guard remained a private runtime detail
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed
  - `pnpm -F @ludoforge/runner lint` passed
  - `pnpm -F @ludoforge/runner test` passed

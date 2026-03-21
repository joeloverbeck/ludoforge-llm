# Spec 73 — Tooltip Staleness Guard

## Status: Draft

## Problem

Canvas tooltips (zone and token info popups) occasionally get stuck visible during gameplay. The tooltip remains rendered even though the user's pointer is no longer over the zone or token that triggered it. Dismissing the stuck tooltip requires clicking around awkwardly until it disappears.

### Root Cause

The tooltip system relies on PixiJS federated `pointerenter`/`pointerleave` events on zone and token containers to drive `HoverTargetController`. The controller maintains an `activeTargets: Map<string, HoveredCanvasTarget>` that only shrinks when `onHoverLeave()` is called. There is **no safety net** when `pointerleave` fails to fire.

Three scenarios cause lost `pointerleave` events:

1. **Viewport panning**: pixi-viewport's `.drag()` plugin consumes pointer events during pan operations. Child containers (zones, tokens) may never receive `pointerleave` because the viewport's drag handler intercepts the pointer event stream.

2. **Action tooltip transitions**: Moving from a DOM-layer action tooltip (which uses `useHoverPopoverSession` with a 100ms grace period) back to the canvas can create a race condition where the canvas tooltip's `pointerenter` fires without a matching `pointerleave`.

3. **Rapid pointer movement**: Moving the pointer quickly off a zone/token or off the canvas entirely can skip PixiJS's federated `pointerleave` on individual display objects.

In all cases, `activeTargets` retains a stale entry, `publishHoverAnchor()` keeps the tooltip alive (even updating its position via the `viewport.on('moved', ...)` subscription), and the tooltip persists indefinitely.

### Impact

- Not game-breaking, but annoying and distracting during normal gameplay
- Requires awkward clicking to dismiss
- Undermines trust in the UI's responsiveness

## Foundations Alignment

- **F7 (Immutability)**: All new state transitions return new objects or use immutable patterns
- **F9 (No Backwards Compatibility)**: No shims or fallbacks; the fix addresses the root cause
- **F10 (Architectural Completeness)**: Introduces a universal safety net, not a patch for one scenario
- **F11 (Testing as Proof)**: All new logic is unit-testable with injected dependencies

## Solution: Three-Layer Defense

### Layer 1: Canvas DOM `pointerleave`

Attach a `pointerleave` listener on the canvas DOM element (`HTMLCanvasElement`). When the pointer exits the canvas entirely, force-clear all hover targets. This is the fast path for rapid mouse exit (scenario 3).

DOM events are reliable and are not consumed by pixi-viewport's drag plugin.

### Layer 2: Viewport Drag Detection

In the existing `viewport.on('moved', publishHoverAnchor)` handler, check `viewport.moving`. If the viewport is actively moving (drag in progress or deceleration), force-clear all hover targets. This is the fast path for panning (scenario 1).

This is acceptable because tooltips during an active pan are not useful — the board is sliding under the pointer.

### Layer 3: Periodic Staleness Sweep

When `activeTargets` is non-empty, run a periodic sweep (every 500ms) that validates each target's screen-space bounds still contain the current pointer position. Stale entries are removed. This is the universal safety net that catches anything the event-driven triggers miss (scenario 2 and any future edge cases).

The sweep only runs when there are active targets (zero cost when idle). With typically 0-2 entries in `activeTargets`, the per-sweep cost is negligible.

## Detailed Design

### 1. Extend `HoverTargetController`

**File**: `packages/runner/src/canvas/interactions/hover-target-controller.ts`

Add four methods to the existing interface and implementation:

```typescript
export interface HoverTargetController {
  // existing
  getCurrentTarget(): HoveredCanvasTarget | null;
  onHoverEnter(target: HoveredCanvasTarget): void;
  onHoverLeave(target: HoveredCanvasTarget): void;
  destroy(): void;
  // new
  clearAll(): void;
  getActiveTargetCount(): number;
  getActiveTargets(): ReadonlyMap<string, HoveredCanvasTarget>;
  removeTarget(key: string): void;
}
```

- `clearAll()`: Empties `activeTargets` and schedules a publish (which will publish `null` since no targets remain).
- `getActiveTargetCount()`: Returns `activeTargets.size`.
- `getActiveTargets()`: Returns the `activeTargets` map as `ReadonlyMap`.
- `removeTarget(key)`: Deletes a single entry by key and schedules a publish. The key format is `${kind}:${id}` (matching `toTargetKey()`).

### 2. New Module: `HoverStalenessGuard`

**File**: `packages/runner/src/canvas/interactions/hover-staleness-guard.ts`

A pure logic module with injected dependencies — no PixiJS or DOM imports.

```typescript
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HoverStalenessGuardDeps {
  readonly getActiveTargetCount: () => number;
  readonly getActiveTargets: () => ReadonlyMap<string, HoveredCanvasTarget>;
  readonly removeTarget: (key: string) => void;
  readonly clearAll: () => void;
  readonly getPointerScreenPosition: () => { readonly x: number; readonly y: number } | null;
  readonly getCanvasBounds: () => { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null;
  readonly resolveTargetScreenBounds: (target: HoveredCanvasTarget) => ScreenRect | null;
  readonly sweepIntervalMs?: number; // default 500
}

export interface HoverStalenessGuard {
  onViewportMoving(): void;
  onCanvasPointerLeave(): void;
  onHoverStateChanged(): void;
  destroy(): void;
}
```

**Behavior**:

- `onViewportMoving()`: Calls `clearAll()` immediately.
- `onCanvasPointerLeave()`: Calls `clearAll()` immediately.
- `onHoverStateChanged()`: Called whenever `activeTargets` changes. If `getActiveTargetCount() > 0` and no sweep interval is running, starts the periodic sweep. If `getActiveTargetCount() === 0` and a sweep is running, clears it.
- **Sweep tick**: Gets the pointer's screen position. If `null` (pointer left window) or outside canvas bounds, calls `clearAll()`. Otherwise, iterates `getActiveTargets()`, resolves each target's screen bounds, and removes any target whose bounds do not contain the pointer position.
- `destroy()`: Clears any running interval.

### 3. Pointer Position Tracking

**File**: `packages/runner/src/canvas/game-canvas-runtime.ts`

Attach DOM-level listeners on the canvas element:

```typescript
let lastPointerScreenPosition: { x: number; y: number } | null = null;

const canvasElement = gameCanvas.app.canvas as HTMLCanvasElement;

const onCanvasPointerMove = (e: PointerEvent): void => {
  lastPointerScreenPosition = { x: e.clientX, y: e.clientY };
};

const onCanvasPointerLeave = (): void => {
  lastPointerScreenPosition = null;
  stalenessGuard.onCanvasPointerLeave();
};

canvasElement.addEventListener('pointermove', onCanvasPointerMove);
canvasElement.addEventListener('pointerleave', onCanvasPointerLeave);
```

### 4. Viewport Drag Detection

**File**: `packages/runner/src/canvas/game-canvas-runtime.ts`

Extend the existing viewport `'moved'` handler:

```typescript
viewport.on('moved', () => {
  publishHoverAnchor();
  // pixi-viewport sets `moving` to true during active drag and deceleration
  if ((viewportResult.viewport as unknown as { readonly moving?: boolean }).moving) {
    stalenessGuard.onViewportMoving();
  }
});
```

### 5. Wiring the Staleness Guard

**File**: `packages/runner/src/canvas/game-canvas-runtime.ts`

After creating `hoverTargetController`, create the staleness guard and connect the `onTargetChange` callback:

```typescript
const hoverTargetController = createHoverTargetController({
  onTargetChange: () => {
    publishHoverAnchor();
    stalenessGuard.onHoverStateChanged();  // NEW: notify guard of state changes
  },
});

const stalenessGuard = createHoverStalenessGuard({
  getActiveTargetCount: () => hoverTargetController.getActiveTargetCount(),
  getActiveTargets: () => hoverTargetController.getActiveTargets(),
  removeTarget: (key) => hoverTargetController.removeTarget(key),
  clearAll: () => hoverTargetController.clearAll(),
  getPointerScreenPosition: () => lastPointerScreenPosition,
  getCanvasBounds: () => canvasElement.getBoundingClientRect(),
  resolveTargetScreenBounds: (target) => {
    const worldBounds = hoverBoundsResolver(target);
    if (worldBounds === null) return null;
    return coordinateBridge.canvasBoundsToScreenRect(worldBounds);
  },
});
```

In `destroy()`, add cleanup:

```typescript
stalenessGuard.destroy();
canvasElement.removeEventListener('pointermove', onCanvasPointerMove);
canvasElement.removeEventListener('pointerleave', onCanvasPointerLeave);
```

## Files Changed

| File | Change |
|------|--------|
| `packages/runner/src/canvas/interactions/hover-target-controller.ts` | Add `clearAll()`, `getActiveTargetCount()`, `getActiveTargets()`, `removeTarget()` |
| `packages/runner/src/canvas/interactions/hover-staleness-guard.ts` | **New file** — staleness guard module |
| `packages/runner/src/canvas/game-canvas-runtime.ts` | Wire staleness guard, DOM pointer listeners, viewport drag check |

## Test Plan

### `hover-target-controller.test.ts` (extend existing)

- `clearAll()` empties all targets and publishes `null`
- `clearAll()` when already empty is a no-op (no publish)
- `getActiveTargetCount()` returns correct count after enter/leave sequences
- `getActiveTargets()` returns readable snapshot of current entries
- `removeTarget(key)` removes a specific entry and republishes highest-priority
- `removeTarget(key)` with nonexistent key is a no-op

### `hover-staleness-guard.test.ts` (new file)

- `onViewportMoving()` calls `clearAll()` immediately
- `onCanvasPointerLeave()` calls `clearAll()` immediately
- `onHoverStateChanged()` starts sweep interval when `getActiveTargetCount() > 0`
- `onHoverStateChanged()` stops sweep interval when `getActiveTargetCount()` returns 0
- Sweep removes targets whose screen bounds do not contain the pointer
- Sweep removes all targets when pointer position is `null` (left window)
- Sweep removes all targets when pointer is outside canvas bounds
- Sweep keeps targets whose bounds still contain the pointer
- `destroy()` clears any running interval
- No sweep runs when `getActiveTargetCount()` is 0 (no unnecessary timers)
- Multiple rapid `onViewportMoving()` calls are safe (idempotent)

All tests are pure unit tests with injected dependencies — no PixiJS, no DOM, no browser required.

### Manual Verification

1. Hover a zone, pan the viewport away — tooltip should dismiss within one frame
2. Hover a zone, move pointer to action toolbar, then back to canvas — no stuck tooltip
3. Hover a zone, rapidly move pointer off canvas — tooltip dismisses immediately
4. Hover a zone, right-click (context menu) — tooltip clears when pointer moves
5. During normal gameplay, tooltips continue to appear and dismiss correctly

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Sweep interval adds overhead | Only runs when `activeTargets` non-empty (typically 0-2 entries, most of the time empty) |
| Viewport `moving` check may be too aggressive (clears during deceleration) | Acceptable — tooltips during deceleration are not useful; pointer is stationary and a new `pointerenter` will re-trigger the tooltip once movement stops |
| `resolveTargetScreenBounds` may return stale bounds during animation | 500ms sweep interval means bounds are re-resolved each tick; animation frames update positions continuously |
| pixi-viewport API (`moving` property) may change | Accessed via type assertion; easily adjusted if API changes |

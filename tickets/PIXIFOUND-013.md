# PIXIFOUND-013: Coordinate Bridge

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D9
**Priority**: P1
**Depends on**: PIXIFOUND-006
**Blocks**: PIXIFOUND-014

---

## Objective

Implement the coordinate bridge that converts between canvas world-space and DOM screen-space. Required for Spec 39's Floating UI tooltip positioning over zones and tokens.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/coordinate-bridge.ts` — `CoordinateBridge` interface and `createCoordinateBridge()` factory

### New test files
- `packages/runner/test/canvas/coordinate-bridge.test.ts`

---

## Out of Scope

- Do NOT implement Floating UI tooltip positioning — that is Spec 39.
- Do NOT implement any renderers.
- Do NOT modify the viewport setup (PIXIFOUND-006).
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).

---

## Implementation Details

### Interface

```typescript
export interface CoordinateBridge {
  canvasToScreen(worldPos: Position): Position;
  screenToCanvas(screenPos: Position): Position;
  worldBoundsToScreenRect(worldBounds: {
    x: number; y: number; width: number; height: number;
  }): DOMRect;
}
```

### Factory

```typescript
export function createCoordinateBridge(
  viewport: Viewport,
  canvasElement: HTMLCanvasElement,
): CoordinateBridge;
```

### Implementation

- `canvasToScreen`: Uses `viewport.toGlobal(worldPos)` to get canvas-local coordinates, then adds `canvasElement.getBoundingClientRect()` offset for absolute screen position.
- `screenToCanvas`: Reverse of above — subtract canvas rect offset, then `viewport.toLocal()`.
- `worldBoundsToScreenRect`: Transform all 4 corners of the world rect via `canvasToScreen`, compute enclosing `DOMRect`.

---

## Acceptance Criteria

### Tests that must pass

**`coordinate-bridge.test.ts`** (mock viewport transforms, mock canvas element rect):
- `canvasToScreen({x: 0, y: 0})` returns correct screen position based on viewport transform and canvas offset.
- `screenToCanvas(screenPos)` correctly reverses `canvasToScreen(worldPos)` (round-trip identity).
- `worldBoundsToScreenRect` returns a `DOMRect` that encloses the transformed world bounds.
- When viewport is panned, `canvasToScreen` output shifts accordingly.
- When viewport is zoomed, `canvasToScreen` output scales accordingly.
- When canvas element moves (different `getBoundingClientRect`), screen coordinates shift.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `Position` type imported from `renderers/renderer-types.ts`.
- Pure math — no side effects, no PixiJS rendering calls.
- Coordinate conversions account for both viewport transform AND canvas element position.

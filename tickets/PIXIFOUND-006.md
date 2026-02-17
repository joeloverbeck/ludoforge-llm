# PIXIFOUND-006: pixi-viewport Integration

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D3
**Priority**: P0
**Depends on**: PIXIFOUND-005
**Blocks**: PIXIFOUND-011, PIXIFOUND-013, PIXIFOUND-014

---

## Objective

Wrap BoardGroup, TokenGroup, EffectsGroup, and InterfaceGroup inside a pixi-viewport `Viewport` for pan/zoom functionality. HUDGroup remains outside the viewport. Enable drag, pinch, wheel zoom, and clamp-zoom with board bounds.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/viewport-setup.ts` — `setupViewport()` function

### New test files
- `packages/runner/test/canvas/viewport-setup.test.ts`

---

## Out of Scope

- Do NOT implement any renderers (zone, token, adjacency).
- Do NOT create the React mount component `GameCanvas.tsx` — that is PIXIFOUND-014.
- Do NOT implement coordinate bridge — that is PIXIFOUND-013.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT implement board bounds clamping from live zone positions — use a static default for now; dynamic clamping will be wired in PIXIFOUND-011 when position store is connected.

---

## Implementation Details

```typescript
export interface ViewportConfig {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly events: EventSystem;   // from app.renderer.events
  readonly minScale: number;      // e.g., 0.1
  readonly maxScale: number;      // e.g., 4
}

export interface ViewportResult {
  readonly viewport: Viewport;
  updateWorldBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void;
  destroy(): void;
}

export function setupViewport(config: ViewportConfig): ViewportResult;
```

- Create `Viewport` from `pixi-viewport`, passing `options.events` (required for v6 + PixiJS v8).
- Add BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup as children of the viewport.
- Enable plugins: `.drag()`, `.pinch()`, `.wheel()`, `.clampZoom({ minScale, maxScale })`.
- `updateWorldBounds()` adjusts viewport clamp to match actual zone positions (called by canvas-updater when position store changes).
- `destroy()` removes all plugins, removes viewport from parent.

---

## Acceptance Criteria

### Tests that must pass

**`viewport-setup.test.ts`** (mock pixi-viewport Viewport):
- `setupViewport()` returns a `ViewportResult` with `viewport`, `updateWorldBounds`, and `destroy`.
- Viewport is created with `events` from config (not auto-detected).
- Drag, pinch, wheel, and clampZoom plugins are enabled.
- `updateWorldBounds()` updates the viewport's clamp parameters.
- `destroy()` cleans up the viewport.
- HUDGroup from layers is NOT a child of the viewport.
- BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup are children of the viewport.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `options.events` is explicitly passed (pixi-viewport v6 requirement).
- HUDGroup remains outside the viewport (fixed to screen).
- Zoom is clamped between configured min/max scale.

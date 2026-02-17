# PIXIFOUND-014: React Mount Component (GameCanvas.tsx)

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D10
**Priority**: P0
**Depends on**: PIXIFOUND-005, PIXIFOUND-006, PIXIFOUND-011, PIXIFOUND-012, PIXIFOUND-013
**Blocks**: PIXIFOUND-015

---

## Objective

Create the React component that mounts the PixiJS application, initializes the full canvas pipeline (layers, viewport, renderers, subscriptions, interactions, coordinate bridge), and performs ordered teardown on unmount.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/GameCanvas.tsx` — React component

### New test files
- `packages/runner/test/canvas/GameCanvas.test.tsx`

---

## Out of Scope

- Do NOT implement any DOM UI panels (action toolbar, variables panel, etc.) — that is Spec 39.
- Do NOT implement animations or GSAP — that is Spec 40.
- Do NOT implement the graph-based layout engine — that is Spec 41.
- Do NOT wire GameCanvas into `App.tsx` or routing — integration with the full app is a separate concern.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify any previously created PIXIFOUND source files.

---

## Implementation Details

### Component

```tsx
export interface GameCanvasProps {
  readonly store: StoreApi<GameStore>;
}

export function GameCanvas({ store }: GameCanvasProps): JSX.Element;
```

### Mount sequence

1. Create a `<div>` ref for the canvas container with `role="application"` and `aria-label="Game board"`.
2. On mount (via `useEffect`):
   a. `createGameCanvas(containerDiv)` — PixiJS Application + layers (PIXIFOUND-005).
   b. `setupViewport(...)` — pixi-viewport wrapping layers (PIXIFOUND-006).
   c. Create renderers: `createZoneRenderer()`, `createAdjacencyRenderer()`, `createTokenRenderer()` (PIXIFOUND-008/009/010).
   d. Compute initial grid layout from store's zone IDs, write to position store (PIXIFOUND-004).
   e. `createCanvasUpdater(...)` and call `start()` (PIXIFOUND-011).
   f. Attach zone/token select handlers to renderer containers (PIXIFOUND-012).
   g. `createCoordinateBridge(...)` (PIXIFOUND-013).

### Teardown ordering (critical)

On unmount, cleanup must happen in this exact order:
1. Unsubscribe all Zustand subscriptions (canvas-updater `destroy()`).
2. Detach interaction handlers (zone/token select cleanup functions).
3. Call `destroy()` on all renderers (releases PixiJS containers, graphics, textures).
4. Destroy viewport.
5. Call `app.destroy(true, { children: true, texture: true })` last.

Misordering causes callbacks against destroyed objects or WebGL errors.

### Coordinate bridge exposure

Expose coordinate bridge via a ref or context for Spec 39's DOM overlays to consume.

---

## Acceptance Criteria

### Tests that must pass

**`GameCanvas.test.tsx`** (Vitest + @testing-library/react, mock PixiJS):
- Component renders a `<div>` with `role="application"` and `aria-label="Game board"`.
- On mount: `createGameCanvas` is called with the container div.
- On mount: `setupViewport` is called.
- On mount: all three renderer factories are called.
- On mount: `createCanvasUpdater` is called and `start()` is invoked.
- On unmount: canvas-updater `destroy()` is called BEFORE renderer `destroy()` calls.
- On unmount: renderer `destroy()` calls happen BEFORE `app.destroy()`.
- On unmount: `app.destroy(true, { children: true, texture: true })` is called last.
- No console errors during mount or unmount.
- Remounting (unmount then mount) does not leak subscriptions.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Teardown order: subscriptions → interactions → renderers → viewport → app. Always.
- Canvas container has `role="application"` and `aria-label` for accessibility.
- No game-specific logic in the component.
- All PixiJS resources are fully cleaned up on unmount (no WebGL leaks).

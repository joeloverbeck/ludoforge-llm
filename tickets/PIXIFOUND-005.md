# PIXIFOUND-005: PixiJS Application Creation and Layered Container Hierarchy

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D1 + D2
**Priority**: P0
**Depends on**: PIXIFOUND-001
**Blocks**: PIXIFOUND-006, PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-010, PIXIFOUND-014

---

## Objective

Create the PixiJS v8 Application with explicit WebGL renderer and the 6-layer container hierarchy (BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup inside viewport; HUDGroup outside viewport on stage). Export a factory function for use by the React mount component.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/create-app.ts` — `createGameCanvas()` factory function
- `packages/runner/src/canvas/layers.ts` — `createLayerHierarchy()` returning named layer references

### New test files
- `packages/runner/test/canvas/create-app.test.ts`
- `packages/runner/test/canvas/layers.test.ts`

---

## Out of Scope

- Do NOT set up pixi-viewport — that is PIXIFOUND-006.
- Do NOT implement any renderers (zone, token, adjacency).
- Do NOT create the React mount component `GameCanvas.tsx` — that is PIXIFOUND-014.
- Do NOT implement resize handling beyond what PixiJS provides natively with `autoDensity`.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).

---

## Implementation Details

### create-app.ts

```typescript
export interface GameCanvas {
  readonly app: Application;
  readonly layers: LayerHierarchy;
  destroy(): void;
}

export async function createGameCanvas(container: HTMLElement): Promise<GameCanvas>;
```

- Create Application with `preference: 'webgl'` (explicit WebGL, not WebGPU).
- Config: `antialias: true`, `resolution: window.devicePixelRatio`, `autoDensity: true`, `backgroundColor: '#1a1a2e'` (dark theme default).
- Attach `app.canvas` to the container element.
- Resize: `app.resizeTo = container` (PixiJS v8 built-in resize).

### layers.ts

```typescript
export interface LayerHierarchy {
  readonly boardGroup: Container;      // eventMode: 'static'
  readonly adjacencyLayer: Container;  // child of boardGroup
  readonly zoneLayer: Container;       // child of boardGroup
  readonly tokenGroup: Container;      // eventMode: 'static'
  readonly effectsGroup: Container;    // eventMode: 'none'
  readonly interfaceGroup: Container;  // eventMode: 'none'
  readonly hudGroup: Container;        // outside viewport, on stage
}

export function createLayerHierarchy(stage: Container): LayerHierarchy;
```

- BoardGroup contains AdjacencyLayer (back) and ZoneLayer (front).
- Layer ordering: boardGroup → tokenGroup → effectsGroup → interfaceGroup (all added to a parent that will become the viewport content in PIXIFOUND-006).
- HUDGroup added directly to stage (stays fixed during pan/zoom).
- Set `sortableChildren` and `interactiveChildren` as appropriate.

---

## Acceptance Criteria

### Tests that must pass

**`create-app.test.ts`** (mock PixiJS Application):
- Factory returns a `GameCanvas` object with `app` and `layers` properties.
- Application created with `preference: 'webgl'`.
- `antialias`, `autoDensity` are enabled.
- `destroy()` calls `app.destroy(true, { children: true, texture: true })`.

**`layers.test.ts`** (mock PixiJS Container):
- `createLayerHierarchy()` returns all 7 named containers.
- `boardGroup.eventMode` is `'static'`.
- `tokenGroup.eventMode` is `'static'`.
- `effectsGroup.eventMode` is `'none'`.
- `interfaceGroup.eventMode` is `'none'`.
- `adjacencyLayer` is a child of `boardGroup`.
- `zoneLayer` is a child of `boardGroup`.
- `hudGroup` is added to the stage directly (not inside the viewport content group).
- Layer order: adjacencyLayer before zoneLayer within boardGroup.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- WebGL is explicitly requested (not auto-selected).
- HUDGroup is NOT part of the viewport content — it sits on the stage.
- No game-specific logic in any created file.

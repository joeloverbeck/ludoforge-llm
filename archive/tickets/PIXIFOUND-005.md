# PIXIFOUND-005: PixiJS Application Creation and Layered Container Hierarchy

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D1 + D2
**Priority**: P0
**Depends on**: PIXIFOUND-001
**Blocks**: PIXIFOUND-006, PIXIFOUND-008, PIXIFOUND-009, PIXIFOUND-010, PIXIFOUND-014

---

## Objective

Create the PixiJS v8 Application with explicit WebGL renderer and the 6-layer container hierarchy (BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup inside viewport; HUDGroup outside viewport on stage). Export a factory function for use by the React mount component.

---

## Reassessed Assumptions (Validated Against Codebase + Specs 35/38)

1. `packages/runner/src/canvas/create-app.ts` and `packages/runner/src/canvas/layers.ts` do not exist yet; this ticket remains required.
2. Pixi foundation prerequisites from earlier tickets exist and should be reused as-is:
   - `renderer-types.ts` (interfaces/contracts),
   - `container-pool.ts` / `faction-colors.ts` (shared renderer utilities),
   - `position-store.ts` (layout data source).
3. Runner tests execute in Vitest `node` environment (`packages/runner/vitest.config.ts`), so tests in this ticket should avoid requiring a full browser DOM runtime.
4. PixiJS v8 requires `await app.init(...)` for non-deprecated initialization, so `createGameCanvas(container)` should remain async and return `Promise<GameCanvas>`. This intentionally prefers long-term API stability over deprecated constructor usage.
5. Spec 38 D1 requires background color to come from theme inputs; this foundation ticket will keep a deterministic default and avoid hardcoding game-specific visuals.
6. The architecture target remains imperative and game-agnostic: this ticket must not introduce game-specific branches, runtime aliases, or compatibility shims.

---

## Scope

- Implement PixiJS app factory (`createGameCanvas`) with explicit WebGL and deterministic teardown semantics.
- Implement layer hierarchy factory (`createLayerHierarchy`) with stage/viewport separation that aligns with Spec 38 D2.
- Add focused tests for app creation/destruction and layer structure/order/event modes.

### Out of Scope (Confirmed)

- Do NOT set up pixi-viewport (PIXIFOUND-006).
- Do NOT implement renderers (zone/token/adjacency).
- Do NOT create `GameCanvas.tsx` (PIXIFOUND-014).
- Do NOT modify files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).

---

## Files to Touch

### New files
- `packages/runner/src/canvas/create-app.ts` — `createGameCanvas()` factory function
- `packages/runner/src/canvas/layers.ts` — `createLayerHierarchy()` returning named layer references

### New test files
- `packages/runner/test/canvas/create-app.test.ts`
- `packages/runner/test/canvas/layers.test.ts`

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
- Config: `antialias: true`, `resolution: window.devicePixelRatio`, `autoDensity: true`, and a deterministic default background value suitable for neutral canvas foundation work.
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
- Layer ordering within viewport content: boardGroup → tokenGroup → effectsGroup → interfaceGroup (PIXIFOUND-006 will mount these under pixi-viewport).
- HUDGroup added directly to stage (stays fixed during pan/zoom).
- Set `sortableChildren` and `interactiveChildren` as appropriate.

### Architectural Rationale

Compared to the current architecture (foundation utilities without app/layer wiring), implementing D1+D2 now is a net architectural improvement:

- It establishes a single authoritative app bootstrap/teardown path, preventing duplicated Pixi lifecycle logic across future tickets.
- It codifies the stage-vs-viewport boundary early (HUD outside viewport), which is critical for extensibility in Spec 40 overlays and Spec 39 DOM/canvas coordination.
- It keeps the foundation generic and strict: no per-game assumptions, no aliasing, and no compatibility wrappers.

---

## Acceptance Criteria

### Tests that must pass

**`create-app.test.ts`** (mock PixiJS Application in Node test env):
- Factory returns a `GameCanvas` object with `app` and `layers` properties.
- Application created with `preference: 'webgl'`.
- `antialias`, `autoDensity` are enabled.
- Factory awaits `app.init(...)` exactly once before returning.
- `app.resizeTo` is set to the provided container.
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
- Layer order on stage content: boardGroup → tokenGroup → effectsGroup → interfaceGroup.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- WebGL is explicitly requested (not auto-selected).
- HUDGroup is NOT part of the viewport content — it sits on the stage.
- No game-specific logic in any created file.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/create-app.ts` with async PixiJS app initialization (`app.init`), explicit WebGL preference, deterministic defaults, stage/layer wiring hook-up, and strict destroy semantics.
  - Added `packages/runner/src/canvas/layers.ts` with named layer creation and ordering, including board sublayers and HUD separation on stage.
  - Added `packages/runner/test/canvas/create-app.test.ts` covering app config, async init ordering, and destroy behavior.
  - Added `packages/runner/test/canvas/layers.test.ts` covering returned layer contracts, event modes, parent-child placement, and ordering invariants.
  - Corrected ticket assumptions/scope before implementation (Vitest node environment, async app init requirement in Pixi v8, and layer-order responsibilities).
- **Deviation from original plan**:
  - Preserved async `createGameCanvas` because PixiJS v8 non-deprecated initialization requires `await app.init(...)`.
  - Kept a deterministic neutral default background in this foundation ticket instead of introducing theme plumbing prematurely.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (17 files, 135 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

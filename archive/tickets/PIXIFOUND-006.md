# PIXIFOUND-006: pixi-viewport Integration

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D3
**Priority**: P0
**Depends on**: PIXIFOUND-005
**Blocks**: PIXIFOUND-011, PIXIFOUND-013, PIXIFOUND-014

---

## Objective

Wrap BoardGroup, TokenGroup, EffectsGroup, and InterfaceGroup inside a pixi-viewport `Viewport` for pan/zoom functionality. HUDGroup remains outside the viewport. Enable drag, pinch, wheel zoom, and clamp-zoom with board bounds.

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. PIXIFOUND-005 is already completed and archived at `archive/tickets/PIXIFOUND-005.md`, and it created:
   - `packages/runner/src/canvas/create-app.ts`
   - `packages/runner/src/canvas/layers.ts`
   The current architecture mounts all layer groups on `stage`, so this ticket must explicitly reparent world layers into a viewport.
2. The previous API draft is under-specified for real integration: to satisfy the objective, viewport setup must receive `stage` and `layers`, not just viewport dimensions/events.
3. The previous scope had an internal contradiction:
   - It said to use static bounds only for now.
   - It also required `updateWorldBounds()` to support runtime clamp updates.
   This ticket now treats `updateWorldBounds()` as in-scope and required.
4. pixi-viewport v6 with PixiJS v8 requires explicit `events` wiring (`app.renderer.events`) and should not rely on auto-detection.
5. For clean architecture, this ticket should establish a single authoritative ownership model:
   - `stage` owns `viewport` + `hudGroup`.
   - `viewport` owns `boardGroup`, `tokenGroup`, `effectsGroup`, `interfaceGroup`.
   No aliases, no parallel ownership paths.

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
- Do NOT wire position store subscriptions — PIXIFOUND-011 will call `updateWorldBounds()` when positions change.
- Do NOT derive bounds from live zone geometry in this ticket; consume bounds passed to `updateWorldBounds()` by upstream wiring.

---

## Implementation Details

```typescript
export interface ViewportConfig {
  readonly stage: Container;
  readonly layers: Pick<LayerHierarchy, 'boardGroup' | 'tokenGroup' | 'effectsGroup' | 'interfaceGroup' | 'hudGroup'>;
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
  readonly worldLayers: readonly Container[];
  updateWorldBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void;
  destroy(): void;
}

export function setupViewport(config: ViewportConfig): ViewportResult;
```

- Create `Viewport` from `pixi-viewport`, passing `options.events` (required for v6 + PixiJS v8).
- Add BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup as children of the viewport (reparenting from stage).
- Ensure `stage` contains `viewport` and `hudGroup` after setup.
- Enable plugins: `.drag()`, `.pinch()`, `.wheel()`, `.clampZoom({ minScale, maxScale })`.
- `updateWorldBounds()` applies board edge clamping (`viewport.clamp({ left, top, right, bottom })`) from provided bounds.
- `destroy()` removes viewport plugins, detaches world layers from viewport, and removes viewport from parent.

### Architectural Rationale

Compared to the current stage-only layer placement from PIXIFOUND-005, this change is structurally beneficial:
- It creates a strict scene-graph boundary between world-space and screen-space content.
- It keeps HUD fixed without special-case transform logic.
- It enables future coordinate conversion (PIXIFOUND-013) and animation/updater wiring (PIXIFOUND-011/014) against a stable viewport contract.
- It reduces long-term complexity by avoiding dual transform responsibilities across multiple modules.

---

## Acceptance Criteria

### Tests that must pass

**`viewport-setup.test.ts`** (mock pixi-viewport Viewport):
- `setupViewport()` returns a `ViewportResult` with `viewport`, `updateWorldBounds`, and `destroy`.
- Viewport is created with `events` from config (not auto-detected).
- Drag, pinch, wheel, and clampZoom plugins are enabled.
- `updateWorldBounds()` updates board-edge clamp parameters.
- HUDGroup remains on stage, outside viewport.
- BoardGroup, TokenGroup, EffectsGroup, InterfaceGroup are children of viewport.
- `destroy()` removes viewport plugins, detaches viewport from stage, and detaches world layers from viewport.
- HUDGroup from layers is NOT a child of the viewport.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- `options.events` is explicitly passed (pixi-viewport v6 requirement).
- HUDGroup remains outside the viewport (fixed to screen).
- Zoom is clamped between configured min/max scale.
- World bounds clamping is controlled through `updateWorldBounds()` and does not require viewport recreation.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/viewport-setup.ts` with:
    - explicit `Viewport` construction using passed `events`,
    - plugin setup (`drag`, `pinch`, `wheel`, `clampZoom`),
    - deterministic reparenting of world layers into viewport,
    - stable stage ownership (`stage` holds `viewport` + `hudGroup`),
    - `updateWorldBounds()`-driven clamp updates,
    - deterministic cleanup (`plugins.removeAll`, layer detach, viewport removal/destruction).
  - Added `packages/runner/test/canvas/viewport-setup.test.ts` covering constructor config, layer ownership, bounds clamping, and teardown behavior.
  - Corrected ticket assumptions/scope before implementation to match the current codebase and remove contradictory bounds requirements.
- **Deviations from original plan**:
  - API was expanded to include `stage` and `layers`, because the previous signature could not satisfy required reparenting and HUD ownership assertions.
  - Added explicit invariant checks for invalid scale/bounds input to harden the contract.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

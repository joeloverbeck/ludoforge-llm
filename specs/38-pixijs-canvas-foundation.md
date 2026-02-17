# Spec 38: PixiJS Canvas Foundation

**Status**: ACTIVE
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 37 (State Management & Render Model)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 2-4

---

## Objective

Set up the PixiJS v8 canvas with layered container hierarchy, pixi-viewport for pan/zoom, and imperative state-driven rendering from the Zustand store's RenderModel. The canvas renders zones (with mapSpace overlays and markers), tokens, adjacency connections, and handles basic click-to-select interaction for both zones and tokens.

**Success criteria**: Any compiled game's board renders with zones, tokens, mapSpace overlays, zone markers, and adjacency connections. User can pan/zoom the board, click zones or tokens to select them, and canvas updates are gated during animations.

---

## Constraints

- Use **WebGL explicitly** -- do not rely on PixiJS automatic backend selection (WebGPU not production-ready).
- Canvas updates are **imperative** via Zustand `subscribe()`, not via React reconciler. The @pixi/react integration is used only for mounting/unmounting the PixiJS Application, not for per-frame updates.
- The canvas must be game-agnostic. Zone shapes, token sprites, and adjacency lines come from the RenderModel, not from game-specific code.
- Default rendering (no visual config): zones as labeled rectangles, tokens as colored circles with type labels, adjacency as straight lines.
- **Canvas/DOM split**: Canvas owns spatial board content (zones, tokens, adjacency, mapSpace overlays, zone markers). DOM owns UI panels/widgets (Spec 39).

---

## Dependency Versions

| Package | Version | Notes |
|---|---|---|
| `pixi.js` | `^8.2.0` | Stable WebGL backend selection |
| `pixi-viewport` | `^6.0.1` | PixiJS v8 compatible, pass `options.events` |
| `@pixi/react` | `^8.0.0` | React 19 + PixiJS v8 ground-up rewrite |

Exact versions verified at implementation time and locked in `pnpm-lock.yaml`.

---

## Architecture

### Layered Container Hierarchy

```
PixiJS Application (stage)
├── Viewport (pixi-viewport)
│   ├── BoardGroup (Container, eventMode: 'static')
│   │   ├── AdjacencyLayer      <- per-pair Graphics objects (not single Graphics)
│   │   └── ZoneLayer           <- zone containers with mapSpace overlays + markers
│   ├── TokenGroup (Container, eventMode: 'static')  <- all tokens (board + card)
│   ├── EffectsGroup (Container, eventMode: 'none')   <- highlights, auras
│   └── InterfaceGroup (Container, eventMode: 'none') <- selection ring, move previews, drag ghost
└── HUDGroup (Container, outside viewport, fixed)     <- phase banners, loading, canvas-level overlays
```

**Key design decisions**:
- **HUDGroup** sits outside the viewport (doesn't pan/zoom). Home for Spec 40 phase banners and canvas-level overlays.
- **AdjacencyLayer** uses per-pair Graphics objects (not a single Graphics cleared each update) to enable incremental adjacency updates.
- Layers are rendered in order (board at back, interface at front).

### Rendering Pipeline

```
Zustand Store (RenderModel changes)           Position Store (zone positions)
    |                                               |
    | subscribe() with custom equality              | subscribe()
    v                                               v
Canvas Updater (canvas-updater.ts) --- merges both inputs --->
    |
    +-- updateZones(zones, mapSpaces, positions) -> ZoneLayer containers
    +-- updateAdjacency(adj, positions)          -> AdjacencyLayer per-pair Graphics
    +-- updateTokens(tokens, zoneContainers)     -> TokenGroup sprites
    +-- updateHighlights(...)                    -> EffectsGroup graphics
    +-- updateSelection(...)                     -> InterfaceGroup graphics
```

Canvas-updater subscribes to both RenderModel changes AND position changes; only re-renders zones when both are available.

### RenderModel Coverage Table

| RenderModel Field | Rendered By | Notes |
|---|---|---|
| `zones` | Canvas (D4) | Zone shapes, labels, selection state |
| `adjacencies` | Canvas (D5) | Lines between zones |
| `mapSpaces` | Canvas (D4) | Overlays on zone shapes: pop, econ, terrain, coastal |
| `tokens` | Canvas (D6) | Colored circles with type labels |
| Zone `markers` | Canvas (D4) | State labels on zone shapes |
| `globalVars` | DOM (Spec 39) | Variables panel |
| `playerVars` | DOM (Spec 39) | Per-player variables panel |
| `globalMarkers` | DOM (Spec 39) | Global game state indicators |
| `tracks` | DOM (Spec 39) | Progress bar widgets |
| `activeEffects` | DOM (Spec 39) | Active effects list |
| `players` | DOM (Spec 39) | Player info panel |
| `activePlayerID` | DOM (Spec 39) | Active player highlight |
| `turnOrder` | DOM (Spec 39) | Turn order display |
| `phaseName` / `phaseDisplayName` | DOM (Spec 39) | Phase indicator |
| `eventDecks` | DOM (Spec 39) | Deck info panel |
| `actionGroups` | DOM (Spec 39) | Action toolbar |
| `choiceBreadcrumb` | DOM (Spec 39) | Choice progress indicator |
| `currentChoiceOptions` | DOM (Spec 39) | Choice option buttons |
| `currentChoiceDomain` | DOM (Spec 39) | Numeric slider/input |
| `terminal` | DOM (Spec 39) | Game end screen |

---

## Deliverables

### D1: PixiJS Application Setup

`packages/runner/src/canvas/create-app.ts`

- Create PixiJS v8 Application with explicit WebGL renderer.
- Configure: `antialias: true`, `resolution: window.devicePixelRatio`, `autoDensity: true`, `backgroundColor` from theme.
- Resize handler: canvas fills its container element, re-renders on resize.
- Export a `createGameCanvas(container: HTMLElement): GameCanvas` factory function.

### D2: Layered Container Hierarchy

`packages/runner/src/canvas/layers.ts`

Create the 6-layer container group structure described in Architecture:

- **BoardGroup** (`Container`, `eventMode: 'static'`): receives pointer events, contains AdjacencyLayer and ZoneLayer.
  - **AdjacencyLayer** (`Container`): holds per-pair Graphics objects for adjacency lines.
  - **ZoneLayer** (`Container`): holds per-zone Container instances with mapSpace overlays and markers.
- **TokenGroup** (`Container`, `eventMode: 'static'`): receives pointer events for token selection (D13).
- **EffectsGroup** (`Container`, `eventMode: 'none'`): visual only, no events. Highlights, auras.
- **InterfaceGroup** (`Container`, `eventMode: 'none'`): visual only, events pass through. Selection ring, move previews, drag ghost.
- **HUDGroup** (`Container`, added to `stage` directly, not inside viewport): fixed-position overlays that don't pan/zoom. Home for Spec 40 phase banners and loading indicators.

Each group has appropriate `sortableChildren` and `interactiveChildren` settings.

### D3: pixi-viewport Integration

`packages/runner/src/canvas/viewport-setup.ts`

- Wrap BoardGroup, TokenGroup, EffectsGroup, and InterfaceGroup inside a pixi-viewport `Viewport`.
- HUDGroup is NOT inside the viewport (fixed to screen).
- Enable: drag (pan), pinch (zoom), wheel (zoom), clamp-zoom (min/max bounds).
- Clamp viewport to board bounds (computed from zone positions + margin).
- Pass `options.events` from `app.renderer.events` (required for pixi-viewport v6 with PixiJS v8).
- Export viewport reference for coordinate conversion.

### D4: Zone Rendering

`packages/runner/src/canvas/renderers/zone-renderer.ts`

Implements the `ZoneRenderer` interface from D11.

Renders `RenderZone[]` as visual elements with incremental updates:

**Default appearance** (no visual config):
- Rectangle with rounded corners, filled with a muted color based on zone type.
- Zone name as BitmapText label centered in the zone.
- Token count badge (small circle with number) when zone contains tokens.
- Visual states: normal, selectable (subtle glow border), highlighted (bright border), selected (thick bright border).

**MapSpace overlay rendering**: When a zone has a corresponding `RenderMapSpace` (matched by ID), render overlays as part of the zone Container (not separate sprites):
- Population badge (small number in top-left corner).
- Econ badge (small number in top-right corner).
- Terrain tag indicator (colored dot or abbreviated label).
- Coastal indicator (wave-style border).

**Zone marker rendering**: Render `RenderMarker[]` on each zone as small state labels below the zone name.

**Incremental diff via object pooling** (Issue #2):
- `Map<string, Container>` is the diff source. On each `update()`:
  - New zone IDs: create Container and add to map (or retrieve from `ContainerPool`).
  - Removed zone IDs: remove Container from parent, return to `ContainerPool`, delete from map.
  - Existing IDs: update properties in place (position, color, label text, selection state, marker text, mapSpace badges).
- `ContainerPool` pre-allocates reusable Container instances.

**Interface**:
- `update(zones: readonly RenderZone[], mapSpaces: readonly RenderMapSpace[], positions: ReadonlyMap<string, Position>): void`
- `getContainerMap(): ReadonlyMap<string, Container>` -- for coordinate bridge, animation (Spec 40), and token positioning.
- `destroy(): void` -- returns pooled objects, removes event listeners, nulls references.

### D5: Adjacency Connection Rendering

`packages/runner/src/canvas/renderers/adjacency-renderer.ts`

Implements the `AdjacencyRenderer` interface from D11.

Renders `RenderAdjacency[]` as lines between zone centers using **per-pair Graphics objects**:

- `Map<string, Graphics>` keyed by sorted pair `${from}:${to}`.
- On update: add new pairs (create Graphics), remove old pairs (destroy Graphics), update highlight state on existing pairs.
- No `graphics.clear()` + full redraw -- incremental updates only.
- Default line style: semi-transparent, thin, muted color.
- Highlighted state: thicker, brighter when showing valid movement paths.

**Interface**:
- `update(adjacencies: readonly RenderAdjacency[], positions: ReadonlyMap<string, Position>): void`
- `destroy(): void`

### D6: Token Rendering

`packages/runner/src/canvas/renderers/token-renderer.ts`

Implements the `TokenRenderer` interface from D11.

Renders `RenderToken[]` as visual elements within their parent zones with incremental updates:

**Default appearance** (no visual config):
- Colored circle with token type label (BitmapText).
- Color derived from owner/faction via `FactionColorProvider` (D11).
- Face-down tokens: show a "?" or card back visual instead of type label.
- Visual states: normal, selectable (glow), selected (bright border + elevation shadow).

**Incremental diff**:
- Same pattern as zones: diff by token ID. Create/remove/update in place.
- Container references are stable across updates -- Spec 40 GSAP timelines can hold them.

**Interface**:
- `update(tokens: readonly RenderToken[], zoneContainers: ReadonlyMap<string, Container>): void`
- `getContainerMap(): ReadonlyMap<string, Container>` -- for Spec 40 animation references.
- `destroy(): void`

### D7: Zustand Subscription Wiring

`packages/runner/src/canvas/canvas-updater.ts`

Subscribe to specific RenderModel slices and call renderer update functions. Uses **custom equality comparators** instead of shallow equality:

```typescript
function zonesVisuallyEqual(
  prev: readonly RenderZone[],
  next: readonly RenderZone[]
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i], n = next[i];
    if (p.id !== n.id || p.isSelectable !== n.isSelectable
        || p.isHighlighted !== n.isHighlighted
        || p.hiddenTokenCount !== n.hiddenTokenCount
        || !arraysEqual(p.tokenIDs, n.tokenIDs)
        || !markersEqual(p.markers, n.markers)) return false;
  }
  return true;
}
```

Similar comparators for tokens (`tokensVisuallyEqual`) and adjacencies (`adjacenciesVisuallyEqual`).

**Animation gating**: When `store.animationPlaying === true`, canvas subscriptions queue incoming RenderModel snapshots but do NOT apply them. When `animationPlaying` transitions to `false`, apply the latest queued snapshot as a single batch. This prevents state updates from snapping animated tokens to final positions mid-animation.

Canvas-updater subscribes to both RenderModel changes AND position store (D12) changes; only re-renders zones when both are available.

### D8: Zone Click-to-Select Interaction

`packages/runner/src/canvas/interactions/zone-select.ts`

Zones with `isSelectable: true` respond to pointer events with **click/drag intent detection**:

- `pointerdown`: record pointer position.
- `pointermove`: if distance > 5px threshold, set `dragIntent = true`.
- `pointerup`: if `!dragIntent && zone.isSelectable`, dispatch selection via `SelectionDispatcher` (D13).

This intent detection is a no-op stub for drag-and-drop -- costs nothing now, prevents breaking refactor later.

Visual feedback: hover highlights selectable zones. Uses PixiJS FederatedEvents (`pointerdown`, `pointermove`, `pointerup`, `pointerover`, `pointerout`).

### D9: Coordinate Bridge

`packages/runner/src/canvas/coordinate-bridge.ts`

Converts between canvas world-space and DOM screen-space:

```typescript
export interface CoordinateBridge {
  canvasToScreen(worldPos: Position): Position;
  screenToCanvas(screenPos: Position): Position;
  worldBoundsToScreenRect(worldBounds: {
    x: number; y: number; width: number; height: number;
  }): DOMRect;
}
```

- `canvasToScreen` / `screenToCanvas`: Uses `viewport.toGlobal()` / `viewport.toLocal()` and canvas element's `getBoundingClientRect()`.
- `worldBoundsToScreenRect`: Applies viewport transform + canvas element offset. Zone renderers expose world-space bounds via `Container.getBounds()`.
- Required for Floating UI tooltip positioning (Spec 39).

### D10: React Mount Component

`packages/runner/src/canvas/GameCanvas.tsx`

React component that:
- Creates a `<div>` ref for the canvas container with `role="application"` and `aria-label="Game board"`.
- On mount: initializes PixiJS application, viewport, layers, renderers, subscriptions.
- On unmount: performs ordered teardown (see below).
- Exposes coordinate bridge for DOM overlay positioning.

**Teardown ordering** (critical for clean destruction):
1. Unsubscribe all Zustand subscriptions (prevents callbacks against destroyed objects).
2. Call `destroy()` on all renderers (releases PixiJS resources: containers, graphics, textures). Each renderer's `destroy()` method must: return pooled objects, remove all event listeners, null out internal references.
3. Call `app.destroy(true, { children: true, texture: true })` last.

### D11: Renderer Interfaces & Types

`packages/runner/src/canvas/renderers/renderer-types.ts`

Central type definitions and extension points for all canvas renderers:

```typescript
export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface ZoneRenderer {
  update(
    zones: readonly RenderZone[],
    mapSpaces: readonly RenderMapSpace[],
    positions: ReadonlyMap<string, Position>
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TokenRenderer {
  update(
    tokens: readonly RenderToken[],
    zoneContainers: ReadonlyMap<string, Container>
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface AdjacencyRenderer {
  update(
    adjacencies: readonly RenderAdjacency[],
    positions: ReadonlyMap<string, Position>
  ): void;
  destroy(): void;
}

export interface FactionColorProvider {
  getColor(factionId: string | null, playerIndex: number): string;
}
```

**DefaultFactionColorProvider** (`packages/runner/src/canvas/renderers/faction-colors.ts`):
```typescript
export class DefaultFactionColorProvider implements FactionColorProvider {
  private readonly palette = [
    '#e63946', '#457b9d', '#2a9d8f', '#e9c46a',
    '#6a4c93', '#1982c4', '#ff595e', '#8ac926'
  ];
  getColor(factionId: string | null, playerIndex: number): string {
    // Deterministic: sort factionIds, assign palette by index
  }
}
```

Spec 42 provides a `VisualConfigFactionColorProvider` reading from visual-config.yaml, replacing this default.

**ContainerPool** utility for object reuse across zone and token renderers.

### D12: Position Store

`packages/runner/src/canvas/position-store.ts`

Decouples zone positioning from rendering:

```typescript
export interface ZonePositionMap {
  readonly positions: ReadonlyMap<string, Position>;
  readonly bounds: {
    minX: number; minY: number;
    maxX: number; maxY: number;
  };
}
```

- Spec 38's placeholder grid layout writes to this store.
- Spec 41's ForceAtlas2 replaces the grid layout writer.
- Canvas renderers (D4, D5) and Spec 40 animation system read from it.
- Stored as a module-level reactive ref (Zustand atom or simple EventTarget).
- Canvas-updater (D7) subscribes to both RenderModel changes AND position changes.

**Placeholder grid layout**: Zones arranged in a grid based on array index. Cell size proportional to `sqrt(zoneCount)`, with margin. Produces non-overlapping positions for all zones.

### D13: Token Click-to-Select & Selection Dispatcher

`packages/runner/src/canvas/interactions/token-select.ts`
`packages/runner/src/canvas/interactions/selection-dispatcher.ts`

**Token selection**:
- Token containers with `isSelectable: true` respond to pointer events.
- Token clicks use the same click/drag intent-detection pattern as zone clicks (D8).
- Token click events call `stopPropagation()` to prevent bubbling to parent zone.

**Unified SelectionDispatcher**:
```typescript
export function dispatchCanvasSelection(
  store: GameStore,
  target: { type: 'zone'; id: string } | { type: 'token'; id: string }
): void;
```
Receives both zone and token selection events and dispatches the appropriate store action (`chooseOne` with the selected value).

### D14: Testing Strategy

Tests go in `packages/runner/test/canvas/`.

**Unit tests** (no WebGL required -- pure logic):
- `coordinate-bridge.test.ts` -- pure math, mock viewport transforms.
- `position-store.test.ts` -- grid layout produces valid non-overlapping positions.
- `faction-colors.test.ts` -- deterministic palette assignment, stable across calls.
- `canvas-equality.test.ts` -- custom comparators return correct true/false for edge cases.

**Unit tests with mocked PixiJS** (mock Container, Graphics):
- `zone-renderer.test.ts` -- container map grows/shrinks with zone IDs, properties update in place, mapSpace overlays rendered, markers rendered.
- `token-renderer.test.ts` -- stable container references across updates, faction colors applied.
- `adjacency-renderer.test.ts` -- per-pair Graphics lifecycle (create/remove/update).
- `selection-dispatcher.test.ts` -- correct store actions dispatched for zone and token selections.

**Integration test**:
- `canvas-updater.test.ts` -- synthetic RenderModel fixture -> full updater pipeline -> assert container map state, animation gating behavior.

**React component test** (Vitest + @testing-library/react):
- `GameCanvas.test.tsx` -- mount/unmount lifecycle, cleanup ordering verification (subscriptions removed before renderers destroyed before app destroyed).

---

## Accessibility

- Canvas container div: `role="application"`, `aria-label="Game board"`.
- **Keyboard zone selection**: When a zone choice is pending, arrow keys cycle focus through selectable zones, Enter/Space confirms. Implemented via a `document` keydown listener that reads selectable zone IDs from the RenderModel.
- **Screen reader announcements**: `aria-live="polite"` region announces zone/token selection changes.

---

## Default Layout (Placeholder)

Until Spec 41 (Board Layout Engine) is implemented, use the placeholder grid layout from the Position Store (D12):
- Zones arranged in a grid based on their index in the zones array.
- Grid cell size proportional to `sqrt(zoneCount)`, with margin.
- This is a temporary measure to make the canvas functional before graph layout is available.
- Spec 41 replaces this grid writer with a ForceAtlas2-based layout.

---

## Cross-Spec References

| Spec | Relationship |
|---|---|
| **Spec 37** (State Management) | Provides RenderModel types consumed by all renderers |
| **Spec 39** (React DOM UI) | Owns all DOM-rendered RenderModel fields (see coverage table) |
| **Spec 40** (Animation) | Uses stable container references from `getContainerMap()`, animation gating via `animationPlaying`, HUDGroup for phase banners |
| **Spec 41** (Board Layout) | Replaces placeholder grid layout in Position Store (D12) with ForceAtlas2 |
| **Spec 42** (Visual Config) | Provides `VisualConfigFactionColorProvider` replacing `DefaultFactionColorProvider`, custom zone/token renderers via renderer interfaces (D11) |

---

## Verification

- [ ] Canvas renders zones from a compiled Texas Hold'em GameDef
- [ ] Canvas renders zones from a compiled FITL GameDef
- [ ] Tokens appear in their respective zones with type labels and faction colors
- [ ] MapSpace overlays (pop, econ, terrain, coastal) render on applicable zones
- [ ] Zone markers render as state labels below zone names
- [ ] Adjacency lines connect adjacent zones (per-pair Graphics, not single Graphics)
- [ ] Pan (drag) and zoom (wheel) work with clamped bounds
- [ ] HUDGroup remains fixed during pan/zoom
- [ ] Clicking a selectable zone triggers a store action (with click/drag intent detection)
- [ ] Clicking a selectable token triggers a store action (without bubbling to zone)
- [ ] Hovering over selectable zones/tokens shows visual feedback
- [ ] Canvas resizes correctly when window resizes
- [ ] Coordinate bridge accurately converts positions and bounding rects for tooltip placement
- [ ] Animation gating: state updates queue during animations, apply on completion
- [ ] Keyboard zone selection works (arrow keys + Enter/Space)
- [ ] Screen reader announces selection changes
- [ ] Teardown ordering: subscriptions -> renderers -> app (no console errors on unmount)
- [ ] No console errors or WebGL warnings
- [ ] All D14 tests pass

---

## Out of Scope

- Graph-based auto-layout (Spec 41)
- Animations and GSAP timelines (Spec 40)
- Drag-and-drop move execution (future enhancement; click/drag detection in D8/D13 is a no-op stub only)
- Card face rendering (Spec 42 visual config)
- Per-game visual styling and custom renderers (Spec 42)
- Touch input support beyond basic pointer events

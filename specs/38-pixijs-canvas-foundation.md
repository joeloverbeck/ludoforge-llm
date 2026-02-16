# Spec 38: PixiJS Canvas Foundation

**Status**: ACTIVE
**Priority**: P0 (critical path)
**Complexity**: L
**Dependencies**: Spec 37 (State Management & Render Model)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 2–4

---

## Objective

Set up the PixiJS v8 canvas with layered container hierarchy, pixi-viewport for pan/zoom, and imperative state-driven rendering from the Zustand store's RenderModel. The canvas renders zones, tokens, adjacency connections, and handles basic click-to-select interaction.

**Success criteria**: Any compiled game's board renders with zones, tokens, and adjacency connections. User can pan/zoom the board and click zones to select them.

---

## Constraints

- Use **WebGL explicitly** — do not rely on PixiJS automatic backend selection (WebGPU not production-ready).
- Canvas updates are **imperative** via Zustand `subscribe()`, not via React reconciler. The @pixi/react integration is used only for mounting/unmounting the PixiJS Application, not for per-frame updates.
- The canvas must be game-agnostic. Zone shapes, token sprites, and adjacency lines come from the RenderModel, not from game-specific code.
- Default rendering (no visual config): zones as labeled rectangles, tokens as colored circles with type labels, adjacency as straight lines.

---

## Architecture

### Layered Container Hierarchy (Foundry VTT Pattern)

```
PixiJS Application
└── Viewport (pixi-viewport)
    ├── BoardGroup (Container)
    │   ├── AdjacencyLayer (Graphics)     ← Lines/curves between zones
    │   └── ZoneLayer (Container)          ← Zone sprites/shapes
    ├── TokenGroup (Container)             ← Game pieces, cards on board
    ├── EffectsGroup (Container)           ← Highlights, animations, particles
    └── InterfaceGroup (Container)         ← Selection indicators, move previews
```

Layers are rendered in order (board at back, interface at front). Each layer has appropriate `eventMode` settings.

### Rendering Pipeline

```
Zustand Store (RenderModel changes)
    |
    | subscribe() with selector
    v
Canvas Updater Functions
    |
    +── updateZones(zones)      → ZoneLayer sprites
    +── updateAdjacency(adj)    → AdjacencyLayer graphics
    +── updateTokens(tokens)    → TokenGroup sprites
    +── updateHighlights(...)   → EffectsGroup graphics
    +── updateSelection(...)    → InterfaceGroup graphics
```

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

- Create the container group structure described in Architecture.
- Each group is a `Container` with appropriate `sortableChildren`, `interactiveChildren`, and `eventMode` settings.
- BoardGroup and TokenGroup: `eventMode: 'static'` (receive events).
- EffectsGroup: `eventMode: 'none'` (no events, visual only).
- InterfaceGroup: `eventMode: 'none'` (visual only, events go through to lower layers).

### D3: pixi-viewport Integration

`packages/runner/src/canvas/viewport-setup.ts`

- Wrap the layered hierarchy in a pixi-viewport `Viewport`.
- Enable: drag (pan), pinch (zoom), wheel (zoom), clamp-zoom (min/max bounds).
- Clamp viewport to board bounds (computed from zone positions + margin).
- Pass `options.events` from `app.renderer.events` (v6 breaking change from pixi-viewport v5).
- Export viewport reference for coordinate conversion.

### D4: Zone Rendering

`packages/runner/src/canvas/renderers/zone-renderer.ts`

Renders RenderZone[] as visual elements:

**Default appearance** (no visual config):
- Rectangle with rounded corners, filled with a muted color based on zone type.
- Zone name as BitmapText label centered in the zone.
- Token count badge (small circle with number) when zone contains tokens.
- Visual states: normal, selectable (subtle glow border), highlighted (bright border), selected (thick bright border).

**Responsibilities**:
- Create/update/remove zone sprites when RenderModel zones change.
- Maintain a `Map<string, Container>` of zone ID to zone container for efficient updates.
- Position zones according to a position map (provided by Board Layout Engine in Spec 41; default: simple grid layout as placeholder).

### D5: Adjacency Connection Rendering

`packages/runner/src/canvas/renderers/adjacency-renderer.ts`

Renders RenderAdjacency[] as lines between zone centers:

- Straight lines by default (Graphics draw calls).
- Line style: semi-transparent, thin, muted color.
- Highlighted state: thicker, brighter when showing valid movement paths.
- Redrawn when zone positions change (e.g., after layout computation).

### D6: Token Rendering

`packages/runner/src/canvas/renderers/token-renderer.ts`

Renders RenderToken[] as visual elements within their parent zones:

**Default appearance** (no visual config):
- Colored circle with token type label (BitmapText).
- Color derived from owner/faction (from RenderPlayer.factionColor) or a default palette.
- Face-down tokens: show a "?" or card back visual instead of type label.
- Visual states: normal, selectable (glow), selected (bright border + elevation shadow).

**Responsibilities**:
- Create/update/remove token sprites when RenderModel tokens change.
- Position tokens within their zone container (stacking/layout handled by zone).
- Maintain a `Map<string, Container>` of token ID to token container.

### D7: Zustand Subscription Wiring

`packages/runner/src/canvas/canvas-updater.ts`

Subscribe to specific RenderModel slices and call renderer update functions:

```typescript
// Example subscription pattern
store.subscribe(
  (s) => s.renderModel?.zones,
  (zones) => zones && zoneRenderer.update(zones),
  { equalityFn: shallow }
);

store.subscribe(
  (s) => s.renderModel?.tokens,
  (tokens) => tokens && tokenRenderer.update(tokens),
  { equalityFn: shallow }
);
```

### D8: Zone Click-to-Select Interaction

`packages/runner/src/canvas/interactions/zone-select.ts`

- Zones with `isSelectable: true` respond to click events.
- Click dispatches a store action (e.g., `makeChoice({ type: 'zone', value: zoneId })`).
- Visual feedback: hover highlights selectable zones, click selects.
- Uses PixiJS FederatedEvents (`pointerdown`, `pointerover`, `pointerout`).

### D9: Coordinate Bridge

`packages/runner/src/canvas/coordinate-bridge.ts`

Converts between canvas world-space and DOM screen-space:

```typescript
function canvasToScreen(worldPos: { x: number; y: number }): { x: number; y: number };
function screenToCanvas(screenPos: { x: number; y: number }): { x: number; y: number };
```

Uses `viewport.toGlobal()` and canvas element's `getBoundingClientRect()`. Required for Floating UI tooltip positioning (Spec 39).

### D10: React Mount Component

`packages/runner/src/canvas/GameCanvas.tsx`

React component that:
- Creates a `<div>` ref for the canvas container.
- On mount: initializes PixiJS application, viewport, layers, renderers, subscriptions.
- On unmount: destroys PixiJS application, unsubscribes from store.
- Exposes coordinate bridge for DOM overlay positioning.

---

## Default Layout (Placeholder)

Until Spec 41 (Board Layout Engine) is implemented, use a simple grid layout:
- Zones arranged in a grid based on their index in the zones array.
- Grid cell size based on zone count (more zones = smaller cells).
- This is a temporary measure to make the canvas functional before graph layout is available.

---

## Verification

- [ ] Canvas renders zones from a compiled Texas Hold'em GameDef
- [ ] Canvas renders zones from a compiled FITL GameDef
- [ ] Tokens appear in their respective zones with type labels
- [ ] Adjacency lines connect adjacent zones
- [ ] Pan (drag) and zoom (wheel) work with clamped bounds
- [ ] Clicking a selectable zone triggers a store action
- [ ] Hovering over selectable zones shows visual feedback
- [ ] Canvas resizes correctly when window resizes
- [ ] Coordinate bridge accurately converts positions for tooltip placement
- [ ] No console errors or WebGL warnings

---

## Out of Scope

- Graph-based auto-layout (Spec 41)
- Animations (Spec 40)
- Drag-and-drop (future enhancement)
- Card face rendering (Spec 42 visual config)
- Per-game visual styling (Spec 42)
- Touch input support

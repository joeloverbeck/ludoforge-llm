# REACTUI-016: TooltipLayer

**Spec**: 39 (React DOM UI Layer) — Deliverable D19
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create the TooltipLayer that anchors DOM tooltips to canvas sprites using Floating UI with Virtual Elements. Uses the coordinate bridge from Spec 38 to convert PixiJS world coordinates to screen coordinates.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/TooltipLayer.tsx` | Floating UI tooltips anchored to canvas sprites |
| `packages/runner/src/ui/TooltipLayer.module.css` | Tooltip styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount TooltipLayer in the floating region |
| `packages/runner/package.json` | Add `@floating-ui/react-dom` dependency |

---

## Detailed Requirements

- **Dependency**: Install `@floating-ui/react-dom` (Floating UI for React).
- **Store data**: reads `renderModel.zones`, `renderModel.tokens`.
- **Canvas integration**: uses the coordinate bridge (`packages/runner/src/canvas/coordinate-bridge.ts`) to convert sprite world coordinates to screen coordinates.
- **Virtual Element pattern**:
  - Create a Floating UI virtual element whose `getBoundingClientRect()` returns the screen-space bounding rect of the hovered canvas sprite.
  - The coordinate bridge's `worldToScreen(x, y)` provides this conversion.
- **Tooltip triggers**:
  - Listens for hover events on the canvas (the canvas interaction controller emits selection/hover events).
  - When a zone or token is hovered, show a tooltip anchored to that sprite.
- **Tooltip content**:
  - Zone: `displayName`, token count, visibility, markers.
  - Token: `type`, `properties`, `ownerID`, `faceUp` status.
- **Collision avoidance**: use Floating UI middleware: `flip()`, `shift()`, `offset()`.
- **Dismissal**: tooltip hides when pointer leaves the sprite area or moves to another sprite.
- `pointer-events: auto` on the tooltip element itself (to allow text selection).

---

## Out of Scope

- Canvas sprite hover detection changes (Spec 38 already handles pointer events)
- Custom tooltip themes per game (Spec 42 visual config)
- Tooltip for DOM elements (only canvas sprites)
- Animation on tooltip show/hide (Spec 40)
- Mobile touch-and-hold tooltips

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/TooltipLayer.test.tsx` | Tooltip not visible when no sprite is hovered |
| `packages/runner/test/ui/TooltipLayer.test.tsx` | Tooltip shows zone details when a zone is hovered |
| `packages/runner/test/ui/TooltipLayer.test.tsx` | Tooltip shows token details when a token is hovered |
| `packages/runner/test/ui/TooltipLayer.test.tsx` | Tooltip repositions using Floating UI middleware |
| `packages/runner/test/ui/TooltipLayer.test.tsx` | Tooltip hides when hover ends |

### Invariants

- Uses **Zustand selectors** for RenderModel data.
- Uses the existing coordinate bridge from `canvas/coordinate-bridge.ts` — does NOT reimplement coordinate conversion.
- Floating UI is the ONLY positioning library used — no manual absolute positioning.
- No game-specific logic. Tooltip content is derived from RenderModel types.
- Does NOT modify canvas interaction behavior — only reads hover state.
- `@floating-ui/react-dom` is added as a `dependencies` entry (not devDependencies).

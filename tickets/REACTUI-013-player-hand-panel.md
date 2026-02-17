# REACTUI-013: PlayerHandPanel

**Spec**: 39 (React DOM UI Layer) — Deliverable D10
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the floating PlayerHandPanel that shows the human player's private tokens (e.g., hole cards in poker). Renders when the human player owns zones with `visibility: 'owner'` that contain tokens.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/PlayerHandPanel.tsx` | Horizontal row of face-up tokens from owner-visible zones |
| `packages/runner/src/ui/PlayerHandPanel.module.css` | Hand panel styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount PlayerHandPanel in the floating region |

---

## Detailed Requirements

- **Store selector**: reads `renderModel.zones`, `renderModel.tokens`, `renderModel.activePlayerID`, `renderModel.players`.
- **Renders when**: the human player (identified via `players.find(p => p.isHuman)`) owns zones with `visibility === 'owner'` that contain tokens.
- Filters zones: `zone.visibility === 'owner'` AND `zone.ownerID === humanPlayerID`.
- Collects tokens from those zones via `zone.tokenIDs` cross-referenced with `renderModel.tokens`.
- Displays tokens as a horizontal row:
  - Each token shows its `type` as primary label.
  - Token `properties` displayed as secondary info (e.g., suit/rank for cards).
  - Face-up rendering (these are the player's own cards — always visible to them).
- **Interactive when choice is relevant**: tokens have `isSelectable === true` when a choice requires selecting from the player's hand. Selectable tokens get `pointer-events: auto` and clickable styling.
- **Collapse/expand toggle**: for screen space management.
- Positioned in the floating region (bottom or side of screen).

---

## Out of Scope

- Card art or visual token rendering (that's the canvas layer)
- Drag-and-drop interaction
- Opponent hand display (hidden information)
- Animation on card receipt (Spec 40)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Renders tokens from owner-visible zones |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Not rendered when no owner-visible zones have tokens |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Shows token type as label |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Shows token properties as secondary info |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Selectable tokens have interactive styling |
| `packages/runner/test/ui/PlayerHandPanel.test.tsx` | Collapse toggle hides/shows hand content |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- No game-specific logic. Token types and properties come from RenderModel.
- Only shows tokens the human player is allowed to see (`visibility: 'owner'`).
- Renders nothing (`null`) when there are no qualifying tokens.
- Does NOT modify the canvas display — this is a DOM-only representation.

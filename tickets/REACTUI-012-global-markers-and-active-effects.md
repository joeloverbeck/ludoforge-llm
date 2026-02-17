# REACTUI-012: GlobalMarkersBar and ActiveEffectsPanel

**Spec**: 39 (React DOM UI Layer) — Deliverables D14, D15
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two conditional side panel components: GlobalMarkersBar (horizontal bar of marker chips with state labels) and ActiveEffectsPanel (list of lasting effects with duration and source info).

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/GlobalMarkersBar.tsx` | Horizontal bar of marker chips |
| `packages/runner/src/ui/GlobalMarkersBar.module.css` | Marker chip styling |
| `packages/runner/src/ui/ActiveEffectsPanel.tsx` | Lasting effects list |
| `packages/runner/src/ui/ActiveEffectsPanel.module.css` | Effect list styling |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount GlobalMarkersBar + ActiveEffectsPanel in the side panels region |

---

## Detailed Requirements

### GlobalMarkersBar (D14)

- **Store selector**: reads `renderModel.globalMarkers`.
- **Renders when**: `globalMarkers.length > 0`.
- Horizontal bar of marker chips.
- Each chip shows: marker `id` (as display label) and current `state`.
- `possibleStates` available for tooltip context (show on hover as a title attribute or simple tooltip).
- Compact layout: chips flow horizontally, wrap if needed.

### ActiveEffectsPanel (D15)

- **Store selector**: reads `renderModel.activeEffects`.
- **Renders when**: `activeEffects.length > 0`.
- Lists each `RenderLastingEffect`:
  - `displayName`: primary text.
  - `sourceCardId`: shows which card created this effect.
  - `side`: "Shaded" or "Unshaded" label.
  - `duration`: remaining duration text.
- Vertical list in the side panel.

---

## Out of Scope

- Marker state transition animation (Spec 40)
- Effect countdown animation
- Interactive marker manipulation
- Tooltip layer integration for markers (REACTUI-016 handles floating tooltips)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/GlobalMarkersBar.test.tsx` | Renders a chip for each global marker |
| `packages/runner/test/ui/GlobalMarkersBar.test.tsx` | Each chip shows marker id and current state |
| `packages/runner/test/ui/GlobalMarkersBar.test.tsx` | Not rendered when globalMarkers is empty |
| `packages/runner/test/ui/GlobalMarkersBar.test.tsx` | Possible states available as tooltip/title |
| `packages/runner/test/ui/ActiveEffectsPanel.test.tsx` | Renders each lasting effect |
| `packages/runner/test/ui/ActiveEffectsPanel.test.tsx` | Shows displayName, sourceCardId, side, and duration |
| `packages/runner/test/ui/ActiveEffectsPanel.test.tsx` | Not rendered when activeEffects is empty |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Marker IDs, states, and effect names come from RenderModel.
- Components render nothing (`null`) when their data is empty.
- Display-only — no interactive elements that dispatch store actions.
- CSS Modules for all styling. No inline styles except dynamic values.

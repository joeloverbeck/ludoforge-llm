# REACTUI-012: GlobalMarkersBar and ActiveEffectsPanel

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer) — Deliverables D14, D15
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: M

---

## Summary

Create two conditional side panel components: GlobalMarkersBar (horizontal bar of marker chips with state labels) and ActiveEffectsPanel (list of lasting effects with duration and source info).

## Assumption Check (2026-02-18)

- `RenderModel` already exposes `globalMarkers` and `activeEffects`; derivation is implemented and covered in `packages/runner/test/model/derive-render-model-state.test.ts`.
- Side-panel composition currently happens in `packages/runner/src/ui/GameContainer.tsx` via `UIOverlay` slots (`sidePanelContent`). `UIOverlay.tsx` is intentionally structural and should not own component-level panel composition.
- UI component tests in this repo are conventionally `.test.ts` files (not `.test.tsx`), typically using mocked `useStore` selectors plus `renderToStaticMarkup` for null/render contracts.
- `RenderLastingEffect.side` is `'unshaded' | 'shaded'`; UI should format this as presentation text and remain fully data-driven.

## Updated Scope

- Add `GlobalMarkersBar` and `ActiveEffectsPanel` as display-only, conditional side-panel components, each selecting only its required slice from the store.
- Integrate both components in `GameContainer` `sidePanelContent` composition (not in `UIOverlay`).
- Add targeted unit tests for both components and strengthen `GameContainer` composition assertions so side-panel integration is regression-protected.
- Preserve game-agnostic behavior (no hardcoded marker/effect semantics) and avoid introducing aliasing/back-compat shims.

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
| `packages/runner/src/ui/GameContainer.tsx` | Compose GlobalMarkersBar + ActiveEffectsPanel into `sidePanelContent` |
| `packages/runner/test/ui/GameContainer.test.ts` | Assert new side-panel components are mounted in playing/terminal overlay |

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
| `packages/runner/test/ui/GlobalMarkersBar.test.ts` | Renders a chip for each global marker |
| `packages/runner/test/ui/GlobalMarkersBar.test.ts` | Each chip shows marker id and current state |
| `packages/runner/test/ui/GlobalMarkersBar.test.ts` | Not rendered when globalMarkers is empty |
| `packages/runner/test/ui/GlobalMarkersBar.test.ts` | Possible states available as tooltip/title |
| `packages/runner/test/ui/ActiveEffectsPanel.test.ts` | Renders each lasting effect |
| `packages/runner/test/ui/ActiveEffectsPanel.test.ts` | Shows displayName, sourceCardId, side, and duration |
| `packages/runner/test/ui/ActiveEffectsPanel.test.ts` | Not rendered when activeEffects is empty |
| `packages/runner/test/ui/GameContainer.test.ts` | Side panel composition includes both components in playing/terminal lifecycle states |

### Invariants

- Components use **Zustand selectors** — NOT the entire store.
- No game-specific logic. Marker IDs, states, and effect names come from RenderModel.
- Components render nothing (`null`) when their data is empty.
- Display-only — no interactive elements that dispatch store actions.
- CSS Modules for all styling. No inline styles except dynamic values.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `packages/runner/src/ui/GlobalMarkersBar.tsx` and `packages/runner/src/ui/GlobalMarkersBar.module.css`.
  - Added `packages/runner/src/ui/ActiveEffectsPanel.tsx` and `packages/runner/src/ui/ActiveEffectsPanel.module.css`.
  - Integrated both components into side-panel composition in `packages/runner/src/ui/GameContainer.tsx`.
  - Added tests:
    - `packages/runner/test/ui/GlobalMarkersBar.test.ts`
    - `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - Strengthened composition coverage in `packages/runner/test/ui/GameContainer.test.ts`.
- **Deviation from original plan**:
  - Integration was implemented in `GameContainer` rather than `UIOverlay`, because current architecture keeps `UIOverlay` structural and composes concrete side-panel content at the container layer.
  - Test files were added as `.test.ts` to match the existing test suite convention.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

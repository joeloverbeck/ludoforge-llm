# REACTUI-003: GameContainer and UIOverlay Shell

**Spec**: 39 (React DOM UI Layer) — Deliverable D2
**Priority**: P0 (blocks all panel/interaction tickets)
**Depends on**: REACTUI-001, REACTUI-002
**Estimated complexity**: M

---

## Summary

Create the root layout component (`GameContainer`) that positions the canvas and DOM overlay as siblings, gates on lifecycle state, and provides the `UIOverlay` shell where all panels will mount. This is the structural backbone of the entire DOM UI layer.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/GameContainer.tsx` | Root layout: lifecycle gating, canvas + overlay positioning |
| `packages/runner/src/ui/GameContainer.module.css` | Layout styles: relative container, absolute canvas/overlay |
| `packages/runner/src/ui/UIOverlay.tsx` | `pointer-events: none` container with semantic regions (top, side, bottom, floating) |
| `packages/runner/src/ui/UIOverlay.module.css` | Overlay positioning and region layout |

### Modified files

None (App.tsx integration is REACTUI-004).

---

## Detailed Requirements

### GameContainer

- Props: `{ store: GameStore }` (receives the Zustand store instance).
- Uses `useStore(store, selector)` with a selector for `gameLifecycle` and `error`.
- **Lifecycle gating logic**:
  - `idle` or `initializing`: renders `<LoadingState />`
  - `error !== null`: renders `<ErrorState error={error} onRetry={() => store.getState().clearError()} />`
  - `playing` or `terminal`: renders `<GameCanvas store={store} />` + `<UIOverlay store={store} />`
- CSS: `position: relative`, fills available viewport (`width: 100vw; height: 100vh`).
- Canvas child: `position: absolute; inset: 0` (fills container).
- UIOverlay child: `position: absolute; inset: 0; pointer-events: none; z-index: var(--z-overlay)`.
- Does **not** mount `useKeyboardShortcuts` yet (that's REACTUI-018).

### UIOverlay

- Props: `{ store: GameStore }`.
- Provides semantic layout regions as `<div>` containers:
  - **Top bar**: horizontal strip at top edge
  - **Side panels**: vertical strip on the right edge
  - **Bottom bar**: horizontal strip at bottom edge
  - **Floating**: absolute-positioned layer for tooltips/overlays
- Each region is an empty placeholder `<div>` for now — child components are added in their own tickets.
- All region containers have `pointer-events: none`. Individual interactive children set `pointer-events: auto` themselves.

---

## Out of Scope

- Mounting any panel components inside UIOverlay (each panel is its own ticket)
- The `useKeyboardShortcuts` hook (REACTUI-018)
- App.tsx bootstrap changes (REACTUI-004)
- Canvas rendering logic (already implemented in Spec 38)
- Animation (Spec 40)
- Mobile layout or responsive breakpoints

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/GameContainer.test.tsx` | Renders LoadingState when lifecycle is `idle` |
| `packages/runner/test/ui/GameContainer.test.tsx` | Renders LoadingState when lifecycle is `initializing` |
| `packages/runner/test/ui/GameContainer.test.tsx` | Renders ErrorState when `error` is non-null |
| `packages/runner/test/ui/GameContainer.test.tsx` | Renders GameCanvas + UIOverlay when lifecycle is `playing` |
| `packages/runner/test/ui/GameContainer.test.tsx` | Renders GameCanvas + UIOverlay when lifecycle is `terminal` |
| `packages/runner/test/ui/GameContainer.test.tsx` | ErrorState retry button calls `clearError()` on the store |
| `packages/runner/test/ui/UIOverlay.test.tsx` | Renders all four semantic regions (top, side, bottom, floating) |
| `packages/runner/test/ui/UIOverlay.test.tsx` | Overlay container has `pointer-events: none` |

### Invariants

- `GameContainer` subscribes to the store with **minimal selectors** (only `gameLifecycle` and `error`). It does NOT subscribe to the entire store.
- `UIOverlay` does NOT read any RenderModel data itself — it is purely structural.
- The overlay's root `<div>` has `pointer-events: none`. No interactive element is mounted in this ticket.
- `GameCanvas` from `canvas/GameCanvas.tsx` is imported and rendered unchanged — no modifications to canvas code.
- Layout fills the full viewport. No scrollbars appear.
- No game-specific logic. No references to FITL or Texas Hold'em.

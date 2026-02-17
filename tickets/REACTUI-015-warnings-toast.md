# REACTUI-015: WarningsToast

**Spec**: 39 (React DOM UI Layer) — Deliverable D18
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the auto-dismissing toast notification system for move enumeration warnings. Toasts stack vertically and auto-dismiss after a timeout.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/WarningsToast.tsx` | Toast notification system for `moveEnumerationWarnings` |
| `packages/runner/src/ui/WarningsToast.module.css` | Toast styling, stacking, fade-out animation |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/ui/UIOverlay.tsx` | Mount WarningsToast in the floating region |

---

## Detailed Requirements

- **Store selector**: reads `renderModel.moveEnumerationWarnings`.
- **Renders when**: `moveEnumerationWarnings.length > 0` (but tracks active toasts in local state).
- **Toast behavior**:
  - Each `RenderWarning` displayed as a toast showing `code` and `message`.
  - Toasts stack vertically (newest at top or bottom — pick one consistently).
  - Each toast auto-dismisses after a timeout (e.g., 5 seconds).
  - CSS fade-out animation before removal.
- **Local state**: maintains active toasts and their dismiss timers. When store warnings change, add new toasts that weren't already shown.
- **Positioning**: floating region, does NOT overlap interactive controls (bottom bar, top bar).
- `pointer-events: auto` on toasts so they can be manually dismissed (click to close).

---

## Out of Scope

- Custom toast types beyond warnings (info, success, error)
- Toast persistence or logging
- Toast sound effects
- Animation library (CSS-only transitions)
- Mobile layout

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/WarningsToast.test.tsx` | Renders toast for each new warning |
| `packages/runner/test/ui/WarningsToast.test.tsx` | Toast shows warning `code` and `message` |
| `packages/runner/test/ui/WarningsToast.test.tsx` | Toast auto-dismisses after timeout (use fake timers) |
| `packages/runner/test/ui/WarningsToast.test.tsx` | Multiple toasts stack vertically |
| `packages/runner/test/ui/WarningsToast.test.tsx` | Clicking a toast dismisses it immediately |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- Toast dismiss timers are cleaned up on unmount (no memory leaks).
- Toasts do NOT overlap the bottom bar or top bar controls.
- No game-specific logic. Warning codes and messages come from RenderModel.
- Auto-dismiss uses CSS animation + `setTimeout` — no external animation library.

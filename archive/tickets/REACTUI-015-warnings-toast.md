# REACTUI-015: WarningsToast
**Status**: ✅ COMPLETED

**Spec**: 39 (React DOM UI Layer) — Deliverable D18
**Priority**: P2
**Depends on**: REACTUI-003
**Estimated complexity**: S

---

## Summary

Create the auto-dismissing toast notification system for move enumeration warnings. Toasts stack vertically and auto-dismiss after a timeout.

---

## Reassessed Assumptions (2026-02-18)

- `renderModel.moveEnumerationWarnings` already exists and is derived from `legalMoveResult.warnings` in `packages/runner/src/model/derive-render-model.ts`.
- `WarningsToast` does **not** exist yet in `packages/runner/src/ui/`.
- `packages/runner/test/ui/WarningsToast.test.ts` does **not** exist yet.
- `UIOverlay` is a layout shell and should remain generic; floating panel composition lives in `GameContainer`.
- Therefore this ticket must implement a new floating panel component and register it through `GameContainer` panel composition.

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
| `packages/runner/src/ui/GameContainer.tsx` | Register WarningsToast in floating panel composition |

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
- **Deduping behavior**: warnings are keyed by `code + message`; repeated identical warnings from store refreshes should not spawn duplicate active toasts.

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
| `packages/runner/test/ui/WarningsToast.test.ts` | Renders toast for each new warning |
| `packages/runner/test/ui/WarningsToast.test.ts` | Toast shows warning `code` and `message` |
| `packages/runner/test/ui/WarningsToast.test.ts` | Toast auto-dismisses after timeout (use fake timers) |
| `packages/runner/test/ui/WarningsToast.test.ts` | Multiple toasts stack vertically |
| `packages/runner/test/ui/WarningsToast.test.ts` | Clicking a toast dismisses it immediately |

### Invariants

- Uses **Zustand selectors** — NOT the entire store.
- Toast dismiss timers are cleaned up on unmount (no memory leaks).
- Toasts do NOT overlap the bottom bar or top bar controls.
- No game-specific logic. Warning codes and messages come from RenderModel.
- Auto-dismiss uses CSS animation + `setTimeout` — no external animation library.

---

## Architecture Note

- This ticket intentionally keeps `UIOverlay` generic and pushes feature composition into `GameContainer` panel lists.
- This is cleaner and more extensible than adding special-case warning logic to the overlay shell, because future floating UI elements follow the same composition path without widening `UIOverlay` responsibilities.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `packages/runner/src/ui/WarningsToast.tsx` with local toast lifecycle, deduped warning-key ingestion (`code + message`), auto-dismiss, manual dismiss, and timer cleanup.
  - Added `packages/runner/src/ui/WarningsToast.module.css` for stacked toast styling and fade-out animation.
  - Updated `packages/runner/src/ui/GameContainer.tsx` to register `WarningsToast` in floating panel composition.
  - Added `packages/runner/test/ui/WarningsToast.test.ts` and updated `packages/runner/test/ui/GameContainer.test.ts`.
- **Deviations from original plan**:
  - Integration was implemented in `GameContainer` instead of `UIOverlay` to preserve clean overlay-shell responsibilities.
  - Added extra invariant tests (duplicate-warning suppression and timer cleanup on unmount) beyond the baseline acceptance list.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`

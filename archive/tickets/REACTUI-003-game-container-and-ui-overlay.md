# REACTUI-003: GameContainer and UIOverlay Shell

**Spec**: 39 (React DOM UI Layer) — Deliverable D2
**Priority**: P0 (blocks all panel/interaction tickets)
**Depends on**: REACTUI-001, REACTUI-002
**Estimated complexity**: M
**Status**: ✅ COMPLETED

---

## Summary

Create the root layout component (`GameContainer`) that positions the canvas and DOM overlay as siblings, gates on lifecycle state, and provides the `UIOverlay` shell where all panels will mount. This is the structural backbone of the entire DOM UI layer.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- `packages/runner/src/ui/` already includes D1 assets (`tokens.css`, `shared.module.css`) and REACTUI-002 components (`LoadingState`, `ErrorState`, `ErrorBoundary`).
- `GameContainer` and `UIOverlay` do not exist yet; `packages/runner/src/App.tsx` is still placeholder content (REACTUI-004 remains the bootstrap integration ticket).
- Runner tests currently run in Vitest Node environment with `include: ['test/**/*.test.ts']`; acceptance tests for this ticket should be `*.test.ts` contract tests, not `*.test.tsx`.
- `GameCanvas` accepts a Zustand `StoreApi<GameStore>` instance, so the container prop contract should use `StoreApi<GameStore>` for type correctness.

### Scope adjustments

- `UIOverlay` is intentionally store-agnostic in this ticket; it should not receive a `store` prop until a panel ticket needs one.
- `GameContainer` is the only component in this ticket that reads lifecycle/error store state; panel data subscriptions remain in their own panel tickets.
- Keyboard shortcut mounting remains out of scope and is implemented in REACTUI-018.

### Architectural rationale

- Keeping `UIOverlay` as a pure layout shell is cleaner and more extensible than wiring state early; it avoids unnecessary subscriptions and prop churn as panel composition evolves.
- Using minimal selectors in `GameContainer` preserves render isolation and keeps canvas/UI shell orchestration robust as the React DOM layer grows.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/GameContainer.tsx` | Root layout: lifecycle gating, canvas + overlay positioning |
| `packages/runner/src/ui/GameContainer.module.css` | Layout styles: relative container, absolute canvas/overlay |
| `packages/runner/src/ui/UIOverlay.tsx` | `pointer-events: none` structural container with semantic regions (top, side, bottom, floating) |
| `packages/runner/src/ui/UIOverlay.module.css` | Overlay positioning and region layout |
| `packages/runner/test/ui/GameContainer.test.ts` | Contract tests for lifecycle gating and retry wiring |
| `packages/runner/test/ui/UIOverlay.test.ts` | Contract tests for semantic regions and non-interactive overlay shell |

### Modified files

None (App.tsx integration is REACTUI-004).

---

## Detailed Requirements

### GameContainer

- Props: `{ store: StoreApi<GameStore> }` (receives the Zustand store instance).
- Uses `useStore(store, selector)` with a selector for `gameLifecycle` and `error`.
- **Lifecycle gating logic**:
  - `idle` or `initializing`: renders `<LoadingState />`
  - `error !== null`: renders `<ErrorState error={error} onRetry={() => store.getState().clearError()} />`
  - `playing` or `terminal`: renders `<GameCanvas store={store} />` + `<UIOverlay />`
- CSS: `position: relative`, fills available viewport (`width: 100vw; height: 100vh`).
- Canvas child: `position: absolute; inset: 0` (fills container).
- UIOverlay child: `position: absolute; inset: 0; pointer-events: none; z-index: var(--z-overlay)`.
- Does **not** mount `useKeyboardShortcuts` yet (that's REACTUI-018).

### UIOverlay

- Props: none.
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
| `packages/runner/test/ui/GameContainer.test.ts` | Renders LoadingState when lifecycle is `idle` |
| `packages/runner/test/ui/GameContainer.test.ts` | Renders LoadingState when lifecycle is `initializing` |
| `packages/runner/test/ui/GameContainer.test.ts` | Renders ErrorState when `error` is non-null |
| `packages/runner/test/ui/GameContainer.test.ts` | Renders GameCanvas + UIOverlay when lifecycle is `playing` |
| `packages/runner/test/ui/GameContainer.test.ts` | Renders GameCanvas + UIOverlay when lifecycle is `terminal` |
| `packages/runner/test/ui/GameContainer.test.ts` | ErrorState retry button calls `clearError()` on the store |
| `packages/runner/test/ui/UIOverlay.test.ts` | Renders all four semantic regions (top, side, bottom, floating) |
| `packages/runner/test/ui/UIOverlay.test.ts` | Overlay container is non-interactive shell (`pointer-events: none` via CSS module contract) |

### Invariants

- `GameContainer` subscribes to the store with **minimal selectors** (only `gameLifecycle` and `error`). It does NOT subscribe to the entire store.
- `UIOverlay` does NOT read any RenderModel data itself and does not receive the store — it is purely structural.
- The overlay's root `<div>` has `pointer-events: none`. No interactive element is mounted in this ticket.
- `GameCanvas` from `canvas/GameCanvas.tsx` is imported and rendered unchanged — no modifications to canvas code.
- Layout fills the full viewport. No scrollbars appear.
- No game-specific logic. No references to FITL or Texas Hold'em.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented `GameContainer` lifecycle shell and `UIOverlay` structural regions.
  - Corrected ticket assumptions before implementation (Node `*.test.ts` harness, typed store contract, store-agnostic `UIOverlay`).
  - Added focused contract tests covering lifecycle gating, overlay layout shell, and `clearError()` retry wiring.
- **Deviations**:
  - `UIOverlay` intentionally does not receive `store` in this ticket; this keeps the shell pure and avoids premature coupling.
  - Acceptance test filenames were executed as `*.test.ts` to match current Vitest config.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.

# REACTUI-033: Declarative Overlay Panel Composition

**Status**: ✅ COMPLETED
**Spec**: 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: None (current `GameContainer` + `UIOverlay` baseline)
**Estimated complexity**: S

---

## Summary

Refactor manual JSX panel wiring in `GameContainer` into a declarative composition structure so top/side regions scale cleanly as more UI panels are added while preserving current behavior.

---

## Reassessed Assumptions (Code/Test Reality)

- `UIOverlay` is currently a structural layout shell with named regions (`top`, `side`, `bottom`, `floating`) and props for `topBarContent`, `sidePanelContent`, and `bottomBarContent` only.
- `GameContainer` currently hardcodes top/side panel composition inline via JSX fragments.
- Bottom-bar mode ownership already lives in `deriveBottomBarState` and is covered by `GameContainer` tests.
- The floating region exists structurally in `UIOverlay`, but there is no floating content prop/composition contract in current code.
- Existing tests already cover lifecycle gating and bottom-bar exclusivity; this ticket should extend/retain that coverage, not weaken it.

---

## What Needs to Change

- Introduce a small declarative composition structure in `packages/runner/src/ui/GameContainer.tsx` (or a colocated helper module) for overlay regions currently owned by `GameContainer`:
  - top region panel list
  - side region panel list
- Keep `UIOverlay` structural; panel selection/composition remains in the container layer.
- Preserve existing render gating (lifecycle and bottom-bar state machine ownership).
- Migrate existing top/side panel composition to the declarative structure without changing runtime behavior.

---

## Out of Scope

- Changing `UIOverlay` public props or introducing a floating-region composition API in this ticket.
- Introducing any game-specific panel wiring.
- Reworking bottom-bar mode derivation/state ownership.

---

## Invariants

- `UIOverlay` remains a layout shell, not a game-state orchestration layer.
- Bottom-bar mode routing remains single-source (`deriveBottomBarState`).
- Region composition is deterministic and free of duplicated conditional logic.
- No game-specific panel wiring logic introduced.

---

## Tests that Should Pass

- `packages/runner/test/ui/GameContainer.test.ts`
  - top and side regions still include expected panels in `playing` and `terminal` states.
  - top and side region panel order remains deterministic.
  - bottom bar still renders only one mode branch at a time.
- `packages/runner/test/ui/UIOverlay.test.ts`
  - semantic overlay regions remain unchanged.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Updated ticket assumptions/scope to match actual codebase state (invalid dependency removed, floating composition explicitly out of scope).
  - Refactored `GameContainer` top/side overlay wiring to declarative region panel lists with deterministic rendering order.
  - Strengthened `GameContainer` tests to assert deterministic panel order for both `playing` and `terminal` lifecycle states.
- **Deviations from original plan**:
  - The original ticket referenced floating-region panel composition; this was corrected to top/side composition only because `UIOverlay` currently exposes no floating content prop.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo test` passed.

# REACTUI-033: Declarative Overlay Panel Composition

**Status**: ACTIVE
**Spec**: 39 (React DOM UI Layer)
**Priority**: P2
**Depends on**: REACTUI-012
**Estimated complexity**: S

---

## Summary

Refactor manual JSX panel wiring in `GameContainer` into a declarative composition map/registry so top/side/floating regions scale cleanly as more UI panels are added.

---

## What Needs to Change

- Introduce a small declarative composition structure in `packages/runner/src/ui/GameContainer.tsx` (or a colocated helper module) for overlay regions:
  - top region panel list
  - side region panel list
  - floating region panel list
- Keep `UIOverlay` structural; panel selection/composition remains in container layer.
- Preserve existing render gating (lifecycle and bottom-bar state machine ownership).
- Migrate existing top/side panel composition to the declarative structure without changing behavior.

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
  - bottom bar still renders only one mode branch at a time.
- `packages/runner/test/ui/UIOverlay.test.ts`
  - semantic overlay regions remain unchanged.

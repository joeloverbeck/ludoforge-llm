# REACTUI-032: Display-Ready Projection for Markers and Effects

**Status**: ACTIVE
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-031
**Estimated complexity**: M

---

## Summary

Move marker/effect user-facing string formatting fully into RenderModel derivation so UI components render projection fields only (no raw ID presentation policy in panel components).

---

## What Needs to Change

- Extend render-model contracts in `packages/runner/src/model/render-model.ts` for global markers/effects with explicit display fields (for example: `displayName`, optional display metadata).
- Update `packages/runner/src/model/derive-render-model.ts` so marker/effect display labels are generated in one place via shared formatting utilities.
- Update `packages/runner/src/ui/GlobalMarkersBar.tsx` and `packages/runner/src/ui/ActiveEffectsPanel.tsx` to render display fields only.
- Ensure tests stop asserting raw IDs as the primary UI label contract where display fields exist.

---

## Invariants

- UI panels do not own formatting policy for marker/effect labels.
- Display contracts are deterministic and centrally derived in model layer.
- No game-specific naming logic in UI components.
- Projection remains generic and reusable for any GameSpecDoc-derived GameDef.

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - marker/effect display fields are derived correctly and deterministically.
- `packages/runner/test/ui/GlobalMarkersBar.test.ts`
  - chip primary labels use display-ready fields.
- `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - effect title/meta rows use display-ready fields.
- `packages/runner/test/utils/format-display-name.test.ts`
  - formatting helpers used by derivation remain stable.

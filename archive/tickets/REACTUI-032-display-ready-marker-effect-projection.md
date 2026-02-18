# REACTUI-032: Display-Ready Projection for Markers and Effects

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-031
**Estimated complexity**: M

---

## Summary

Complete display-ready projection for global markers in RenderModel derivation so UI components render projection fields only (no raw ID presentation policy in panel components).

Active lasting effects are already display-projected (`displayName` + generic attribute projection) and their panel is already rendering those fields.

---

## What Needs to Change

- Extend render-model contracts in `packages/runner/src/model/render-model.ts` for global markers with explicit display fields (`displayName`).
- Update `packages/runner/src/model/derive-render-model.ts` so global marker display labels are generated in one place via shared formatting utilities.
- Update `packages/runner/src/ui/GlobalMarkersBar.tsx` to render global marker display fields only.
- Ensure tests stop asserting raw IDs as the primary UI label contract where display fields exist.
- Keep `ActiveEffectsPanel` and effect projection unchanged unless a discrepancy is found while implementing.

---

## Invariants

- UI panels do not own formatting policy for marker/effect labels.
- Display contracts are deterministic and centrally derived in model layer.
- No game-specific naming logic in UI components.
- Projection remains generic and reusable for any GameSpecDoc-derived GameDef.

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - global marker/effect display fields are derived correctly and deterministically.
- `packages/runner/test/ui/GlobalMarkersBar.test.ts`
  - chip primary labels use display-ready fields.
- `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - remains green as a regression guard for existing effect projection behavior.
- `packages/runner/test/utils/format-display-name.test.ts`
  - formatting helpers used by derivation remain stable.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `displayName` to `RenderGlobalMarker` in `packages/runner/src/model/render-model.ts`.
  - Derived marker display names centrally in `packages/runner/src/model/derive-render-model.ts` via `formatIdAsDisplayName`.
  - Updated `packages/runner/src/ui/GlobalMarkersBar.tsx` to render marker `displayName` instead of raw `id`.
  - Updated and strengthened model/UI type tests to assert display-ready marker labels.
  - Fixed a pre-existing runner test typing issue in `packages/runner/test/ui/VariablesPanel.test.ts` so `pnpm -F @ludoforge/runner typecheck` passes.
- **Deviation from original plan**:
  - Scope was narrowed after reassessment: active effects projection and panel rendering were already aligned, so no behavior change was made there.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`

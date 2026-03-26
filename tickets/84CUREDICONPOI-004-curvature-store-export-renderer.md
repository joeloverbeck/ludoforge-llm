# 84CUREDICONPOI-004 — Curvature Support in Store, Export & Renderer

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (integration layer)
**Deps**: `tickets/84CUREDICONPOI-002-curvature-control-schema.md`, `tickets/84CUREDICONPOI-003-curvature-resolution-algorithm.md`
**Depends on:** 84CUREDICONPOI-002, 84CUREDICONPOI-003
**Blocks:** 84CUREDICONPOI-008

---

## Summary

Wire the new `curvature` control point kind through the map editor store (preview/commit), YAML export serializer, and presentation renderer. After this ticket, curvature control points are fully functional end-to-end.

## Task

### Store (`map-editor-store.ts`)

The `moveControlPointInDocument` function currently handles `anchor` and `position` kinds. For `curvature` controls, dragging a control point should convert the curvature to a `position` kind (since the user is now specifying an absolute position by dragging). This matches the existing pattern where drag commits absolute coordinates.

Add the `'curvature'` case to `moveControlPointInDocument`:
- When a curvature control is dragged, replace it with `{ kind: 'position', x, y }` at the new position
- This is intentional: the user is overriding the relative curvature with an explicit position

### Export (`map-editor-export.ts`)

The `cloneRouteDefinition` function clones segment controls for YAML serialization. Add a `'curvature'` case that serializes `{ kind: 'curvature', offset, angle? }`.

### Renderer (`connection-route-renderer.ts`)

The presentation renderer's `resolveControlPoint` usage (via `connection-route-resolver.ts`) should already work if 84CUREDICONPOI-003 is done. Verify that the renderer correctly handles curvature segments without additional changes. If the renderer calls `resolveControlPoint` directly, add the curvature case.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-store.ts` | Add `'curvature'` case to `moveControlPointInDocument` |
| `packages/runner/src/map-editor/map-editor-export.ts` | Add `'curvature'` case to `cloneRouteDefinition` |
| `packages/runner/src/canvas/renderers/connection-route-renderer.ts` | Verify curvature works; add case if needed |
| `packages/runner/test/map-editor/map-editor-store.test.ts` | Store action tests for curvature preview/commit |
| `packages/runner/test/map-editor/map-editor-export.test.ts` | Export serialization round-trip test for curvature |
| `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` | Verify curvature rendering (if changes needed) |

## Out of Scope

- Do NOT change the curvature resolution algorithm (done in 84CUREDICONPOI-003)
- Do NOT change the schema types (done in 84CUREDICONPOI-002)
- Do NOT change handle event propagation (done in 84CUREDICONPOI-001)
- Do NOT change drag handlers or handle rendering
- Do NOT change live feedback behavior (that is 84CUREDICONPOI-005/006/007)
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml` data files (that is 84CUREDICONPOI-008)

## Acceptance Criteria

### Tests that must pass

1. **New test:** Store `previewControlPointMove` on a curvature segment converts to position kind
2. **New test:** Store `moveControlPoint` on a curvature segment commits as position kind
3. **New test:** Export serializes `{ kind: 'curvature', offset: 0.3 }` correctly to YAML structure
4. **New test:** Export serializes `{ kind: 'curvature', offset: -0.5, angle: 45 }` preserving both fields
5. **New test:** Export round-trip: curvature control -> export -> parse -> matches original
6. **Existing tests:** All existing store, export, and renderer tests continue to pass

### Invariants

- `anchor` and `position` store/export/render paths are unchanged
- Dragging a curvature control point converts it to `position` (intentional UX decision)
- Export preserves curvature controls that have NOT been dragged (they remain curvature in YAML)
- State transitions in the store remain immutable (F7)
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Visual config data stays in visual-config.yaml
- **F7:** Store returns new state objects, never mutates

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

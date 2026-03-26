# 84CUREDICONPOI-004 — Curvature Support in Store, Export & Renderer

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (integration layer)
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-002-curvature-control-schema.md`, `archive/tickets/84CUREDICONPOI-003-curvature-resolution-algorithm.md`
**Depends on:** 84CUREDICONPOI-002, 84CUREDICONPOI-003
**Blocks:** 84CUREDICONPOI-008

---

## Summary

Wire the new `curvature` control point kind through the map editor store (preview/commit), YAML export serializer, and presentation renderer. After this ticket, curvature control points are fully functional end-to-end.

## Note

`84CUREDICONPOI-002` already implemented the store/export/provider integration that was originally split into this ticket because the existing architecture required those surfaces to change together with the schema/control-model adoption.

The most important stale assumption in this ticket is the drag behavior:
- dragging a `curvature` control point does **not** convert it to `{ kind: 'position' }`
- the current architecture intentionally preserves the relative `curvature` model by deriving updated `offset`/`angle` from the dragged absolute point

Any follow-up work here should align with that model and should be limited to genuinely remaining renderer/editor gaps after reassessment. Do not regress the system back toward newly-authored absolute control points unless the architecture is reconsidered explicitly.

## Task

### Store (`map-editor-store.ts`)

The `moveControlPointInDocument` function originally handled only `anchor` and `position` kinds. That is no longer true in current code. If additional store work is needed, it must preserve the `curvature` model rather than degrading dragged controls into new absolute `position` controls.

Do not implement the older "convert dragged curvature to position" plan. Current architecture derives updated `offset`/`angle` from the dragged point so the route remains relative to its endpoints.

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

1. **New test:** Store `previewControlPointMove` on a curvature segment preserves curvature semantics
2. **New test:** Store `moveControlPoint` on a curvature segment commits updated curvature data, not `position`
3. **New test:** Export serializes `{ kind: 'curvature', offset: 0.3 }` correctly to YAML structure
4. **New test:** Export serializes `{ kind: 'curvature', offset: -0.5, angle: 45 }` preserving both fields
5. **New test:** Export round-trip: curvature control -> export -> parse -> matches original
6. **Existing tests:** All existing store, export, and renderer tests continue to pass

### Invariants

- `anchor` and `position` store/export/render paths are unchanged
- Dragging a curvature control point preserves the relative curvature model by updating `offset`/`angle`
- Export preserves curvature controls, including those updated through dragging
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

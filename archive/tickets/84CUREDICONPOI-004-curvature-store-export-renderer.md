# 84CUREDICONPOI-004 — Curvature Support in Store, Export & Renderer

**Status**: ✅ COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (integration layer)
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-002-curvature-control-schema.md`, `archive/tickets/84CUREDICONPOI-003-curvature-resolution-algorithm.md`
**Depends on:** 84CUREDICONPOI-002, 84CUREDICONPOI-003
**Blocks:** 84CUREDICONPOI-008

---

## Summary

Reassess the remaining integration work for `curvature` controls after 84CUREDICONPOI-002 and 84CUREDICONPOI-003. The current codebase already wires `curvature` through the store, export path, shared cloning helpers, editor geometry, and presentation resolver. The remaining work in this ticket is to verify those assumptions against the real code, correct the stale plan, and add any missing coverage for the intended invariants.

## Note

`84CUREDICONPOI-002` already implemented the store/export/provider integration that was originally split into this ticket because the existing architecture required those surfaces to change together with the schema/control-model adoption.

The most important stale assumption in this ticket is the drag behavior:
- dragging a `curvature` control point does **not** convert it to `{ kind: 'position' }`
- the current architecture intentionally preserves the relative `curvature` model by deriving updated `offset`/`angle` from the dragged absolute point

Two additional stale assumptions are now confirmed:
- export does **not** need a bespoke `cloneRouteDefinition` curvature branch in `map-editor-export.ts`; it already delegates to the shared `cloneConnectionRouteDefinition()` helper in `packages/runner/src/config/connection-route-utils.ts`, which supports `curvature`
- the presentation renderer does **not** resolve control kinds directly; it consumes already-resolved route geometry from `connection-route-resolver.ts`, where `curvature` is already supported

Any follow-up work here should align with that model and should be limited to verification and missing tests. Do not regress the system back toward newly-authored absolute control points unless the architecture is reconsidered explicitly.

## Reassessed Scope

### Store (`map-editor-store.ts`)

The store already supports `curvature` in both committed and preview edits via `moveControlPointInDocument()` and `resolveMovedControlPoint()`. The architectural requirement here is verification:
- committed drags preserve the relative curvature model
- preview drags use the same model and do not mutate the saved snapshot or degrade controls into `{ kind: 'position' }`

### Export (`map-editor-export.ts` + shared route helpers)

Export already serializes `curvature` by delegating route cloning to `cloneConnectionRouteDefinition()`. The architectural requirement here is verification:
- export preserves `{ kind: 'curvature', offset }`
- export preserves `{ kind: 'curvature', offset, angle }`
- no export-specific aliasing or fallback shape is introduced

### Renderer (`connection-route-renderer.ts`)

No renderer-local curvature implementation should be added unless reassessment finds a real gap. The renderer consumes resolved segments from `connection-route-resolver.ts`; `curvature` support belongs in the resolver/editor geometry layer, not in the renderer. The requirement here is to verify that existing resolver-driven rendering remains correct and does not need duplication.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/test/map-editor/map-editor-store.test.ts` | Add or tighten coverage for curvature preview/commit invariants if missing |
| `packages/runner/test/map-editor/map-editor-export.test.ts` | Add or tighten coverage for curvature export invariants if missing |
| `packages/runner/test/canvas/renderers/connection-route-renderer.test.ts` | Only touch if reassessment finds a renderer-specific gap |
| `tickets/84CUREDICONPOI-004-curvature-store-export-renderer.md` | Correct stale assumptions, narrow scope, record actual outcome |

## Out of Scope

- Do NOT change the curvature resolution algorithm (done in 84CUREDICONPOI-003)
- Do NOT change the schema types (done in 84CUREDICONPOI-002)
- Do NOT change handle event propagation (done in 84CUREDICONPOI-001)
- Do NOT change drag handlers or handle rendering
- Do NOT change live feedback behavior (that is 84CUREDICONPOI-005/006/007)
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml` data files (that is 84CUREDICONPOI-008)
- Do NOT duplicate curvature handling into the renderer when the resolver/editor-geometry layers already own that responsibility

## Acceptance Criteria

### Tests that must pass

1. **Verify existing test:** Store `moveControlPoint` on a curvature segment commits updated curvature data, not `position`
2. **New or strengthened test:** Store `previewControlPointMove` on a curvature segment preserves curvature semantics and keeps interaction state preview-only until commit
3. **New or strengthened test:** Export preserves `{ kind: 'curvature', offset: 0.3 }` without introducing an `angle` field
4. **Verify existing test:** Export preserves `{ kind: 'curvature', offset: -0.5, angle: 45 }` when an explicit angle exists
5. **Verify existing behavior:** Resolver/editor geometry already resolve curvature segments correctly for rendering; no renderer-local alias path is added
6. **Existing tests:** All existing store, export, resolver, geometry, and renderer tests continue to pass

### Invariants

- `anchor` and `position` store/export/render paths are unchanged
- Dragging a curvature control point preserves the relative curvature model by updating `offset`/`angle`
- Export preserves curvature controls, including those updated through dragging
- Curvature support stays centralized in shared route helpers and resolver/editor-geometry layers, not duplicated in export or renderer-specific code
- State transitions in the store remain immutable (F7)
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Visual config data stays in visual-config.yaml
- **F7:** Store returns new state objects, never mutates
- **F9:** No backwards-compatibility aliasing or duplicate control-model paths are introduced
- **F10:** Prefer verifying and reinforcing the existing generic architecture over adding renderer-local special cases

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- Completed: 2026-03-26
- What actually changed:
  - Reassessed the ticket against the current runner architecture and corrected stale assumptions in the ticket itself
  - Confirmed `curvature` support already exists in the store, shared route-cloning helpers, editor geometry, and presentation resolver
  - Added coverage for curvature preview interaction semantics in the store
  - Added coverage for offset-only curvature export so serialization does not synthesize an `angle`
- Deviations from original plan:
  - No production runner code changes were required
  - No renderer-local curvature branch was added because that would duplicate resolver-owned logic and weaken the architecture
  - Export verification remained centered on shared route helpers rather than adding export-specific cloning logic
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm run check:ticket-deps` ✅

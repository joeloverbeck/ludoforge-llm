# 84CUREDICONPOI-005 — Live Tangent Line Updates During Drag

**Status**: ✅ COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3A
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

During control point drag, the tangent lines (white lines from endpoints to the control point) do not update because the handle renderer suppresses store-driven re-rendering while `isDragging` is true. The dragged control handle itself still moves because `map-editor-drag.ts` updates the Pixi display object position imperatively, but the tangent line Graphics remain stale until drag end.

This is now a narrower problem than the original Spec 84 rollout implied. The curvature control model, schema, export, and store preview/commit flow already exist in the current codebase, and the route renderer already re-renders from preview state. The missing live-feedback gap for this ticket is isolated to tangent-line synchronization inside the handle renderer.

## Reassessed Assumptions

1. `curvature` controls are already implemented in the active architecture.
   - Present in schema, route geometry/presentation resolvers, store move/preview logic, export, and tests.
2. Drag preview state already flows through the store.
   - `previewControlPointMove()` updates `connectionRoutes` during drag and `commitInteraction()` preserves the interaction as one undoable edit.
3. The route renderer already responds to drag-time preview changes.
   - There is no current `isDragging` suppression in `map-editor-route-renderer.ts`, so this ticket must not add duplicate route-preview work.
4. The current architectural gap is renderer synchronization, not data modeling.
   - Tangent lines are rebuilt from store state, but drag-time rebuilds are intentionally skipped.
5. This ticket should preserve the existing no-full-rebuild-during-drag architecture.
   - The clean fix is to update existing tangent Graphics in place for the selected route while keeping the full rebuild path for non-drag transitions and drag-end reconciliation.

## Task

Modify the handle renderer's store subscriber so drag-time preview updates can synchronize tangent line Graphics in place while `isDragging` is true. Do not reintroduce full container teardown/rebuild during drag. Reuse the existing resolved route geometry from preview state and update only the tangent Graphics for the currently selected route.

**Approach:**
1. Keep the existing full `render()` path for initial render, route selection changes, non-drag document changes, and drag-end reconciliation.
2. Add a focused drag-time sync path in `map-editor-handle-renderer.ts` that:
   - resolves current route geometry from preview state
   - matches the existing tangent Graphics to quadratic segments in order
   - clears and redraws those Graphics with the preview positions
3. If drag-time geometry cannot be resolved or the selected route changes shape incompatibly, fall back to the existing full rebuild path instead of introducing partial-state hacks.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Add drag-time tangent sync while preserving the existing rebuild lifecycle |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` | Cover drag-time tangent updates and preserved rebuild behavior |

## Out of Scope

- Do NOT change the curve/route rendering during drag. The route renderer already responds to preview updates in the current codebase.
- Do NOT add the angle indicator (that is 84CUREDICONPOI-007)
- Do NOT change drag handler logic in `map-editor-drag.ts`
- Do NOT change the store preview/commit actions unless a test proves the current contract is broken
- Do NOT change the route geometry resolver unless a test proves the current contract is broken
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`
- Do NOT replace the full rebuild path. Non-drag renders and drag-end reconciliation should still rebuild as before.

## Acceptance Criteria

### Tests that must pass

1. **New test:** When `isDragging` is true and preview state updates, tangent line Graphics positions are updated to match the new control point position
2. **New test:** When `isDragging` is false, the full rebuild path is still used (existing behavior preserved)
3. **New test:** Drag-time tangent updates use preview geometry from the store, not the imperatively moved handle position alone
4. **New test:** Tangent line start/end pairs continue to match the resolved segment endpoints and resolved previewed control point
5. **Existing tests:** All existing handle renderer tests continue to pass

### Invariants

- Full rebuild still occurs when drag ends (on `commitInteraction`)
- Non-drag re-renders (route selection change, zoom, etc.) still use the existing rebuild path
- No new containers or children are created during the drag update — only Graphics geometry is modified
- Handle positions (diamond graphics) continue to update via the drag handler / existing rerender contract
- No engine code is modified (F1)
- No curvature aliases, backwards-compatibility shims, or duplicate preview architecture are introduced (F9)

### Foundations Alignment

- **F1:** Runner-only change
- **F7:** No state mutation outside the existing store actions — drag-time sync reads preview state and redraws Pixi Graphics only
- **F9:** Preserve one current route-editing architecture instead of layering an alternate drag-preview path on top

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- **Completion date:** 2026-03-26
- **What actually changed:** Reassessed the ticket against the live codebase, narrowed the scope to the real gap, and implemented drag-time tangent-line synchronization in `map-editor-handle-renderer.ts` by redrawing existing tangent Graphics from preview geometry while `isDragging` is true. Full rebuild behavior remains intact for non-drag updates and drag-end reconciliation.
- **Deviations from original plan:** No store, route-renderer, curvature-model, export, or visual-config changes were needed because those parts were already implemented in the current architecture. The route renderer already responds to preview updates, so this ticket stayed focused on the handle renderer only.
- **Verification results:** `pnpm -F @ludoforge/runner test` passed; `pnpm -F @ludoforge/runner typecheck` passed; `pnpm -F @ludoforge/runner lint` passed.

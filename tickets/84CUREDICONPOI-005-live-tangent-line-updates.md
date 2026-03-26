# 84CUREDICONPOI-005 — Live Tangent Line Updates During Drag

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3A
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

During control point drag, the tangent lines (white lines from endpoints to the control point) do not update because the handle renderer suppresses re-rendering while `isDragging` is true (~line 232). The user drags a handle without visual feedback showing how tangent lines change.

## Task

Modify the handle renderer's store subscriber to allow tangent line Graphics updates while `isDragging` is true. Instead of a full container teardown/rebuild during drag, update tangent line positions directly using the preview state from `previewControlPointMove`.

**Approach:**
1. During drag, identify the tangent line Graphics objects for the active control point handle
2. Update their line positions (start -> control point, control point -> end) using the preview position from the store
3. Avoid full rebuild — only update the Graphics geometry of the two tangent lines

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Update tangent line Graphics during drag instead of skipping render |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` | Test tangent line position updates during mock drag |

## Out of Scope

- Do NOT change the curve/route rendering during drag (that is 84CUREDICONPOI-006)
- Do NOT add the angle indicator (that is 84CUREDICONPOI-007)
- Do NOT change drag handler logic in `map-editor-drag.ts`
- Do NOT change the store preview/commit actions
- Do NOT change the route geometry resolver
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`
- Do NOT modify the full rebuild path (non-drag renders should still rebuild as before)

## Acceptance Criteria

### Tests that must pass

1. **New test:** When `isDragging` is true and preview state updates, tangent line Graphics positions are updated to match the new control point position
2. **New test:** When `isDragging` is false, the full rebuild path is still used (existing behavior preserved)
3. **New test:** Tangent line start points match segment endpoint positions
4. **New test:** Tangent line end points match the previewed control point position
5. **Existing tests:** All existing handle renderer tests continue to pass

### Invariants

- Full rebuild still occurs when drag ends (on `commitInteraction`)
- Non-drag re-renders (route selection change, zoom, etc.) still use the existing rebuild path
- No new containers or children are created during the drag update — only Graphics geometry is modified
- Handle positions (diamond graphics) still update independently via drag handler
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F7:** No state mutation — reads preview state from store

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

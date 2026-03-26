# 84CUREDICONPOI-006 — Live Curve Preview During Drag

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3B
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

During control point drag, the Bezier curve does not update in real-time. The route renderer (`map-editor-route-renderer.ts`) skips updates during drag for performance. This ticket removes the optimization for the selected route so the curve redraws as the control point moves.

## Assumption Reassessment (2026-03-26)

1. The current route renderer does not suppress drag-time updates. It already re-renders when `connectionRoutes`, `connectionAnchors`, `zonePositions`, or selection change.
2. The user-visible live curve preview behavior appears to be already satisfied by the active architecture; this ticket must therefore be treated as a regression-proofing reassessment ticket before any implementation work.
3. The remaining drag-preview architecture issue is not route redraw, but split ownership of drag visuals between imperative handle motion and renderer-driven geometry. That cleanup belongs in `tickets/84CUREDICONPOI-009-unify-drag-preview-visual-ownership.md`, not here.

## Note

Before implementing anything here, verify whether any missing behavior remains beyond additional route-renderer regression coverage. If no gap remains, this ticket should be closed or repurposed rather than used to introduce duplicate drag-preview logic.

## Task

Modify the route renderer's store subscriber to allow re-rendering of the **selected route** during drag. The `previewControlPointMove` action already updates the routes in the store — the route renderer just needs to respond to those changes.

**Approach:**
1. In the route renderer's change detection logic (~lines 108-119), allow re-render when the selected route's data has changed during drag
2. Only the selected route needs to update — other routes can still skip re-render during drag
3. The change detection should check if `connectionRoutes` changed for the selected route specifically

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-route-renderer.ts` | Allow selected route updates during drag |
| `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` | Test that selected route re-renders during drag preview |

## Out of Scope

- Do NOT change tangent line updates (that is 84CUREDICONPOI-005)
- Do NOT add the angle indicator (that is 84CUREDICONPOI-007)
- Do NOT change the handle renderer
- Do NOT change drag handler logic in `map-editor-drag.ts`
- Do NOT change the store preview/commit actions
- Do NOT change the route geometry resolver or curvature resolution
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`

## Acceptance Criteria

### Tests that must pass

1. **New test:** When `isDragging` is true and the selected route's preview state changes, the route renderer re-renders that route
2. **New test:** Non-selected routes do NOT re-render during drag (performance preserved)
3. **New test:** After drag ends (`commitInteraction`), normal render behavior resumes
4. **Existing tests:** All existing route renderer tests continue to pass

### Invariants

- Non-selected routes are not re-rendered during drag (performance)
- Route rendering after drag end uses committed state, not preview state
- The render output (Graphics commands) for a given route + control points is identical whether triggered during drag or after commit
- No new performance regressions for routes with many segments
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F7:** Reads immutable state from store

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

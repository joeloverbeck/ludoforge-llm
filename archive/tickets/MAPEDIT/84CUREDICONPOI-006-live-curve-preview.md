# 84CUREDICONPOI-006 — Live Curve Preview During Drag

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3B
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

Spec 84 originally assumed the route renderer skipped drag-time preview updates, leaving the Bézier curve visually stale during control-point drag. The current codebase does not behave that way: `map-editor-route-renderer.ts` already re-renders from preview-state document changes without any `isDragging` suppression. This ticket therefore needs to validate and document the existing architecture instead of adding selected-route drag exceptions.

## Assumption Reassessment (2026-03-26)

1. The current route renderer does not suppress drag-time updates. It already re-renders when `connectionRoutes`, `connectionAnchors`, `zonePositions`, or selection change.
2. `previewControlPointMove()` already updates store-backed route geometry during drag, so live curve preview is currently produced by the same state-driven render path used outside drag mode.
3. The original proposed optimization of "only the selected route re-renders during drag" is not present in the active architecture and should not be introduced without measured evidence. It would couple the renderer to drag mode and selection state for no verified benefit.
4. The real gap for this ticket is missing regression coverage that proves live curve preview remains state-driven during drag and after commit.
5. Any broader drag-preview cleanup around visual ownership belongs in `tickets/84CUREDICONPOI-009-unify-drag-preview-visual-ownership.md`, not here.

## Note

Before implementing anything here, verify whether any missing behavior remains beyond additional route-renderer regression coverage. If no gap remains, this ticket should close as a test/documentation ticket rather than introducing duplicate drag-preview logic.

## Task

Add regression tests that prove the route renderer already redraws curves from preview-state updates during drag and continues to reflect committed state after drag completion. Do not add drag-specific branching or selected-route-only redraw behavior unless a failing test demonstrates a real gap.

**Approach:**
1. Reassess the route renderer subscriber and confirm that drag-time preview updates already flow through the existing document-change render path.
2. Add focused tests in `map-editor-route-renderer.test.ts` that exercise `beginInteraction()`, `setDragging(true)`, `previewControlPointMove()`, and `commitInteraction()`.
3. Verify the curve geometry shown during drag matches the preview control point and that the same state-driven path still reflects committed geometry after drag end.

## Files to Touch

| File | Change |
|------|--------|
| `tickets/84CUREDICONPOI-006-live-curve-preview.md` | Correct ticket assumptions and narrow scope to regression-proofing |
| `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` | Add drag-preview regression coverage for the existing route-renderer architecture |

## Out of Scope

- Do NOT change tangent line updates (that is 84CUREDICONPOI-005)
- Do NOT add the angle indicator (that is 84CUREDICONPOI-007)
- Do NOT change the handle renderer
- Do NOT change drag handler logic in `map-editor-drag.ts`
- Do NOT change the store preview/commit actions
- Do NOT change the route geometry resolver or curvature resolution
- Do NOT introduce selected-route-only drag redraw logic unless a failing test proves the current state-driven renderer is insufficient
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`

## Acceptance Criteria

### Tests that must pass

1. **New test:** When `isDragging` is true and `previewControlPointMove()` updates the route, the rendered curve geometry updates from preview state in real time
2. **New test:** After drag ends (`commitInteraction()`), the renderer still reflects the committed geometry without requiring any alternate drag-specific code path
3. **New test:** Drag-time curve updates come from store-backed route state, not imperative handle motion alone
4. **Existing tests:** All existing route renderer tests continue to pass

### Invariants

- Route rendering remains document-state-driven; no drag-mode alias path is added
- Route rendering after drag end uses committed state, not a stale pre-drag snapshot
- The render output (Graphics commands) for a given route + control points is identical whether triggered during preview or after commit
- No engine code is modified (F1)
- No drag-specific selection optimization is added without measured need (F10)

### Foundations Alignment

- **F1:** Runner-only change
- **F7:** Reads immutable state from store
- **F10:** Prefer the simpler, already-correct renderer architecture over layering on drag/selection conditionals

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- **Completion date:** 2026-03-26
- **What actually changed:** Reassessed the ticket against the live codebase, corrected its assumptions and scope, and added route-renderer regression tests that prove live curve preview already updates from preview-state route changes during drag and still reflects committed geometry after drag end.
- **Deviations from original plan:** No `map-editor-route-renderer.ts` production change was made because the current architecture already satisfies the intended behavior. The proposed selected-route drag optimization would have added unnecessary drag/selection coupling without a demonstrated need.
- **Verification results:** `pnpm -F @ludoforge/runner test -- map-editor-route-renderer.test.ts` passed; `pnpm -F @ludoforge/runner test` passed; `pnpm -F @ludoforge/runner typecheck` passed; `pnpm -F @ludoforge/runner lint` passed.

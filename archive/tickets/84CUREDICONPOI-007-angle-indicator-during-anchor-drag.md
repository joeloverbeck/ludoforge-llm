# 84CUREDICONPOI-007 — Angle Indicator During Zone-Edge Anchor Drag

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3C
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

During zone-edge anchor endpoint drag, there is still no visual indication of the computed anchor angle. This ticket adds a transient BitmapText label in the handle layer, showing the active angle rounded to the nearest degree (for example, `"90deg"`), without introducing a separate drag-visual ownership path.

## Assumption Reassessment (2026-03-26)

1. The angle label is still unimplemented, so the user-facing gap remains real.
2. The ticket's original assumptions about the broader drag-preview stack are stale: handle event propagation is already fixed, selected-route curve preview already re-renders from preview state during drag, and tangent lines already sync in place from preview geometry.
3. The remaining architectural gap is narrower: `map-editor-drag.ts` still owns imperative handle-position updates for the actively dragged endpoint, while the handle renderer owns the rest of the handle-layer drag visuals.
4. This ticket should not create a new bespoke label lifecycle in `map-editor-drag.ts`. The cleaner design is to expose minimal ephemeral drag metadata and let the handle renderer remain the owner of transient handle-layer visuals.

## Note

`84CUREDICONPOI-009` is still the broader architectural cleanup ticket. This ticket should take the smallest clean step toward that direction now: define only the ephemeral drag metadata needed for anchor-angle display and keep the visual ownership in the renderer. It should not attempt the full unification refactor by itself.

## Task

1. Introduce a runner-local ephemeral drag-preview contract for zone-edge anchor drags:
   - active drag kind
   - dragged route/point identity
   - current snapped handle position
   - current anchor angle while the endpoint remains zone-linked
2. Have the handle renderer create, update, hide, and destroy the angle label from that drag-preview contract.
3. Clear the drag-preview metadata when the drag ends or is cancelled.

**Approach:**
- Reuse the snapped angle already computed during zone-edge anchor drag; do not duplicate angle math in the renderer
- Reuse the existing runner bitmap font/runtime helpers; do not introduce new assets
- Keep the label in the handle layer so it follows the same ownership boundary as handles and tangent lines
- Use ASCII `"deg"` suffix unless the existing bitmap font/runtime already proves the degree glyph is safe
- Hide the label after endpoint detachment, because the endpoint is no longer constrained to a zone-edge angle once it becomes a free anchor

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-store.ts` | Add minimal ephemeral drag-preview metadata/actions if required |
| `packages/runner/src/map-editor/map-editor-drag.ts` | Publish anchor-drag preview metadata; keep pointer-session ownership only |
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Render/update/clear the transient angle label from store state |
| `packages/runner/test/map-editor/map-editor-drag.test.ts` | Prove anchor-drag metadata lifecycle and detachment behavior |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` | Prove angle-label lifecycle and non-anchor exclusion |

## Out of Scope

- Do NOT show angle indicators for control point drags (only zone-edge anchor drags)
- Do NOT change the tangent line rendering (that is 84CUREDICONPOI-005)
- Do NOT change the curve preview (that is 84CUREDICONPOI-006)
- Do NOT change the angle computation itself
- Do NOT persist drag metadata or export it
- Do NOT add persistent angle labels (label only exists during drag)
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`

## Acceptance Criteria

### Tests that must pass

1. **New/updated test:** Zone-edge anchor drag publishes ephemeral preview metadata including the current snapped angle while the endpoint is zone-linked
2. **New/updated test:** Angle label is created/visible only for active zone-edge anchor drags and shows rounded degree text (for example `"45deg"` then `"90deg"`)
3. **New/updated test:** Angle label is cleared when drag ends or is cancelled
4. **New/updated test:** Angle label is cleared once the endpoint detaches into a free anchor
5. **New/updated test:** Non-anchor drags (control point drag, free-anchor drag, zone drag) do not create the angle label
6. **Existing tests:** All existing drag, route-preview, and handle-renderer tests continue to pass

### Invariants

- The angle label is a transient visual — it has no effect on state, store, or exported config
- Only ephemeral editor UI state may be added to the store; persisted document state and export output remain unchanged
- The label is parented to the handle-layer renderer container and is destroyed or cleared on drag end (no memory leaks)
- The angle computation logic is unchanged — only display is added
- No new bitmap font assets are required (reuse existing runner fonts)
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Display-only, no data model changes
- **F7:** Persisted document state remains immutable; any added drag metadata is ephemeral editor state only

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- **Completed**: 2026-03-26
- **What changed**:
  - Added runner-local ephemeral drag-preview metadata for zone-edge anchor drags in `map-editor-store.ts`
  - Updated `map-editor-drag.ts` to publish and clear zone-edge anchor preview metadata while keeping pointer-session logic local
  - Added a transient handle-layer BitmapText angle label in `map-editor-handle-renderer.ts`, driven from store preview metadata
  - Hid the label once the endpoint detaches into a free anchor or the drag ends/cancels
  - Added and strengthened map-editor drag and handle-renderer tests for the new lifecycle and invariants
- **Deviations from original plan**:
  - Did not add a bespoke label lifecycle directly inside `map-editor-drag.ts`; the renderer remains the owner of transient handle-layer visuals
  - Kept the display text as ASCII `deg` rather than introducing any new font/glyph dependency
- **Verification results**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

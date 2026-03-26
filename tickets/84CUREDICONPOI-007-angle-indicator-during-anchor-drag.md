# 84CUREDICONPOI-007 — Angle Indicator During Zone-Edge Anchor Drag

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 3C
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-001-fix-handle-event-propagation.md`
**Depends on:** 84CUREDICONPOI-001
**Blocks:** None

---

## Summary

During zone-edge anchor endpoint drag, there is no visual indication of the computed angle. This ticket adds a BitmapText label that appears during drag, showing the angle rounded to the nearest degree (e.g., `"90deg"`).

## Assumption Reassessment (2026-03-26)

1. The angle label is still unimplemented, so the user-facing gap remains real.
2. The active drag architecture already mixes imperative handle position updates with store-driven route/tangent geometry updates.
3. This ticket should not add another isolated drag-visual code path if `tickets/84CUREDICONPOI-009-unify-drag-preview-visual-ownership.md` lands first. The preferred implementation is to build on a shared drag-preview visual owner rather than layering bespoke label lifecycle logic onto `map-editor-drag.ts`.

## Note

If `84CUREDICONPOI-009` is completed first, implement the angle indicator on top of that shared drag-preview visual abstraction. If not, keep this ticket narrowly scoped and avoid duplicating geometry resolution or drag-session ownership in multiple places.

## Task

1. When a zone-edge anchor drag begins, create a BitmapText label positioned offset from the handle
2. During drag, update the label text with the current angle (degrees, rounded to nearest integer)
3. When drag ends, destroy the label

**Approach:**
- The angle is already computed during anchor endpoint drag — it's the angle the endpoint attaches at on the zone edge
- Create the BitmapText using the same bitmap font the runner already uses
- Position it with a small offset from the drag handle (e.g., 15-20px above/right)
- Use a readable font size and contrasting color for visibility

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` or `packages/runner/src/map-editor/map-editor-drag.ts` | Create/update/destroy BitmapText angle label during anchor drag |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` or `packages/runner/test/map-editor/map-editor-drag.test.ts` | Test angle label lifecycle |

## Out of Scope

- Do NOT show angle indicators for control point drags (only zone-edge anchor drags)
- Do NOT change the tangent line rendering (that is 84CUREDICONPOI-005)
- Do NOT change the curve preview (that is 84CUREDICONPOI-006)
- Do NOT change the angle computation itself
- Do NOT change the store or export logic
- Do NOT add persistent angle labels (label only exists during drag)
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`

## Acceptance Criteria

### Tests that must pass

1. **New test:** BitmapText label is created when zone-edge anchor drag begins
2. **New test:** Label text updates with current angle during drag (e.g., changes from `"45deg"` to `"90deg"`)
3. **New test:** Label is destroyed when drag ends
4. **New test:** Label is NOT created for non-anchor drags (e.g., control point drags)
5. **Existing tests:** All existing drag and handle renderer tests continue to pass

### Invariants

- The angle label is a transient visual — it has no effect on state, store, or exported config
- The label is parented to a container that is destroyed or cleared on drag end (no memory leaks)
- The angle computation logic is unchanged — only display is added
- No new bitmap font assets are required (reuse existing runner fonts)
- No engine code is modified (F1)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Display-only, no data model changes
- **F7:** No state mutation

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

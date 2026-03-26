# 84CUREDICONPOI-001 — Fix Diamond Handle Event Propagation

**Status**: COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 1
**Depends on:** None
**Blocks:** 84CUREDICONPOI-005, 84CUREDICONPOI-006, 84CUREDICONPOI-007

---

## Summary

Diamond control point handles in the map editor are not interactive. The cursor does not change to `grab` on hover, and click-drag pans the map instead of moving the handle.

**Reassessed root cause:** `packages/runner/src/map-editor/map-editor-handle-renderer.ts` sets `root.eventMode = 'none'` on the container wrapping all editor handles. In PixiJS v8, `eventMode = 'none'` prevents the event system from resolving hit tests on child elements, even with `interactiveChildren = true`. This diverges from the map-editor interaction layers, where the handle layer, route layer, and zone layer use `eventMode = 'passive'`.

**Reassessed test surface:** The existing regression surface is broader than a single property assertion. `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` already verifies handle construction, and `packages/runner/test/map-editor/map-editor-drag.test.ts` verifies the drag handlers that those handles must still drive after the container-level event fix.

## Task

Change `root.eventMode` from `'none'` to `'passive'` in the handle renderer's root container construction. Add a regression test asserting the correct `eventMode`, and keep the existing drag-handler behavior intact.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Change `root.eventMode = 'none'` to `root.eventMode = 'passive'` (~line 45) |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` | Add test: `root.eventMode === 'passive'` |

## Assumptions and Scope Update

- The issue is runner-only and localized to the editor handle renderer container; no engine or schema changes are required for this ticket.
- The fix should align the handle renderer with the existing map-editor layer contract rather than introduce new interaction abstractions.
- The acceptance surface includes both renderer configuration and the existing drag behavior already covered by `packages/runner/test/map-editor/map-editor-drag.test.ts`.
- Focused verification should invoke `vitest` directly. `pnpm -F @ludoforge/runner test -- --run ...` forwards arguments through the package script in a way that still executes unrelated runner tests.

## Out of Scope

- Do NOT modify any other renderer's `eventMode` settings
- Do NOT change the diamond polygon hit area geometry
- Do NOT change the drag handler logic (`map-editor-drag.ts`)
- Do NOT change the route renderer or any canvas presentation code
- Do NOT change visual-config types or schemas

## Acceptance Criteria

### Tests that must pass

1. **New test:** `map-editor-handle-renderer` — assert that the root container returned by the renderer has `eventMode === 'passive'`
2. **Existing tests:** All tests in `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` continue to pass
3. **Behavioral guard:** `packages/runner/test/map-editor/map-editor-drag.test.ts` continues to pass so the fix does not regress handle-driven drag preview/commit behavior

### Invariants

- The `interfaceGroup` (parent of handle renderer root) still renders above `connectionRouteLayer` — z-order is unchanged
- `interactiveChildren` on the root container remains `true`
- Diamond polygon hit area remains `(0,-10), (10,0), (0,10), (-10,0)`
- All other containers in the map editor retain their current `eventMode` values

### Verification commands

```bash
pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-handle-renderer.test.ts test/map-editor/map-editor-drag.test.ts
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- Completion date: 2026-03-26
- What actually changed: reassessed the ticket assumptions against the current runner architecture, narrowed the implementation to the real root cause in `map-editor-handle-renderer.ts`, changed the handle renderer root container from `eventMode = 'none'` to `eventMode = 'passive'`, and added regression coverage asserting the root interaction contract.
- Deviations from original plan: no broader architecture changes were needed. The reassessment expanded the ticket's verification scope to explicitly retain existing drag-handler behavior and corrected the focused test command to use direct `vitest` invocation.
- Verification results: `pnpm -F @ludoforge/runner exec vitest run test/map-editor/map-editor-handle-renderer.test.ts test/map-editor/map-editor-drag.test.ts`, `pnpm -F @ludoforge/runner test`, `pnpm -F @ludoforge/runner typecheck`, and `pnpm -F @ludoforge/runner lint` passed.

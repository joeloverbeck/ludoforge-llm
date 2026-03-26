# 84CUREDICONPOI-001 — Fix Diamond Handle Event Propagation

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 1
**Depends on:** None
**Blocks:** 84CUREDICONPOI-005, 84CUREDICONPOI-006, 84CUREDICONPOI-007

---

## Summary

Diamond control point handles in the map editor are not interactive. The cursor does not change to `grab` on hover, and click-drag pans the map instead of moving the handle.

**Root cause:** `map-editor-handle-renderer.ts` line 45 sets `root.eventMode = 'none'` on the container wrapping all editor handles. In PixiJS v8, `eventMode = 'none'` prevents the event system from resolving hit tests on child elements, even with `interactiveChildren = true`. Every other interactive container in the map editor uses `eventMode = 'passive'`.

## Task

Change `root.eventMode` from `'none'` to `'passive'` in the handle renderer's root container construction. Add a regression test asserting the correct `eventMode`.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/map-editor/map-editor-handle-renderer.ts` | Change `root.eventMode = 'none'` to `root.eventMode = 'passive'` (~line 45) |
| `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` | Add test: `root.eventMode === 'passive'` |

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

### Invariants

- The `interfaceGroup` (parent of handle renderer root) still renders above `connectionRouteLayer` — z-order is unchanged
- `interactiveChildren` on the root container remains `true`
- Diamond polygon hit area remains `(0,-10), (10,0), (0,10), (-10,0)`
- All other containers in the map editor retain their current `eventMode` values

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

# 84CUREDICONPOI-003 — Curvature Resolution Algorithm

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (resolution logic)
**Deps**: `tickets/84CUREDICONPOI-002-curvature-control-schema.md`
**Depends on:** 84CUREDICONPOI-002
**Blocks:** 84CUREDICONPOI-004, 84CUREDICONPOI-008

---

## Summary

Implement the pure function that resolves a `{ kind: 'curvature' }` control point into an absolute `{ x, y }` position given two endpoint positions. This resolution must be added to both the presentation resolver and the editor route geometry resolver.

## Algorithm

```
Given endpoints P0 and P1:
1. M = midpoint(P0, P1)
2. D = distance(P0, P1)
3. If angle is specified:
     direction = unit vector at angle (screen coords: 0deg=east, 90deg=north)
   Else:
     direction = perpendicular to (P0 -> P1), rotated left (counterclockwise)
4. controlPoint = M + direction * offset * D
```

Key behaviors:
- `offset = 0` -> control point at midpoint -> effectively straight line
- `offset = 0.3` -> gentle curve (30% of endpoint distance from midpoint)
- `offset = -0.3` -> gentle curve in the opposite direction

## Task

1. Add a shared pure function `resolveCurvatureControlPoint(p0, p1, offset, angle?)` that returns `{ x, y }`. Place it in a location importable by both resolvers (consider a shared utility or inline in both).
2. Add the `'curvature'` case to `resolveControlPoint()` in `connection-route-resolver.ts`.
3. Add the `'curvature'` case to `resolveControlPoint()` in `map-editor-route-geometry.ts`.
4. Add comprehensive unit tests for the resolution function.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/presentation/connection-route-resolver.ts` | Add `'curvature'` case to `resolveControlPoint()` |
| `packages/runner/src/map-editor/map-editor-route-geometry.ts` | Add `'curvature'` case to `resolveControlPoint()` |
| New or existing shared util (e.g., `packages/runner/src/utils/curvature-math.ts`) | Pure resolution function |
| `packages/runner/test/presentation/connection-route-resolver.test.ts` | Add curvature resolution tests |
| `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` | Add curvature resolution tests |
| New test file for shared util if created | Unit tests for `resolveCurvatureControlPoint` |

## Out of Scope

- Do NOT change the store actions (`moveControlPointInDocument`) — that is 84CUREDICONPOI-004
- Do NOT change the export serializer — that is 84CUREDICONPOI-004
- Do NOT change the renderers — that is 84CUREDICONPOI-004
- Do NOT change the schema types — that was 84CUREDICONPOI-002
- Do NOT change drag handlers or handle rendering
- Do NOT touch engine code
- Do NOT touch `visual-config.yaml`

## Acceptance Criteria

### Tests that must pass

1. **New test:** `offset = 0` with horizontal endpoints -> control point at midpoint
2. **New test:** `offset = 0` with vertical endpoints -> control point at midpoint
3. **New test:** `offset = 0.3` with horizontal endpoints -> control point offset perpendicular (above midpoint in screen coords)
4. **New test:** `offset = -0.3` -> control point offset in opposite perpendicular direction
5. **New test:** `offset = 1.0` -> aggressive curve (control point at distance D from midpoint)
6. **New test:** `angle = 0` (east) override -> control point offset due east from midpoint
7. **New test:** `angle = 90` (north) override -> control point offset due north from midpoint
8. **New test:** `angle = 180` (west) override -> control point offset due west from midpoint
9. **New test:** Presentation `resolveControlPoint` returns resolved position for curvature kind
10. **New test:** Editor `resolveControlPoint` returns resolved position for curvature kind
11. **Existing tests:** All existing resolver and route geometry tests continue to pass

### Invariants

- The resolution function is a pure function with no side effects (F7)
- `anchor` and `position` resolution paths are unchanged
- No engine code is modified (F1)
- All state transitions remain immutable (F7)

### Foundations Alignment

- **F1:** Runner-only change
- **F7:** Pure function, no side effects, no mutation

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

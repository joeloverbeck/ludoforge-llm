# 84CUREDICONPOI-002 — Add CurvatureControl Schema Type

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (schema layer)
**Depends on:** None
**Blocks:** 84CUREDICONPOI-003, 84CUREDICONPOI-004, 84CUREDICONPOI-008

---

## Summary

Add a `curvature` control point kind to the visual config schema. This expresses control points relative to endpoint midpoints rather than as absolute world coordinates, making them stable across layout engine changes.

## Task

1. Define `CurvatureControlSchema` as a new Zod v4 object schema.
2. Add it to the `ConnectionRouteControl` discriminated union.
3. Export the inferred type.
4. Add schema validation tests for the new kind.

## Schema Definition

```typescript
const CurvatureControlSchema = z.object({
  kind: z.literal('curvature'),
  offset: z.number(),                            // signed scalar: distance as fraction of endpoint span
  angle: z.number().min(0).max(360).optional(),   // override perpendicular direction (degrees)
}).strict();
```

The discriminated union `ConnectionRouteControl` must accept `anchor`, `position`, and `curvature` kinds.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/config/visual-config-types.ts` | Add `CurvatureControlSchema`, add to union, export type |
| `packages/runner/test/config/visual-config-types.test.ts` (new if needed, or add to existing) | Schema validation tests for curvature kind |

## Out of Scope

- Do NOT implement the curvature resolution algorithm (that is 84CUREDICONPOI-003)
- Do NOT change the store, export, or renderer logic (that is 84CUREDICONPOI-004)
- Do NOT modify the presentation resolver or editor route geometry
- Do NOT touch engine code (`packages/engine/`)
- Do NOT touch `visual-config.yaml` data files

## Acceptance Criteria

### Tests that must pass

1. **New test:** `CurvatureControlSchema` parses `{ kind: 'curvature', offset: 0.3 }` successfully
2. **New test:** `CurvatureControlSchema` parses `{ kind: 'curvature', offset: -0.5, angle: 45 }` successfully
3. **New test:** `CurvatureControlSchema` rejects `{ kind: 'curvature', offset: 0.3, angle: 400 }` (angle > 360)
4. **New test:** `CurvatureControlSchema` rejects `{ kind: 'curvature', offset: 0.3, angle: -10 }` (angle < 0)
5. **New test:** `CurvatureControlSchema` rejects extra properties (strict mode)
6. **New test:** `ConnectionRouteControl` union accepts all three kinds: `anchor`, `position`, `curvature`
7. **Existing tests:** All existing visual-config-types tests continue to pass

### Invariants

- Existing `ConnectionRouteControlAnchorSchema` and `ConnectionRouteControlPositionSchema` are unchanged
- `QuadraticConnectionRouteSegmentSchema` accepts the new control kind without modification (it already accepts the union)
- `StraightConnectionRouteSegmentSchema` is unchanged
- No engine code is modified (F1: Engine Agnostic)
- Visual config types remain in runner package (F3: Visual Separation)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Schema lives in visual-config-types, not GameSpecDoc
- **F9:** No backwards compatibility shims — existing kinds remain valid through the union

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

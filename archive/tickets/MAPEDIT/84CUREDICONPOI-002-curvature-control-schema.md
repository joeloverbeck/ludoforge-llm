# 84CUREDICONPOI-002 — Add Curvature Control Kind Across Runner Route Surfaces

**Status**: ✅ COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (curvature control model)
**Deps**: None
**Depends on:** None
**Blocks:** 84CUREDICONPOI-003, 84CUREDICONPOI-004, 84CUREDICONPOI-008

---

## Reassessed Summary

Add a `curvature` control point kind to runner route definitions and support it consistently across schema validation, route resolution, editor state cloning/mutation, and YAML export. The new kind expresses a control point relative to segment endpoints rather than as an absolute world coordinate, which makes authored curves resilient to layout changes.

## Reassessed Assumptions

1. The handle event-propagation fix from Spec 84 Deliverable 1 is already present.
   `packages/runner/src/map-editor/map-editor-handle-renderer.ts` already uses `root.eventMode = 'passive'`, and `packages/runner/test/map-editor/map-editor-handle-renderer.test.ts` already asserts that behavior.
2. There is no dedicated `packages/runner/test/config/visual-config-types.test.ts`.
   The relevant schema coverage currently lives in `packages/runner/test/config/visual-config-schema.test.ts`.
3. A schema-only change is not sufficient in the current architecture.
   `ConnectionRouteControl` is pattern-matched in multiple runner surfaces:
   - `packages/runner/src/presentation/connection-route-resolver.ts`
   - `packages/runner/src/map-editor/map-editor-route-geometry.ts`
   - `packages/runner/src/map-editor/map-editor-store.ts`
   - `packages/runner/src/map-editor/map-editor-export.ts`
   Adding a third control kind without updating these surfaces would make the schema accept data that the runner cannot resolve, edit, or export.
4. The current code already contains reusable quadratic geometry helpers in `packages/runner/src/canvas/geometry/bezier-utils.ts`.
   Curvature resolution should be implemented as shared geometry logic, not duplicated independently in presentation and editor code.

## Task

1. Define `CurvatureControlSchema` as a new Zod v4 object schema.
2. Add it to the `ConnectionRouteControl` discriminated union.
3. Export the inferred type.
4. Add shared runner support so `curvature` controls are resolved anywhere `ConnectionRouteControl` is consumed.
5. Add or strengthen tests for schema parsing, route resolution, editor behavior, and export round-tripping.

## Schema Definition

```typescript
const CurvatureControlSchema = z.object({
  kind: z.literal('curvature'),
  offset: z.number(),                            // signed scalar: distance as fraction of endpoint span
  angle: z.number().min(0).max(360).optional(),   // override perpendicular direction (degrees)
}).strict();
```

The discriminated union `ConnectionRouteControl` must accept `anchor`, `position`, and `curvature` kinds.

## Scope

This ticket owns the full runner adoption needed to keep `ConnectionRouteControl` coherent:

- `packages/runner/src/config/visual-config-types.ts`
- Shared curvature resolution helper(s), preferably in existing route/bezier geometry code
- `packages/runner/src/presentation/connection-route-resolver.ts`
- `packages/runner/src/map-editor/map-editor-route-geometry.ts`
- `packages/runner/src/map-editor/map-editor-store.ts`
- `packages/runner/src/map-editor/map-editor-export.ts`
- Relevant runner tests

This ticket does not own FITL data migration or UX-only follow-up work from other Spec 84 deliverables.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/config/visual-config-types.ts` | Add `CurvatureControlSchema`, add to union, export type |
| `packages/runner/src/presentation/connection-route-resolver.ts` | Resolve curvature controls for presentation routes |
| `packages/runner/src/map-editor/map-editor-route-geometry.ts` | Resolve curvature controls for editor geometry |
| `packages/runner/src/map-editor/map-editor-store.ts` | Preserve/edit/compare curvature controls in store state |
| `packages/runner/src/map-editor/map-editor-export.ts` | Preserve curvature controls during export |
| `packages/runner/test/config/visual-config-schema.test.ts` | Schema validation tests for curvature kind |
| `packages/runner/test/presentation/connection-route-resolver.test.ts` | Presentation curvature resolution tests |
| `packages/runner/test/map-editor/map-editor-route-geometry.test.ts` | Editor curvature resolution tests |
| `packages/runner/test/map-editor/map-editor-store.test.ts` | Store invariants for curvature controls |
| `packages/runner/test/map-editor/map-editor-export.test.ts` | Export round-trip tests for curvature controls |

## Out of Scope

- Do NOT migrate FITL `visual-config.yaml` data in this ticket
- Do NOT implement live drag-feedback UX changes from Spec 84 Deliverable 3
- Do NOT touch engine code (`packages/engine/`)
- Do NOT touch `visual-config.yaml` data files

Note:
The previous ticket draft said not to change resolver/store/export logic, but that assumption was incorrect for the current codebase and is superseded here.

## Acceptance Criteria

### Tests that must pass

1. `VisualConfigSchema` accepts `{ kind: 'curvature', offset: 0.3 }`
2. `VisualConfigSchema` accepts `{ kind: 'curvature', offset: -0.5, angle: 45 }`
3. `VisualConfigSchema` rejects `{ kind: 'curvature', offset: 0.3, angle: 400 }`
4. `VisualConfigSchema` rejects `{ kind: 'curvature', offset: 0.3, angle: -10 }`
5. `VisualConfigSchema` rejects extra properties on curvature controls
6. Presentation route resolution resolves `curvature` controls deterministically from segment endpoints
7. Editor route geometry resolves `curvature` controls deterministically from segment endpoints
8. Store cloning, equality, edits, and export preserve `curvature` controls without degrading them into `position`
9. Existing runner route tests continue to pass

### Invariants

- Existing `anchor` and `position` control kinds continue to parse and resolve unchanged
- `QuadraticConnectionRouteSegmentSchema` accepts the new control kind through the union
- `StraightConnectionRouteSegmentSchema` remains unchanged
- `curvature` control resolution is pure and deterministic
- No engine code is modified (F1: Engine Agnostic)
- Visual config types remain in runner package (F3: Visual Separation)
- No compatibility aliases or fallback shims are introduced for route controls (F9)

### Foundations Alignment

- **F1:** Runner-only change
- **F3:** Schema lives in visual-config-types, not GameSpecDoc
- **F5:** Curvature resolution must be deterministic for the same endpoints and config
- **F9:** No backwards compatibility shims — route controls are handled through a single current union
- **F10:** Shared control-point logic should be centralized rather than duplicated across runner surfaces

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Added `curvature` to the runner visual-config schema and exported type surface.
  - Centralized curvature geometry math in `packages/runner/src/canvas/geometry/bezier-utils.ts`.
  - Updated presentation resolution, editor geometry, store behavior, provider cloning, and export serialization to handle `curvature` as a first-class control kind.
  - Changed editor segment conversion to seed new quadratic segments as `{ kind: 'curvature', offset: 0 }` instead of creating new absolute `position` controls.
  - Added targeted tests for schema parsing, shared geometry math, presentation resolution, editor geometry, store edits, route-renderer behavior, and export round-tripping.
- Deviations from original plan:
  - The original ticket assumed a schema-only change. The current architecture required full runner-surface adoption to avoid accepting config the runner could not actually resolve or preserve.
  - The original ticket referenced a non-existent dedicated schema test file; coverage was added to the existing config schema suite instead.
  - The implementation went further than merely "accepting" curvature by removing the architectural drift toward new absolute control points in editor-created curves.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

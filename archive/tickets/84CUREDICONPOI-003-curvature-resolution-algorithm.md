# 84CUREDICONPOI-003 — Curvature Resolution Algorithm

**Status**: ✅ COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 2 (resolution logic)
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-002-curvature-control-schema.md`
**Depends on:** 84CUREDICONPOI-002
**Blocks:** 84CUREDICONPOI-004, 84CUREDICONPOI-008

---

## Reassessed Summary

The original resolver-integration scope for this ticket is already satisfied by `84CUREDICONPOI-002`. The remaining work is to make the shared curvature math architecturally canonical in the editor move path and to add the missing tests that prove signed-offset behavior instead of allowing equivalent-but-different representations.

## Reassessed Assumptions

1. Shared curvature resolution already exists and is the correct architecture.
   `packages/runner/src/canvas/geometry/bezier-utils.ts` already exports `resolveCurvatureControlPoint()`, and both route resolvers already consume it:
   - `packages/runner/src/presentation/connection-route-resolver.ts`
   - `packages/runner/src/map-editor/map-editor-route-geometry.ts`
2. The ticket's original resolver task list is stale.
   The presentation and editor resolvers already accept `control.kind === 'curvature'`, so reimplementing that work would be duplicate churn.
3. Current test coverage proves basic resolution, but it does not fully prove canonical signed-offset behavior.
   Existing tests cover positive offsets and angle overrides, but do not lock down:
   - negative perpendicular offsets
   - vertical-endpoint midpoint behavior
   - canonical derivation of edited curvature controls without unnecessary `angle` aliases
4. The editor move path currently owns the remaining architectural risk.
   `packages/runner/src/map-editor/map-editor-store.ts` derives new `curvature` controls from dragged control-point positions. If this derivation emits explicit `angle` values for bends that could be represented as signed perpendicular offsets, edited routes become less relational and more brittle when endpoints later move.

## Architectural Decision

The current architecture is better than the original ticket proposal in one key way: shared geometry logic is already centralized, which is the durable design and should remain the baseline.

The remaining improvement is also architectural rather than cosmetic:

- Prefer a single canonical representation for default perpendicular curvature.
- Use signed `offset` with no `angle` when the dragged control point lies on the segment's implicit perpendicular axis.
- Only emit an explicit `angle` when the user has actually authored a non-perpendicular bend direction.

This avoids aliasing between equivalent shapes such as:

- `{ kind: 'curvature', offset: -0.5 }`
- `{ kind: 'curvature', offset: 0.5, angle: 90 }`

Those forms may resolve to the same point for one endpoint arrangement, but they do not behave the same if endpoints later move. Canonicalizing editor-derived controls keeps the relative-curvature model robust and extensible.

## Task

1. Keep `resolveCurvatureControlPoint()` as the shared resolution source of truth.
2. Update shared derivation math so editor-moved curvature controls preserve the canonical signed-offset model when possible.
3. Strengthen unit tests around shared curvature math and store behavior.
4. Do not duplicate curvature math in presentation/editor resolvers.

## Files to Touch

| File | Change |
|------|--------|
| `packages/runner/src/canvas/geometry/bezier-utils.ts` | Canonical curvature derivation for editor-authored control points |
| `packages/runner/src/map-editor/map-editor-store.ts` | Consume canonical derived curvature values through existing move path |
| `packages/runner/test/canvas/geometry/bezier-utils.test.ts` | Add signed-offset and canonical-derivation tests |
| `packages/runner/test/map-editor/map-editor-store.test.ts` | Add store tests proving editor moves preserve canonical curvature representation |

## Out of Scope

- Do NOT re-add `'curvature'` cases to resolver code that already has them
- Do NOT change schema types — that was completed in `84CUREDICONPOI-002`
- Do NOT change export serialization unless the canonicalization work reveals a concrete bug there
- Do NOT change renderers or live drag-feedback UX
- Do NOT migrate FITL `visual-config.yaml` data in this ticket
- Do NOT touch engine code

## Acceptance Criteria

### Tests that must pass

1. Shared curvature math resolves midpoint correctly for zero offset on horizontal endpoints
2. Shared curvature math resolves midpoint correctly for zero offset on vertical endpoints
3. Shared curvature math resolves negative perpendicular offsets
4. Shared curvature math resolves explicit angle overrides in screen coordinates
5. Shared curvature derivation returns signed `offset` with no `angle` when the control lies on the implicit perpendicular axis
6. Editor store control-point moves preserve canonical `curvature` controls instead of degrading them into unnecessary angle aliases
7. Existing runner route tests continue to pass

### Invariants

- `resolveCurvatureControlPoint()` remains pure and deterministic
- Presentation and editor resolvers continue to share the same resolution logic
- Canonical editor-derived curvature controls avoid aliasing for the default perpendicular case
- Existing `anchor` and `position` behavior remains unchanged
- No engine code is modified

### Foundations Alignment

- **F1:** Runner-only change
- **F5:** Same endpoints + same control = identical resolved point and derived control
- **F7:** Pure geometry helpers, no side effects
- **F9:** No alias paths or compatibility shims; prefer one canonical authored form where possible
- **F10:** Shared geometry logic remains centralized rather than duplicated

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Rewrote this ticket to match the current codebase instead of re-requesting curvature resolver work that had already landed in `84CUREDICONPOI-002`.
  - Canonicalized shared curvature derivation in `packages/runner/src/canvas/geometry/bezier-utils.ts` so editor-authored default bends stay as signed `offset` values without unnecessary `angle` aliases.
  - Strengthened runner tests around negative offsets, vertical midpoint behavior, non-perpendicular explicit angles, and store-level control-point moves.
- Deviations from original plan:
  - The original ticket assumed presentation/editor resolver integration was still pending; that assumption was wrong and was removed from scope.
  - The useful remaining work was in editor derivation semantics and invariants, not in adding another copy of curvature resolution logic.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

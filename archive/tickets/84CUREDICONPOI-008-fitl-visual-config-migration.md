# 84CUREDICONPOI-008 — FITL Visual Config Migration to Curvature

**Status**: ✅ COMPLETED

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 4
**Deps**: `archive/tickets/MAPEDIT/84CUREDICONPOI-002-curvature-control-schema.md`, `archive/tickets/84CUREDICONPOI-003-curvature-resolution-algorithm.md`, `archive/tickets/84CUREDICONPOI-004-curvature-store-export-renderer.md`
**Depends on:** 84CUREDICONPOI-002, 84CUREDICONPOI-003, 84CUREDICONPOI-004
**Blocks:** None

---

## Summary

Two FITL routes still use legacy `{ kind: position }` control points with absolute world coordinates. In the current runner architecture, `curvature` is already the canonical relative control model for layout-resilient bends, so these FITL routes should be migrated to `{ kind: curvature }` and backed by FITL-specific regression expectations that prove the authored data stays correct.

## Reassessed Assumptions

1. `curvature` support is already implemented across the runner.
   The schema, shared geometry math, presentation resolver, editor geometry, store move path, and export path already support `control.kind === 'curvature'`:
   - `packages/runner/src/config/visual-config-types.ts`
   - `packages/runner/src/canvas/geometry/bezier-utils.ts`
   - `packages/runner/src/presentation/connection-route-resolver.ts`
   - `packages/runner/src/map-editor/map-editor-route-geometry.ts`
   - `packages/runner/src/map-editor/map-editor-store.ts`
   - `packages/runner/src/config/connection-route-utils.ts`
2. The original “data-only” assumption is incorrect for this repo.
   `packages/runner/test/config/visual-config-files.test.ts` contains a FITL fixture snapshot that hardcodes the old absolute `{ kind: 'position' }` controls. Migrating the YAML without updating that regression would leave the ticket internally inconsistent.
3. This migration is architecturally beneficial relative to the current data.
   Relative curvature survives layout changes because it is resolved from live endpoints, while absolute world coordinates are brittle and can produce distorted curves when zones move.
4. No new renderer or editor architecture is needed for this ticket.
   The clean architecture already exists: authored route data stays declarative in `visual-config.yaml`, and the runner resolves that data through shared geometry utilities. This ticket should adopt that architecture in FITL data rather than introduce any new aliases or per-route code paths.

## Architectural Decision

The proposed change is better than the current FITL route data and aligns with the current architecture:

- Keep authored route bends relational, not absolute.
- Prefer `{ kind: 'curvature', offset }` for endpoint-relative curves.
- Do not preserve or re-author legacy absolute control points when the shared runner model already supports the cleaner representation.

This ticket should remain narrowly scoped. The right architectural move is not a broader refactor; it is to finish the FITL migration onto the already-established curvature model and strengthen the FITL regression proof around it.

## Task

1. Update two route entries in FITL `visual-config.yaml`:

| Route | Current Control | New Control |
|-------|----------------|-------------|
| `loc-hue-da-nang:none` (~line 166) | `{ kind: position, x: 480, y: 40 }` | `{ kind: curvature, offset: 0.3 }` |
| `loc-saigon-an-loc-ban-me-thuot:none` (~line 205) | `{ kind: position, x: 500, y: 200 }` | `{ kind: curvature, offset: 0.3 }` |

2. Update FITL-specific regression expectations so tests assert the new canonical route definitions instead of the retired absolute coordinates.
3. Add or strengthen FITL regression coverage if needed so the migrated routes are proven to parse, validate, and resolve through the existing shared curvature path.

The `0.3` offset is a reasonable starting default producing a gentle curve. It may be tuned if test-backed visual reassessment shows a clearly better value, but do not introduce angle overrides or fall back to absolute positions unless the current architecture is proven insufficient.

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake/visual-config.yaml` | Replace two `{ kind: position, ... }` entries with `{ kind: curvature, offset: 0.3 }` |
| `packages/runner/test/config/visual-config-files.test.ts` | Update FITL route expectations and any FITL-specific regression assertions that still encode the old absolute controls |

## Out of Scope

- Do NOT change any `{ kind: straight }` routes (all other FITL routes)
- Do NOT change any `{ kind: anchor }` control points
- Do NOT change route endpoints (the `points` arrays)
- Do NOT change segment kinds (they remain `quadratic`)
- Do NOT add new routes or modify route topology
- Do NOT add new curvature infrastructure in runner code unless reassessment finds a concrete missing capability
- Do NOT broaden this into a map-editor UX or renderer-refactor ticket
- Do NOT change Texas Hold'em visual config (if it exists)
- Do NOT touch engine code

## Acceptance Criteria

### Tests that must pass

1. `packages/runner/test/config/visual-config-files.test.ts` passes with FITL route expectations updated to `curvature`
2. FITL visual config still passes schema + reference validation through the existing production-config tests
3. FITL route resolution still succeeds through the shared resolver path after the migration
4. `pnpm -F @ludoforge/runner test` passes
5. `pnpm -F @ludoforge/runner typecheck` passes
6. `pnpm -F @ludoforge/runner lint` passes

### Invariants

- All other routes in `visual-config.yaml` are unchanged
- The two modified routes still use `quadratic` segments — only the control point kind changes
- Route endpoints (zone references, anchor angles) are unchanged
- The migrated routes use the existing canonical relative-control model rather than authored absolute coordinates
- No engine code is modified
- The visual-config.yaml remains valid against the schema (including the new `curvature` kind from 84CUREDICONPOI-002)

### Foundations Alignment

- **F1:** No engine code touched
- **F3:** Visual data stays in visual-config.yaml
- **F9:** No backwards compatibility shims — the old `position` entries are replaced, not aliased
- **F10:** Prefer the existing shared relative-curvature architecture over brittle FITL-specific absolute control data

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - Rewrote the ticket to match the current runner architecture before implementation.
  - Migrated the two FITL quadratic route controls from absolute `{ kind: position }` data to canonical `{ kind: 'curvature', offset: 0.3 }`.
  - Updated FITL visual-config regression coverage in `packages/runner/test/config/visual-config-files.test.ts` so it asserts the authored curvature controls and verifies their resolved geometry through the shared curvature helper instead of flattening every non-anchor control into absolute positions.
- Deviations from original plan:
  - The original ticket claimed this should be a data-only change with no code-file edits. That assumption was false because the FITL regression fixture encoded the retired absolute controls and had to be updated to stay truthful.
  - No new runner architecture was added because schema, resolver, store, export, and geometry support for `curvature` were already present and were the better long-term design.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner lint` ✅

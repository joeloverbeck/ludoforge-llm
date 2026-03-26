# 84CUREDICONPOI-008 — FITL Visual Config Migration to Curvature

**Spec:** 84 (Curve Editing & Control Point UX), Deliverable 4
**Deps**: `tickets/84CUREDICONPOI-002-curvature-control-schema.md`, `tickets/84CUREDICONPOI-003-curvature-resolution-algorithm.md`, `tickets/84CUREDICONPOI-004-curvature-store-export-renderer.md`
**Depends on:** 84CUREDICONPOI-002, 84CUREDICONPOI-003, 84CUREDICONPOI-004
**Blocks:** None

---

## Summary

Two FITL routes currently use `{ kind: position }` control points with absolute world coordinates that do not correspond to actual zone positions computed by the ForceAtlas2 layout engine. Migrate both to `{ kind: curvature }` with relative offsets.

## Task

Update two route entries in the FITL visual-config.yaml:

| Route | Current Control | New Control |
|-------|----------------|-------------|
| `loc-hue-da-nang:none` (~line 166) | `{ kind: position, x: 480, y: 40 }` | `{ kind: curvature, offset: 0.3 }` |
| `loc-saigon-an-loc-ban-me-thuot:none` (~line 205) | `{ kind: position, x: 500, y: 200 }` | `{ kind: curvature, offset: 0.3 }` |

The `0.3` offset is a reasonable starting default producing a gentle curve. Exact values can be visually tuned in the map editor after handles are interactive (84CUREDICONPOI-001).

## Files to Touch

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake/visual-config.yaml` | Replace two `{ kind: position, ... }` entries with `{ kind: curvature, offset: 0.3 }` |

## Out of Scope

- Do NOT change any `{ kind: straight }` routes (all other FITL routes)
- Do NOT change any `{ kind: anchor }` control points
- Do NOT change route endpoints (the `points` arrays)
- Do NOT change segment kinds (they remain `quadratic`)
- Do NOT add new routes or modify route topology
- Do NOT change any code files — this is a data-only change
- Do NOT change Texas Hold'em visual config (if it exists)
- Do NOT touch engine code

## Acceptance Criteria

### Tests that must pass

1. **Verification:** `pnpm -F @ludoforge/runner typecheck` passes (visual-config.yaml parses against updated schema)
2. **Verification:** `pnpm -F @ludoforge/runner test` passes — any tests that load FITL visual config continue to work
3. **Manual verification:** The Hue-Da Nang road renders as a gentle arc (not a wild loop) in the map editor
4. **Manual verification:** The Saigon-An Loc-Ban Me Thuot road renders with a reasonable curve

### Invariants

- All other routes in `visual-config.yaml` are unchanged
- The two modified routes still use `quadratic` segments — only the control point kind changes
- Route endpoints (zone references, anchor angles) are unchanged
- No code files are modified — this is purely a data migration
- The visual-config.yaml remains valid against the schema (including the new `curvature` kind from 84CUREDICONPOI-002)

### Foundations Alignment

- **F1:** No engine code touched
- **F3:** Visual data stays in visual-config.yaml
- **F9:** No backwards compatibility shims — the old `position` entries are replaced, not aliased

### Verification commands

```bash
pnpm -F @ludoforge/runner test
pnpm -F @ludoforge/runner typecheck
pnpm -F @ludoforge/runner lint
```

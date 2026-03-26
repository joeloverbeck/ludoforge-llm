# 83ZONEDGANCEND-007: FITL Visual Config Anchor Values

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only (data file only)
**Deps**: `archive/tickets/83ZONEDGANCEND-001-schema-extension-and-export-serialization.md`, `archive/tickets/83ZONEDGANCEND/83ZONEDGANCEND-003-presentation-resolver-integration.md`

## Problem

The FITL visual config has connection routes where endpoints attach to zone centers, producing visually incorrect connector routing. The canonical example is the Hue↔Da Nang road, where the curve departs and arrives at zone centers instead of the correct edges (south of Hue, north of Da Nang).

## Assumption Reassessment (2026-03-26)

1. FITL visual config is at `data/games/fire-in-the-lake/visual-config.yaml`.
2. The Hue↔Da Nang route uses zone endpoints `da-nang:none` and `hue:none` without `anchor` values.
3. Other FITL routes may benefit from anchor values — a full audit of connection routes is needed.
4. Anchor values use degrees from positive x-axis (east), counterclockwise, with screen y inversion.

## Architecture Check

1. This is purely a data file change — no code modifications (F3).
2. The `anchor` field is additive and optional — existing YAML parsing is unaffected (F9).
3. No engine or game-specific code changes (F1).

## What to Change

### 1. Add `anchor` values to Hue↔Da Nang route

The primary motivating example from the spec:

```yaml
"loc-hue-da-nang:none":
  points:
    - { kind: zone, zoneId: "da-nang:none", anchor: 90 }
    - { kind: zone, zoneId: "hue:none", anchor: 270 }
  segments:
    - kind: quadratic
      control: { kind: position, x: 480, y: 40 }
```

### 2. Audit other FITL connection routes

Review all connection routes in the FITL visual config. For each route where the center attachment produces visually incorrect connector routing, add appropriate `anchor` values. Routes where center attachment is acceptable can be left unchanged.

**Audit criteria**:
- Long routes connecting distant zones: likely need anchors for directional clarity
- Short routes between adjacent zones: center attachment may be acceptable
- Routes with control points that suggest a specific direction: should have anchors matching

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify)

## Out of Scope

- Code changes — all handled in tickets 001-006
- Texas Hold'em visual config (if it exists — no connection routes expected)
- Creating new routes or modifying route segments/control points
- Changing zone positions or dimensions

## Acceptance Criteria

### Tests That Must Pass

1. `data/games/fire-in-the-lake/visual-config.yaml` parses successfully via `VisualConfigSchema`
2. Visual verification: Hue↔Da Nang road connects from south of Hue to north of Da Nang in the runner (`pnpm -F @ludoforge/runner dev`)
3. Visual verification: no routes render with obviously wrong attachment points
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All existing routes without `anchor` continue to render at zone center (backward compat).
2. No schema validation errors introduced.
3. No code changes in this ticket — data-only.

## Test Plan

### New/Modified Tests

1. No new test files — this is a data-only change
2. Existing visual config parsing tests (if any) must continue to pass

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner dev` — visual verification in browser

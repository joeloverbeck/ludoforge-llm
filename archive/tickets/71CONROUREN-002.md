# 71CONROUREN-002: Visual Config Schema Extension for Connection Routes

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The visual config system has no concept of connection-route zones. To render LoCs as curves instead of rectangles, the config layer must:
1. Recognize `'connection'` as a valid `ZoneShape`
2. Define a `ConnectionStyleConfig` schema for stroke/wave parameters
3. Support `connectionStyles` in zones config and `connectionStyleKey` in zone style resolution
4. Provide both a `resolveConnectionStyle()` method on `VisualConfigProvider` and a resolved `connectionStyleKey` on `ResolvedZoneVisual`
5. Handle `'connection'` as a no-op in `drawZoneShape()` (since connection zones are drawn by a dedicated renderer, not the zone renderer)

## Assumption Reassessment (2026-03-21)

1. `ZoneShape` is currently `'rectangle' | 'circle' | 'hexagon' | 'diamond' | 'ellipse' | 'triangle' | 'line' | 'octagon'` in `visual-config-defaults.ts` — confirmed, `'connection'` is not present.
2. `ZoneShapeSchema` in `visual-config-types.ts` is separately authoritative and must be updated in lockstep with the `ZoneShape` TypeScript union. Updating only `visual-config-defaults.ts` is insufficient.
3. `ZonesConfigSchema` in `visual-config-types.ts` has `categoryStyles`, `attributeRules`, `overrides`, `layoutRoles`, `tokenLayouts`, `hiddenZones`, `markerBadge` — but no `connectionStyles` field.
4. `ResolvedZoneVisual` in `visual-config-provider.ts` currently exposes only `shape`, `width`, `height`, and `color`. If `connectionStyleKey` is added only to the input schema, the runtime drops it and later renderer/resolver phases cannot consume it.
5. `drawZoneShape()` in `shape-utils.ts` has cases for all 8 current shapes — needs a `'connection'` no-op case.
6. `VisualConfigProvider` in `visual-config-provider.ts` has `resolveZoneVisual()` and `resolveEdgeStyle()` — no `resolveConnectionStyle()`.
7. Existing FITL bootstrap coverage in `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` currently asserts `loc` resolves to `shape: 'line'`. That expectation remains correct in this ticket because FITL data migration is handled separately in `71CONROUREN-006`.

## Architecture Check

1. Adding a new shape to the union and a new config section is a clean extension. The fallback chain (categoryStyles → attributeRules → overrides) should continue to own connection-style resolution, but only if `connectionStyleKey` is promoted into the resolved runtime contract instead of living solely in raw schema input.
2. `ConnectionStyleConfig` is generic (stroke, wave params) — not FITL-specific. Any game can define connection styles. Aligns with F1 and F3.
3. The clean architecture is to keep connection styling with other zone-style resolution, not to invent a parallel alias/fallback path later in the renderer. `ResolvedZoneVisual.connectionStyleKey` becomes the single resolved handoff from config rules to connection-route presentation.
4. No backwards-compat shims — `'line'` shape remains valid as a distinct shape, and FITL migration to `'connection'` happens in a separate ticket (`71CONROUREN-006`). Aligns with F9.

## What to Change

### 1. Add `'connection'` to the zone-shape contracts

In `packages/runner/src/config/visual-config-defaults.ts`, append `'connection'` to the `ZoneShape` type.

In `packages/runner/src/config/visual-config-types.ts`, append `'connection'` to `ZoneShapeSchema`.

### 2. Add `ConnectionStyleConfig` and extend zones config

In `packages/runner/src/config/visual-config-types.ts`:
- Define `ConnectionStyleConfigSchema` with fields: `strokeWidth` (number), `strokeColor` (string), `strokeAlpha` (number, optional), `wavy` (boolean, optional), `waveAmplitude` (number, optional), `waveFrequency` (number, optional).
- Infer `ConnectionStyleConfig` type from the schema.
- Add `connectionStyles: z.record(z.string(), ConnectionStyleConfigSchema).optional()` to `ZonesConfigSchema`.
- Add `connectionStyleKey` (string, optional) to the zone style schema used by category styles, attribute rules, and overrides, so rules can resolve zones to named connection styles without creating a parallel config path.

### 3. Extend `VisualConfigProvider`

In `packages/runner/src/config/visual-config-provider.ts`:
- Extend `ResolvedZoneVisual` with `connectionStyleKey: string | null`.
- Ensure `resolveZoneVisual()` merges `connectionStyleKey` through the same precedence chain as other zone-style fields.
- Add `resolveConnectionStyle(styleKey: string): ConnectionStyleConfig | null`.
- Implement `resolveConnectionStyle()` as `config.zones.connectionStyles?.[styleKey] ?? null`.

### 4. Add `'connection'` no-op to `drawZoneShape()`

In `packages/runner/src/canvas/renderers/shape-utils.ts`, add a case for `'connection'` that returns immediately without drawing. Connection zones are rendered by the connection-route renderer, not the zone renderer.

### 5. Keep structural equality aligned with the new resolved visual contract

In `packages/runner/src/model/project-render-model.ts`, include `visual.connectionStyleKey` in zone structural equality so render-model stabilization reflects the full resolved visual contract.

## Files to Touch

- `packages/runner/src/config/visual-config-defaults.ts` (modify — add `'connection'` to `ZoneShape`)
- `packages/runner/src/config/visual-config-types.ts` (modify — add `'connection'` to `ZoneShapeSchema`, add `ConnectionStyleConfigSchema`, extend zone style and `ZonesConfigSchema`)
- `packages/runner/src/config/visual-config-provider.ts` (modify — extend `ResolvedZoneVisual`, add `resolveConnectionStyle()`)
- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify — add no-op `'connection'` case)
- `packages/runner/src/model/project-render-model.ts` (modify — include `connectionStyleKey` in zone structural equality)

## Out of Scope

- FITL `visual-config.yaml` migration (that's `71CONROUREN-006`)
- Connection-route resolver or renderer (those are `71CONROUREN-003`, `71CONROUREN-004`, `71CONROUREN-005`)
- Removing or deprecating `'line'` shape (it stays valid; FITL just stops using it for LoCs)
- Any endpoint-resolution config such as `connectionEndpoints` (that belongs with resolver/data-migration work, not this schema slice)
- Any kernel or compiler changes
- Bézier math (that's `71CONROUREN-001`)

## Acceptance Criteria

### Tests That Must Pass

1. `ZoneShape` type accepts `'connection'` without type error.
2. `ZoneShapeSchema` parses `'connection'` as a valid zone shape.
3. `ConnectionStyleConfigSchema` parses valid config: `{ strokeWidth: 8, strokeColor: "#8b7355" }`.
4. `ConnectionStyleConfigSchema` parses config with optional wave fields: `{ strokeWidth: 12, strokeColor: "#4a7a8c", wavy: true, waveAmplitude: 4, waveFrequency: 0.08 }`.
5. `ZonesConfigSchema` parses config with `connectionStyles` section.
6. `resolveZoneVisual()` carries a resolved `connectionStyleKey` when category styles, attribute rules, or overrides supply one.
7. `resolveConnectionStyle("highway")` returns the config when `connectionStyles.highway` exists.
8. `resolveConnectionStyle("nonexistent")` returns `null`.
9. `drawZoneShape()` with `shape: 'connection'` does not throw and draws nothing.
10. Existing shape-utils tests continue to pass.
11. Existing FITL bootstrap test expectation remains `shape: 'line'` in this ticket because config migration is deferred to `71CONROUREN-006`.
12. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. All existing `ZoneShape` values remain valid — no removals.
2. `drawZoneShape()` never crashes regardless of shape value.
3. `ResolvedZoneVisual.connectionStyleKey` is the single resolved handoff for connection-style selection; no renderer should need to re-run raw attribute-rule matching.
4. `VisualConfigProvider` interface grows additively — no existing method signatures change.
5. Zod schemas parse existing configs without regression.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` — add tests for `resolveConnectionStyle()` and resolved `connectionStyleKey` precedence.
2. `packages/runner/test/config/visual-config-schema.test.ts` — add schema coverage for `'connection'`, `connectionStyles`, and `connectionStyleKey`.
3. `packages/runner/test/canvas/renderers/shape-utils.test.ts` — add test for `'connection'` no-op case.
4. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — keep/assert current FITL `shape: 'line'` expectation until `71CONROUREN-006`.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added `'connection'` to both the TypeScript `ZoneShape` union and the Zod `ZoneShapeSchema`.
  - Added `ConnectionStyleConfig`, `zones.connectionStyles`, and `connectionStyleKey` to the zone style schema.
  - Extended `ResolvedZoneVisual` with `connectionStyleKey`, updated `resolveZoneVisual()` precedence handling, and added `resolveConnectionStyle()`.
  - Added a `'connection'` no-op branch to `drawZoneShape()`.
  - Updated render-model structural equality to include `visual.connectionStyleKey`.
  - Added schema/provider/shape tests and updated affected fixtures to the new resolved visual contract.
- Deviations from original plan:
  - The ticket was corrected before implementation because its original assumptions understated the schema/runtime contract work.
  - FITL visual-config migration remained out of scope and the existing bootstrap expectation that FITL LoCs still resolve to `'line'` was intentionally preserved for `71CONROUREN-006`.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`

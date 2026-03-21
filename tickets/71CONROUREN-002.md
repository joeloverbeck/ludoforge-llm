# 71CONROUREN-002: Visual Config Schema Extension for Connection Routes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (can be done in parallel with 71CONROUREN-001)

## Problem

The visual config system has no concept of connection-route zones. To render LoCs as curves instead of rectangles, the config layer must:
1. Recognize `'connection'` as a valid `ZoneShape`
2. Define a `ConnectionStyleConfig` schema for stroke/wave parameters
3. Support `connectionStyles` in zones config and `connectionStyleKey` in attribute rules
4. Provide a `resolveConnectionStyle()` method on `VisualConfigProvider`
5. Handle `'connection'` as a no-op in `drawZoneShape()` (since connection zones are drawn by a dedicated renderer, not the zone renderer)

## Assumption Reassessment (2026-03-21)

1. `ZoneShape` is currently `'rectangle' | 'circle' | 'hexagon' | 'diamond' | 'ellipse' | 'triangle' | 'line' | 'octagon'` in `visual-config-defaults.ts` — confirmed, `'connection'` is not present.
2. `ZonesConfigSchema` in `visual-config-types.ts` has `categoryStyles`, `attributeRules`, `overrides` — but no `connectionStyles` field.
3. `drawZoneShape()` in `shape-utils.ts` has cases for all 8 current shapes — needs a `'connection'` no-op case.
4. `VisualConfigProvider` in `visual-config-provider.ts` has `resolveZoneVisual()` and `resolveEdgeStyle()` — no `resolveConnectionStyle()`.
5. `AttributeRuleSchema` already supports `style` properties — need to confirm it can carry `connectionStyleKey`.

## Architecture Check

1. Adding a new shape to the union and a new config section is a clean extension. The fallback chain (categoryStyles → attributeRules → overrides) works without modification — `connectionStyleKey` is just another style property resolved by the existing rule system.
2. `ConnectionStyleConfig` is generic (stroke, wave params) — not FITL-specific. Any game can define connection styles. Aligns with F1 and F3.
3. No backwards-compat shims — `'line'` shape remains valid; FITL migration to `'connection'` happens in a separate ticket (71CONROUREN-006). Aligns with F9.

## What to Change

### 1. Add `'connection'` to `ZoneShape` union

In `packages/runner/src/config/visual-config-defaults.ts`, append `'connection'` to the `ZoneShape` type.

### 2. Add `ConnectionStyleConfig` and extend `ZonesConfig`

In `packages/runner/src/config/visual-config-types.ts`:
- Define `ConnectionStyleConfigSchema` with fields: `strokeWidth` (number), `strokeColor` (string), `strokeAlpha` (number, optional), `wavy` (boolean, optional), `waveAmplitude` (number, optional), `waveFrequency` (number, optional).
- Infer `ConnectionStyleConfig` type from the schema.
- Add `connectionStyles: z.record(z.string(), ConnectionStyleConfigSchema).optional()` to `ZonesConfigSchema`.
- Add `connectionStyleKey` (string, optional) to the attribute rule `style` schema so attribute rules can map zones to named connection styles.

### 3. Add `resolveConnectionStyle()` to `VisualConfigProvider`

In `packages/runner/src/config/visual-config-provider.ts`:
- Add `resolveConnectionStyle(styleKey: string): ConnectionStyleConfig | null` to the provider interface and implementation.
- Looks up `config.zones.connectionStyles?.[styleKey] ?? null`.

### 4. Add `'connection'` no-op to `drawZoneShape()`

In `packages/runner/src/canvas/renderers/shape-utils.ts`, add a case for `'connection'` that returns immediately without drawing. Connection zones are rendered by the connection-route renderer, not the zone renderer.

## Files to Touch

- `packages/runner/src/config/visual-config-defaults.ts` (modify — add `'connection'` to `ZoneShape`)
- `packages/runner/src/config/visual-config-types.ts` (modify — add `ConnectionStyleConfigSchema`, extend `ZonesConfigSchema`)
- `packages/runner/src/config/visual-config-provider.ts` (modify — add `resolveConnectionStyle()`)
- `packages/runner/src/canvas/renderers/shape-utils.ts` (modify — add no-op `'connection'` case)

## Out of Scope

- FITL `visual-config.yaml` migration (that's 71CONROUREN-006)
- Connection-route resolver or renderer (those are 71CONROUREN-003, -004)
- Removing or deprecating `'line'` shape (it stays valid; FITL just stops using it for LoCs)
- Any kernel or compiler changes
- Bézier math (that's 71CONROUREN-001)

## Acceptance Criteria

### Tests That Must Pass

1. `ZoneShape` type accepts `'connection'` without type error
2. `ConnectionStyleConfigSchema` parses valid config: `{ strokeWidth: 8, strokeColor: "#8b7355" }`
3. `ConnectionStyleConfigSchema` parses config with optional wave fields: `{ strokeWidth: 12, strokeColor: "#4a7a8c", wavy: true, waveAmplitude: 4, waveFrequency: 0.08 }`
4. `ZonesConfigSchema` parses config with `connectionStyles` section
5. `resolveConnectionStyle("highway")` returns the config when `connectionStyles.highway` exists
6. `resolveConnectionStyle("nonexistent")` returns `null`
7. `drawZoneShape()` with `shape: 'connection'` does not throw and draws nothing
8. Existing shape-utils tests continue to pass
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All existing `ZoneShape` values remain valid — no removals
2. `drawZoneShape()` never crashes regardless of shape value
3. `VisualConfigProvider` interface grows additively — no existing method signatures change
4. Zod schemas parse existing configs without regression

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` (or equivalent) — add tests for `resolveConnectionStyle()`
2. `packages/runner/test/canvas/renderers/shape-utils.test.ts` — add test for `'connection'` no-op case

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

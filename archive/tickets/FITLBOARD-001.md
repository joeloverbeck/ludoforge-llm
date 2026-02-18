# FITLBOARD-001: Render Model Zone Metadata Pipeline

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner only
**Deps**: None

## Problem

`RenderZone` currently only exposes generic `metadata: {}` and lacks first-class `category`, `attributes`, and `visual` fields from `GameDef.ZoneDef`. `deriveZones()` (currently in `packages/runner/src/model/derive-render-model.ts` around the `deriveZones` helper) builds each zone with `metadata: {}` and drops `zoneDef.category`, `zoneDef.attributes`, and `zoneDef.visual`.

This blocks robust zone-type-aware rendering and pushes game semantics into untyped metadata handling.

## Assumption Reassessment

- Verified: `RenderZone` is missing zone-level semantic fields (`category`, `attributes`, `visual`).
- Verified: `deriveZones()` currently hardcodes `metadata: {}` and omits zone semantic fields.
- Discrepancy fixed: prior ticket line references were stale (`deriveZones` now starts around line ~484, not ~510).
- Discrepancy fixed: equality impact is broader than originally scoped. Zone comparison is implemented in both:
  - `packages/runner/src/canvas/canvas-equality.ts` (canvas update gating)
  - `packages/runner/src/model/derive-render-model.ts` (`isZoneEquivalent` for structural stabilization)
- Architecture correction: even if `visual` is mostly static per `GameDef`, equality should still include it (and `category`) so game/session swaps or future dynamic derivations cannot silently skip visual updates.

## What to Change

**File**: `packages/runner/src/model/render-model.ts`

Add three fields to `RenderZone` using shared engine runtime contracts (avoid duplicated schema shapes):

```typescript
export interface RenderZone {
  // ... existing fields ...
  readonly category: string | null;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly visual: ZoneVisualHints | null;
}
```

**File**: `packages/runner/src/model/derive-render-model.ts`

In `deriveZones()`, populate the new fields from `zoneDef`:

```typescript
zones.push({
  // ... existing fields ...
  category: zoneDef.category ?? null,
  attributes: zoneDef.attributes ?? {},
  visual: zoneDef.visual ?? null,
});
```

Also update `isZoneEquivalent(...)` to include `category`, `attributes`, and `visual` so zone stabilization does not retain stale objects when those fields differ.

**File**: `packages/runner/src/canvas/canvas-equality.ts`

In `zonesVisuallyEqualItem()`, include `category` and `visual` in visual equality checks:

```typescript
&& previous.category === current.category
&& shallowVisualEqual(previous.visual, current.visual)
```

`attributes` can remain excluded from canvas visual equality unless renderer starts consuming it directly.

**Tests and fixture helpers**:

- Update runner test builders that construct `RenderZone` literals to include required new fields.

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes — all `RenderZone` consumers compile with new fields
- `pnpm turbo lint` passes
- `deriveRenderModel()` populates `category`, `attributes`, `visual` from `GameDef` zones
- Zone stabilization (`isZoneEquivalent`) includes newly projected fields
- Canvas zone comparison reacts to `category`/`visual` differences

## Tests

- **Existing**: `packages/runner/test/model/derive-render-model-zones.test.ts` — keep current behavior passing with expanded `RenderZone` shape.
- **New test**: Zone with `category: 'city'`, `attributes: { population: 2 }`, and `visual` hints projects those values.
- **New test**: Zone without `category`/`attributes`/`visual` projects `null`/`{}`/`null` defaults.
- **New test**: `zonesVisuallyEqual` returns `false` when `category` differs.
- **New test**: `zonesVisuallyEqual` returns `false` when `visual` differs.
- **New test**: `stabilizeRenderModel` path does not preserve prior zone object when `category` or `visual` changes.
- Validate with `pnpm -F @ludoforge/runner test` and repo-level build/typecheck/lint commands listed in Invariants.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `category`, `attributes`, and `visual` to `RenderZone` in `packages/runner/src/model/render-model.ts` using shared engine runtime types.
  - Updated `deriveZones()` to project zone semantic fields from `GameDef` into runner render model output.
  - Updated zone structural sharing comparison (`isZoneEquivalent`) to include `category`, `attributes`, and `visual`.
  - Updated canvas zone visual equality to include `category` and `visual`.
  - Updated runner test fixtures/builders that construct `RenderZone`.
  - Added tests for zone projection defaults and semantic projections, plus equality/stabilization coverage for `category`/`visual`.
- **Deviation vs original plan**:
  - Expanded scope to include structural sharing comparison in `derive-render-model.ts`; this was required for correctness but was missing in the original ticket assumptions.
  - Included `visual` in canvas equality (not only `category`) to avoid stale rendering on game/session definition changes.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm turbo build` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅

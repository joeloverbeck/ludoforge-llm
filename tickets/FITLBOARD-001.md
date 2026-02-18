# FITLBOARD-001: Render Model Zone Metadata Pipeline

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner only
**Deps**: None

## Problem

`RenderZone` has an empty `metadata: {}` record and lacks `category`, `attributes`, and `visual` fields. The `deriveZones()` function in `derive-render-model.ts:510-522` builds each zone with `metadata: {}`, ignoring `zoneDef.category`, `zoneDef.attributes`, and `zoneDef.visual` entirely. The canvas renderers therefore cannot differentiate zone types or apply visual styling.

## What to Change

**File**: `packages/runner/src/model/render-model.ts`

Add three fields to `RenderZone`:

```typescript
export interface RenderZone {
  // ... existing fields ...
  readonly category: string | null;
  readonly attributes: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly visual: {
    readonly shape?: string;
    readonly width?: number;
    readonly height?: number;
    readonly color?: string;
    readonly label?: string;
  } | null;
}
```

**File**: `packages/runner/src/model/derive-render-model.ts`

In `deriveZones()` (~line 510), populate the new fields from `zoneDef`:

```typescript
zones.push({
  // ... existing fields ...
  category: zoneDef.category ?? null,
  attributes: zoneDef.attributes ?? {},
  visual: zoneDef.visual ?? null,
});
```

**File**: `packages/runner/src/canvas/canvas-equality.ts`

In `zonesVisuallyEqualItem()` (~line 67), add `category` to the equality check:

```typescript
&& previous.category === current.category
```

(`visual` is static from GameDef and won't change between renders, so no need to compare it per frame.)

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes — all `RenderZone` consumers compile with new fields
- `pnpm turbo lint` passes
- `deriveRenderModel()` populates `category`, `attributes`, `visual` from GameDef zones

## Tests

- **Existing**: `packages/runner/test/model/derive-render-model-zones.test.ts` — all existing tests pass (add `category: null, attributes: {}, visual: null` to expected outputs)
- **New test**: Zone with `category: 'city'` and `attributes: { population: 2 }` produces `RenderZone` with those values
- **New test**: Zone without `category`/`attributes`/`visual` produces `null`/`{}`/`null` defaults
- **New test**: `zonesVisuallyEqualItem` returns `false` when `category` differs
- `pnpm -F @ludoforge/runner test` — all 476+ tests pass

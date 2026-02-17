# PIXIFOUND-007: Custom Equality Comparators for Zustand Subscriptions

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D7 (partial — equality comparators only)
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-011

---

## Objective

Implement custom equality comparator functions for RenderModel slices (zones, tokens, adjacencies) that determine whether canvas renderers need to re-render. These are pure functions with no PixiJS dependency — they compare visual properties only.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/canvas-equality.ts` — `zonesVisuallyEqual()`, `tokensVisuallyEqual()`, `adjacenciesVisuallyEqual()`

### New test files
- `packages/runner/test/canvas/canvas-equality.test.ts`

---

## Out of Scope

- Do NOT implement the canvas-updater subscription wiring — that is PIXIFOUND-011.
- Do NOT implement animation gating logic — that is PIXIFOUND-011.
- Do NOT implement any renderers.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).

---

## Implementation Details

### zonesVisuallyEqual

```typescript
export function zonesVisuallyEqual(
  prev: readonly RenderZone[],
  next: readonly RenderZone[],
): boolean;
```

Compares: `id`, `isSelectable`, `isHighlighted`, `hiddenTokenCount`, `tokenIDs` (array deep equal), `markers` (array of `{id, state}` deep equal), `displayName`, `visibility`, `ownerID`.

### tokensVisuallyEqual

```typescript
export function tokensVisuallyEqual(
  prev: readonly RenderToken[],
  next: readonly RenderToken[],
): boolean;
```

Compares: `id`, `type`, `zoneID`, `ownerID`, `faceUp`, `isSelectable`, `isSelected`.

### adjacenciesVisuallyEqual

```typescript
export function adjacenciesVisuallyEqual(
  prev: readonly RenderAdjacency[],
  next: readonly RenderAdjacency[],
): boolean;
```

Compares: `from`, `to` for each pair.

All comparators return `true` if arrays are reference-equal (short-circuit), then check length, then per-element field comparison.

---

## Acceptance Criteria

### Tests that must pass

**`canvas-equality.test.ts`**:

**zonesVisuallyEqual**:
- Returns `true` for same reference (identity check).
- Returns `true` for two empty arrays.
- Returns `false` when lengths differ.
- Returns `false` when a zone `id` changes.
- Returns `false` when `isSelectable` toggles.
- Returns `false` when `isHighlighted` toggles.
- Returns `false` when `hiddenTokenCount` changes.
- Returns `false` when `tokenIDs` array content changes (added/removed/reordered).
- Returns `false` when a marker `state` changes.
- Returns `true` when all compared fields are identical.
- Ignores `metadata` field changes (not visually relevant for default renderer).

**tokensVisuallyEqual**:
- Returns `true` for same reference.
- Returns `false` when `zoneID` changes (token moved).
- Returns `false` when `faceUp` toggles.
- Returns `false` when `isSelectable` toggles.
- Returns `false` when `isSelected` toggles.
- Returns `true` when `properties` change but visual fields are identical.

**adjacenciesVisuallyEqual**:
- Returns `true` for same reference.
- Returns `false` when a pair is added or removed.
- Returns `false` when `from`/`to` values change.
- Returns `true` for identical adjacency lists.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- No PixiJS imports — these are pure comparison functions.
- Functions are side-effect free.
- Import types from `../../model/render-model.js`.

# PIXIFOUND-007: Custom Equality Comparators for Zustand Subscriptions

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D7 (partial -- equality comparators only)
**Priority**: P0
**Depends on**: PIXIFOUND-002
**Blocks**: PIXIFOUND-011

---

## Objective

Implement custom equality comparator functions for RenderModel slices (zones, tokens, adjacencies) that determine whether canvas renderers need to re-render. These are pure functions with no PixiJS dependency -- they compare visual properties only.

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. `PIXIFOUND-002` is completed and archived (`archive/tickets/PIXIFOUND-002.md`) and established runner import conventions for this area: extensionless local imports in source.
2. `packages/runner/src/canvas/canvas-updater.ts` does not exist yet; comparator functions must be introduced as standalone pure utilities and consumed later by PIXIFOUND-011.
3. Current RenderModel contracts in `packages/runner/src/model/render-model.ts` include additional zone/token fields (`displayName`, `visibility`, `ownerID`, `type`) that are part of default-renderer visual state (per Spec 38 D4/D6), so comparators should treat them as visually relevant.
4. RenderModel slice arrays are deterministic but ordered; comparator behavior must remain order-sensitive (index-based) to match renderer update semantics and avoid hidden reorder bugs.
5. No existing canvas equality test file exists in the runner test suite; this ticket must add it.

---

## Architectural Rationale

This change is more beneficial than the current architecture because there is currently no dedicated comparator layer for canvas subscriptions. Adding strict, pure comparators now:

- Creates an explicit boundary between state derivation and render-trigger policy.
- Prevents noisy re-renders for metadata-only changes while still reacting to visual changes.
- Keeps PIXIFOUND-011 wiring clean and extensible by reusing centralized comparator utilities instead of embedding ad hoc selector logic.

Long-term architecture note: if Spec 42 introduces renderer-specific visual contracts, comparator injection per renderer can extend this design without replacing this module.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/canvas-equality.ts` -- `zonesVisuallyEqual()`, `tokensVisuallyEqual()`, `adjacenciesVisuallyEqual()`

### New test files
- `packages/runner/test/canvas/canvas-equality.test.ts`

---

## Out of Scope

- Do NOT implement the canvas-updater subscription wiring -- that is PIXIFOUND-011.
- Do NOT implement animation gating logic -- that is PIXIFOUND-011.
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

All comparators return `true` if arrays are reference-equal (short-circuit), then check length, then per-element field comparison in order.

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
- Returns `false` when `displayName` changes.
- Returns `false` when `visibility` changes.
- Returns `false` when `ownerID` changes.
- Returns `true` when all compared fields are identical.
- Ignores `metadata` field changes (not visually relevant for default renderer).

**tokensVisuallyEqual**:
- Returns `true` for same reference.
- Returns `false` when `type` changes.
- Returns `false` when `zoneID` changes (token moved).
- Returns `false` when `ownerID` changes.
- Returns `false` when `faceUp` toggles.
- Returns `false` when `isSelectable` toggles.
- Returns `false` when `isSelected` toggles.
- Returns `true` when `properties` change but visual fields are identical.

**adjacenciesVisuallyEqual**:
- Returns `true` for same reference.
- Returns `false` when a pair is added or removed.
- Returns `false` when `from`/`to` values change.
- Returns `false` when pair ordering changes.
- Returns `true` for identical adjacency lists.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- No PixiJS imports -- these are pure comparison functions.
- Functions are side-effect free.
- Import types from `../model/render-model`.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/canvas-equality.ts` with pure, order-sensitive comparators:
    - `zonesVisuallyEqual()` compares visual zone fields (`id`, `displayName`, `visibility`, `ownerID`, `isSelectable`, `isHighlighted`, `hiddenTokenCount`, `tokenIDs`, marker `id/state`) and ignores `metadata`.
    - `tokensVisuallyEqual()` compares visual token fields (`id`, `type`, `zoneID`, `ownerID`, `faceUp`, `isSelectable`, `isSelected`) and ignores `properties`.
    - `adjacenciesVisuallyEqual()` compares adjacency pairs by ordered `from/to` entries.
  - Added `packages/runner/test/canvas/canvas-equality.test.ts` with targeted coverage for identity, length mismatches, all compared fields, metadata/properties ignore-paths, and ordering behavior.
  - Corrected ticket assumptions before implementation (import convention and visual-field coverage).
- **Deviations from original plan**:
  - Strengthened acceptance scope to explicitly include `displayName`, `visibility`, `ownerID`, `type`, and adjacency ordering cases, which were under-specified in the original ticket despite being relevant to Spec 38 visual behavior.
  - Corrected import-path invariant from `../../model/render-model.js` to the codebase-standard `../model/render-model`.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (19 files, 168 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

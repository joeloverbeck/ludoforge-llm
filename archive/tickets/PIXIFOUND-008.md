# PIXIFOUND-008: Zone Renderer with MapSpace Overlays and Markers

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D4
**Priority**: P0
**Depends on**: PIXIFOUND-002, PIXIFOUND-003, PIXIFOUND-004, PIXIFOUND-005
**Blocks**: PIXIFOUND-011, PIXIFOUND-012

---

## Objective

Implement the `ZoneRenderer` that renders `RenderZone[]` as visual elements with incremental diff updates, mapSpace overlays (population, econ, terrain, coastal), and zone markers. Use object pooling via `ContainerPool` and keep container identity stable per zone ID.

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. `packages/runner/src/canvas/renderers/zone-renderer.ts` and `packages/runner/test/canvas/renderers/zone-renderer.test.ts` do not exist yet; this ticket remains required.
2. The `ZoneRenderer` contract already exists in `packages/runner/src/canvas/renderers/renderer-types.ts` and must be implemented exactly:
   - `update(zones, mapSpaces, positions)`
   - `getContainerMap()`
   - `destroy()`
3. Current `RenderZone` does **not** include `isSelected` or `zoneType`; the previous ticket assumptions about a selected visual state and type-based coloring are invalid for current architecture.
4. Current visual-driving zone fields are: `id`, `displayName`, `visibility`, `ownerID`, `isSelectable`, `isHighlighted`, `tokenIDs`, `hiddenTokenCount`, and `markers`.
5. `ContainerPool` from PIXIFOUND-003 is available and should own lifecycle reuse for zone root containers; this is required for stable references and future animation wiring (Spec 40).
6. Runner tests execute in Vitest `node` environment; tests should mock Pixi primitives for deterministic behavior and should validate renderer semantics (diffing, pooling, state updates) rather than pixel output.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/zone-renderer.ts` -- `createZoneRenderer()` factory

### New test files
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts`

---

## Out of Scope

- Do NOT implement token rendering -- that is PIXIFOUND-010.
- Do NOT implement adjacency rendering -- that is PIXIFOUND-009.
- Do NOT implement click-to-select interactions -- that is PIXIFOUND-012.
- Do NOT implement canvas-updater subscription wiring -- that is PIXIFOUND-011.
- Do NOT implement per-game visual styling or custom renderers -- that is Spec 42.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files under `store/`, `model/`, `worker/`, or `bridge/`.

---

## Architecture Rationale

Compared to the current architecture (renderer contracts/utilities exist, but no zone renderer implementation), this ticket is structurally beneficial:

- It introduces a single authoritative place for zone visual projection from `RenderModel`.
- It enforces incremental diff + pooled container lifecycle now, preventing full-rebuild rendering patterns that would not scale and would conflict with Spec 40 animation reference stability.
- It keeps renderer behavior data-driven and game-agnostic by consuming only `RenderZone`/`RenderMapSpace` fields, with no game-specific branches.

Long-term note: if Spec 42 adds visual config overrides, this renderer should remain the generic default implementation and accept extension via composition/configuration, not aliases or parallel renderer codepaths.

---

## Implementation Details

### Factory

```typescript
export function createZoneRenderer(
  parentContainer: Container,
  pool: ContainerPool,
): ZoneRenderer;
```

### Incremental diff via object pooling

- Internal `Map<string, Container>` is the diff source.
- On each `update()`:
  - New zone IDs: acquire Container from pool, add to map and parent.
  - Removed zone IDs: remove Container from parent, release to pool, delete from map.
  - Existing IDs: update in place (position, base visuals, label text, selectable/highlighted state, marker/mapSpace overlays).
- Same zone ID must keep the same `Container` instance across updates.

### Default appearance (current-model-aligned)

- Rounded rectangle base shape.
- Centered zone name label from `displayName`.
- Token count badge when total tokens (`tokenIDs.length + hiddenTokenCount`) is greater than 0.
- Visual states:
  - `isSelectable: true` -> selectable accent (subtle border).
  - `isHighlighted: true` -> highlighted accent (strong border).
- Base styling should derive from generic zone visibility/ownership signals (`visibility`, `ownerID`) instead of nonexistent zone type fields.

### MapSpace overlay rendering

When a zone has matching `RenderMapSpace` by ID:
- Population badge (top-left).
- Econ badge (top-right).
- Terrain indicator.
- Coastal indicator.

### Zone marker rendering

Render `RenderMarker[]` as compact labels beneath the zone name, updated in place when marker state changes.

---

## Acceptance Criteria

### Tests that must pass

**`zone-renderer.test.ts`** (mock PixiJS classes):
- `update([], [], emptyPositions)` creates no containers.
- `update()` with 3 zones creates 3 containers and parents them.
- Removing one zone shrinks map to 2 and releases removed container to pool.
- Adding a new zone acquires from pool and grows map.
- Existing zone container identity is stable across updates.
- Existing zone position updates when `positions` change.
- Zone `displayName` label updates when name changes.
- `isSelectable` and `isHighlighted` produce distinct visual-state markers/styles.
- Matching mapSpace renders population/econ/terrain/coastal overlay indicators.
- Zone markers render and update from marker state changes.
- Token count badge appears when token total is non-zero and updates with counts.
- `getContainerMap()` exposes current zone container references.
- `destroy()` removes all zone containers from parent, releases them to pool, and clears internal map.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true

- `pnpm -F @ludoforge/runner typecheck` passes.
- Implementation satisfies `ZoneRenderer` from `renderer-types.ts`.
- Same zone ID -> same `Container` instance across updates.
- No game-specific rendering branches or hardcoded game identifiers.
- Zone root containers are acquired/released through `ContainerPool`.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/renderers/zone-renderer.ts` with `createZoneRenderer()` implementing incremental diff updates, pooled zone-root container lifecycle, stable container identity by zone ID, and in-place updates for position, zone labels, token-count badges, mapSpace overlays, and marker labels.
  - Added `packages/runner/test/canvas/renderers/zone-renderer.test.ts` with 8 tests covering add/remove/update diff behavior, pooling semantics, stable references, visual-state changes (`isSelectable`/`isHighlighted`), overlay/marker rendering, and `destroy()` cleanup behavior.
  - Corrected this ticket's original assumptions before implementation to match current contracts and data model (`RenderZone` has no `isSelected`/zone-type fields).
- **Deviations from original plan**:
  - Default base styling is now driven by available generic fields (`visibility`, `ownerID`) rather than unavailable zone-type data.
  - Visual assertions in tests target deterministic renderer state semantics (stroke and label/badge/overlay outputs) under mocked Pixi primitives instead of pixel-level rendering outputs.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed (20 files, 179 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.

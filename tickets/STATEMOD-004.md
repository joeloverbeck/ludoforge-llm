# STATEMOD-004: Implement `deriveRenderModel()` — Zones, Tokens, Adjacencies, MapSpaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D3 items 1, 14; D10)
**Deps**: STATEMOD-001, STATEMOD-002, STATEMOD-003

## Objective

Implement the core board-level derivation in `deriveRenderModel()`: zone mapping (including per-player owner zone expansion), token extraction, adjacency derivation, and map space copying. This ticket does NOT handle hidden information filtering (STATEMOD-005), selectability/highlighting (STATEMOD-007), or markers/tracks/effects (STATEMOD-006).

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — **new file**: `deriveRenderModel()` function (scaffold with zone/token/adjacency/mapSpace derivation)
- `packages/runner/test/model/derive-render-model-zones.test.ts` — **new file**: zone/token/adjacency/mapSpace tests

## Out of Scope

- Hidden information filtering / `faceUp` logic (STATEMOD-005)
- Selectability / highlighting computation (STATEMOD-007)
- Markers, tracks, lasting effects, interrupts, event decks (STATEMOD-006)
- Players, phases, turn order, actions, choices, terminal (STATEMOD-007)
- Store integration (STATEMOD-008)
- Any engine changes

## What to Do

### 1. Scaffold `deriveRenderModel()`

Create the function with the signature from the spec:

```typescript
export function deriveRenderModel(
  state: GameState,
  def: GameDef,
  context: RenderContext,
): RenderModel
```

This ticket populates: `zones`, `tokens`, `adjacencies`, `mapSpaces`. All other fields should be set to sensible defaults (empty arrays, `null`, etc.) so the function compiles and returns a valid `RenderModel`.

### 2. Zone derivation (D3 item 1, D10)

- Map `GameDef.zones` to `RenderZone` entries.
- **Per-player owner zone expansion (D10)**: For zones where `owner === 'player'`, emit one `RenderZone` per player (0 through `state.playerCount - 1`). Zone IDs follow the pattern `{zoneId}:{playerId}` (e.g., `hand:0`, `hand:1`).
- Set `ownerID` to the corresponding `PlayerId` for owner zones, `null` for non-owner zones.
- `displayName`: Use `formatIdAsDisplayName(expandedZoneId)`.
- `ordering`: Copy from `ZoneDef.ordering`.
- `tokenIDs`: Populate from `state.zones[expandedZoneId]` — list all token IDs. (Visibility filtering is STATEMOD-005.)
- `hiddenTokenCount`: Default to `0` for now (STATEMOD-005 will adjust).
- `visibility`: Copy from `ZoneDef.visibility`.
- `isSelectable`: `false` (STATEMOD-007 will compute).
- `isHighlighted`: `false` (STATEMOD-007 will compute).
- `markers`: `[]` (STATEMOD-006 will populate).
- `metadata`: `{}`.

### 3. Token derivation

- Iterate over all zones in `state.zones`.
- For each token, create a `RenderToken` with:
  - `id`, `type`, `zoneID` from the zone key
  - `ownerID`: Look up the zone's owner from the def. If owner zone, derive the player ID from the zone ID suffix.
  - `faceUp`: `true` for now (STATEMOD-005 will override based on visibility).
  - `properties`: Copy from `token.props`.
  - `isSelectable`: `false`, `isSelected`: `false` (STATEMOD-007).

### 4. Adjacency derivation

- Iterate `GameDef.zones`, collect `adjacentTo` arrays.
- Emit one `RenderAdjacency` per directional pair.
- Deduplicate if needed (adjacency in engine is per-zone, not per-pair).

### 5. MapSpace derivation

- Copy from `def.mapSpaces` (if present) to `RenderMapSpace[]`.
- `displayName`: Use `formatIdAsDisplayName(space.id)`.

## Acceptance Criteria

### Tests that must pass

- [ ] Non-owner zone maps correctly: id, displayName, ordering, visibility, tokenIDs from state
- [ ] Owner zone expands per player: `hand` with 2 players → `hand:0` and `hand:1` with correct ownerID
- [ ] Owner zone expands per player: `hand` with 3 players → `hand:0`, `hand:1`, `hand:2`
- [ ] Tokens are extracted from state zones with correct zoneID, type, id, properties
- [ ] Token ownerID derived from zone ownership (null for non-owner zones, PlayerId for owner zones)
- [ ] Adjacencies derived from zone definitions (both directions emitted)
- [ ] MapSpaces copied from def with displayName derived
- [ ] Empty state (no zones, no tokens) produces empty arrays without error
- [ ] `pnpm -F @ludoforge/runner typecheck` passes
- [ ] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` is a **pure function** — no side effects, no store access, no DOM/canvas interaction
- No game-specific logic — the function handles any `GameDef` / `GameState` generically
- `PlayerId` is branded number throughout (zone expansion uses `asPlayerId()`)
- Returns a valid `RenderModel` for any valid `GameState` + `GameDef` (never throws)
- No engine source files modified

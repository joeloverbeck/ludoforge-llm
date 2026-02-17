# STATEMOD-004: Implement `deriveRenderModel()` — Zones, Tokens, Adjacencies, MapSpaces

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D3 items 1, 14; D10)
**Deps**: STATEMOD-001, STATEMOD-002, STATEMOD-003

## Objective

Implement the core board-level derivation in `deriveRenderModel()`: zone mapping, token extraction, adjacency derivation, and map space copying. This ticket does NOT handle hidden information filtering (STATEMOD-005), selectability/highlighting (STATEMOD-007), or markers/tracks/effects (STATEMOD-006).

## Assumptions Reassessed (Codebase Reality)

- `GameDef.zones` are already materialized by the compiler (`compile-zones`) with canonical IDs like `table:none`, `hand:0`, `hand:1`, etc. The runner must not re-expand base zones.
- For variable player-count games, materialized owner zones may exist up to `metadata.players.max`; `deriveRenderModel()` must filter owner zones/tokens to active seats (`playerId < state.playerCount`).
- `GameState.zones` keys are canonical zone IDs, so zone/token derivation should be keyed by those IDs directly.
- Adjacency in zone defs may be directional; render adjacency should be normalized to effective bidirectional pairs and deduplicated.

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

- Map canonical `GameDef.zones` entries to `RenderZone` entries.
- Do **not** perform a second runtime expansion of owner zones.
- For owner zones (`owner === 'player'`), derive `ownerID` from the canonical zone suffix (e.g., `hand:1` → player 1) and include the zone only when `ownerID < state.playerCount`.
- For non-owner zones, set `ownerID` to `null`.
- `displayName`: Use `formatIdAsDisplayName(zone.id)`.
- `ordering`: Copy from `ZoneDef.ordering`.
- `tokenIDs`: Populate from `state.zones[zone.id]` — list all token IDs. (Visibility filtering is STATEMOD-005.)
- `hiddenTokenCount`: Default to `0` for now (STATEMOD-005 will adjust).
- `visibility`: Copy from `ZoneDef.visibility`.
- `isSelectable`: `false` (STATEMOD-007 will compute).
- `isHighlighted`: `false` (STATEMOD-007 will compute).
- `markers`: `[]` (STATEMOD-006 will populate).
- `metadata`: `{}`.

### 3. Token derivation

- Derive tokens from rendered zones/state zone contents (canonical IDs).
- For each token, create a `RenderToken` with:
  - `id`, `type`, `zoneID` from state
  - `ownerID`: same owner as the containing rendered zone
  - `faceUp`: `true` for now (STATEMOD-005 will override based on visibility)
  - `properties`: Copy from `token.props`
  - `isSelectable`: `false`, `isSelected`: `false` (STATEMOD-007)

### 4. Adjacency derivation

- Iterate `GameDef.zones`, collect `adjacentTo` arrays.
- Emit one `RenderAdjacency` per directional pair.
- Normalize to bidirectional edges (`from -> to` and `to -> from`) and deduplicate.
- Drop edges that reference zones not rendered for the active `playerCount`.

### 5. MapSpace derivation

- Copy from `def.mapSpaces` (if present) to `RenderMapSpace[]`.
- `displayName`: Use `formatIdAsDisplayName(space.id)`.

## Acceptance Criteria

### Tests that must pass

- [x] Materialized non-owner zone maps correctly: id, displayName, ordering, visibility, tokenIDs from state
- [x] Materialized owner zones map correctly with `ownerID` parsed from zone suffix
- [x] Owner zones/tokens beyond `state.playerCount` are filtered out
- [x] Tokens are extracted from rendered zones with correct zoneID, type, id, properties
- [x] Adjacencies are derived from zone definitions and normalized bidirectionally without duplicates
- [x] MapSpaces copied from def with displayName derived
- [x] Empty state (no zones, no tokens) produces empty arrays without error
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` is a **pure function** — no side effects, no store access, no DOM/canvas interaction
- No game-specific logic — the function handles any `GameDef` / `GameState` generically
- `PlayerId` is branded number throughout (owner parsing uses `asPlayerId()`)
- Returns a valid `RenderModel` for any valid `GameState` + `GameDef` (never throws)
- No engine source files modified

## Outcome

- **Completed**: 2026-02-17
- Implemented `packages/runner/src/model/derive-render-model.ts` with pure derivation of zones, tokens, adjacencies, and mapSpaces.
- Added `packages/runner/test/model/derive-render-model-zones.test.ts` covering canonical/materialized zone handling, owner filtering by `state.playerCount`, token extraction, adjacency normalization, mapSpace copying, and empty-state behavior.
- **Deviation from original plan**: original runtime owner-zone expansion was removed. The implementation now correctly consumes compiler-materialized zone IDs and filters inactive owner zones for the current seat count.
- Verification: `pnpm -F @ludoforge/runner typecheck`, `pnpm -F @ludoforge/runner test`, and `pnpm -F @ludoforge/runner lint` all passed.

# STATEMOD-006: Implement `deriveRenderModel()` — Variables, Markers, Tracks, Effects, Interrupts, Event Decks

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D3 items 3-8, 11-12)
**Deps**: STATEMOD-004

## Objective

Add derivation of game state metadata to `deriveRenderModel()`: global/player variables, space markers, global markers, numeric tracks, active lasting effects, interrupt stack, and event decks.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — add variable, marker, track, effect, interrupt, event deck derivation
- `packages/runner/test/model/derive-render-model-state.test.ts` — **new file**: tests for all state metadata derivation

## Out of Scope

- Zone/token/adjacency/mapSpace derivation (STATEMOD-004, already done)
- Hidden information filtering (STATEMOD-005)
- Players, phases, turn order, actions, choices, terminal (STATEMOD-007)
- Store integration (STATEMOD-008)
- Any engine changes

## What to Do

### 1. Global variables (D3 item 11 partial)

- Map `state.globalVars` to `RenderVariable[]` in `renderModel.globalVars`.
- `name`: the variable key.
- `value`: `number | boolean` from `state.globalVars[key]`.
- `displayName`: `formatIdAsDisplayName(name)`.

### 2. Per-player variables (D3 item 11 partial)

- Map `state.perPlayerVars` to `ReadonlyMap<PlayerId, readonly RenderVariable[]>` in `renderModel.playerVars`.
- For each player key, map each variable to `RenderVariable`.

### 3. Space markers (D3 item 3)

- Derive `RenderZone.markers` from `state.markers[spaceId]`.
- Cross-reference with `def.markerLattices` to find `possibleStates` for each marker ID.
- `state.markers` is `Record<string, Record<string, string>>` — outer key is space ID, inner key is marker ID, value is current state.

### 4. Global markers (D3 item 4)

- Derive `renderModel.globalMarkers` from `state.globalMarkers` (optional on GameState).
- Cross-reference with `def.globalMarkerLattices` for `possibleStates`.

### 5. Tracks (D3 item 5)

- Derive from `def.tracks` (optional on GameDef).
- For each `NumericTrackDef`:
  - `id`, `scope`, `faction`, `min`, `max` copied directly.
  - `displayName`: `formatIdAsDisplayName(id)`.
  - `currentValue`: Read from the corresponding variable. For `scope: 'global'`, read `state.globalVars[id]`. For `scope: 'faction'`, read the per-player var for the faction's player.

### 6. Active lasting effects (D3 item 6)

- Map `state.activeLastingEffects` (optional) to `RenderLastingEffect[]`.
- For each `ActiveLastingEffect`:
  - `id`, `sourceCardId`, `side`, `duration` copied.
  - `displayName`: Look up the card title from `def.eventDecks` → find the card with matching `sourceCardId` → use `card.title`. If not found, fall back to `formatIdAsDisplayName(sourceCardId)`.

### 7. Interrupt stack (D3 item 7)

- Map `state.interruptPhaseStack` (optional) to `RenderInterruptFrame[]`.
- `isInInterrupt = (state.interruptPhaseStack?.length ?? 0) > 0`.

### 8. Event decks (D3 item 12)

- Derive from `def.eventDecks` (optional).
- For each `EventDeckDef`:
  - `id`, `drawZoneId`, `discardZoneId` copied.
  - `displayName`: `formatIdAsDisplayName(id)`.
  - `deckSize`: Token count in `state.zones[drawZone]`.
  - `discardSize`: Token count in `state.zones[discardZone]`.
  - `currentCardId`: From card-driven turn order state — `state.turnOrderState.type === 'cardDriven' ? state.turnOrderState.runtime.currentCard : null`. Note: `runtime.currentCard` may not exist directly; derive from the played card slot or return `null` if not card-driven.
  - `currentCardTitle`: Look up card title from `def.eventDecks` by `currentCardId`.

## Acceptance Criteria

### Tests that must pass

- [ ] Global variables: all `state.globalVars` entries appear as `RenderVariable` with correct name, value, displayName
- [ ] Per-player variables: each player's vars mapped correctly with `PlayerId` keys
- [ ] Space markers: `state.markers['saigon']['terror']` produces `RenderMarker` with correct state and `possibleStates` from lattice def
- [ ] Space markers: marker on zone with no lattice def still works (possibleStates may be empty)
- [ ] Global markers: `state.globalMarkers['support']` produces `RenderGlobalMarker` with lattice `possibleStates`
- [ ] Missing optional fields: no `globalMarkers` on state → empty array; no `activeLastingEffects` → empty array
- [ ] Tracks: global track reads value from `state.globalVars[trackId]`; faction track reads from per-player var
- [ ] Track min/max/scope copied correctly from def
- [ ] Active lasting effects: card title looked up from event deck def
- [ ] Active lasting effects: fallback displayName when card not found in any deck
- [ ] Interrupt stack: empty stack → `isInInterrupt = false`, `interruptStack = []`
- [ ] Interrupt stack: non-empty → `isInInterrupt = true`, frames mapped
- [ ] Event decks: deck/discard sizes from zone token counts
- [ ] Event decks: missing event decks on def → empty array
- [ ] `pnpm -F @ludoforge/runner typecheck` passes
- [ ] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- `RenderVariable.value` is `number | boolean` only (matches engine `VariableValue`)
- All display names derived via `formatIdAsDisplayName()` — no hardcoded names
- Handles all optional fields gracefully (no crashes on `undefined`)
- No game-specific logic
- No engine source files modified

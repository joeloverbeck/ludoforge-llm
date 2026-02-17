# STATEMOD-006: Implement `deriveRenderModel()` — Variables, Markers, Tracks, Effects, Interrupts, Event Decks

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D3 items 3-8, 11-12)
**Deps**: STATEMOD-004

## Objective

Add derivation of game state metadata to `deriveRenderModel()`: global/player variables, space markers, global markers, numeric tracks, active lasting effects, interrupt stack, and event decks.

## Reassessed Assumptions

- `EventDeckDef` fields are `drawZone` / `discardZone` in engine types, not `drawZoneId` / `discardZoneId`. The render model still exposes `drawZoneId` / `discardZoneId`, so derivation must map engine fields to render fields.
- Card-driven runtime does **not** expose a direct current card ID at `turnOrderState.runtime.currentCard`; that field is eligibility metadata. Current card ID must be derived from the top token in the configured card lifecycle `played` zone (`def.turnOrder.config.turnFlow.cardLifecycle.played`) when turn order is card-driven.
- `state.perPlayerVars` is keyed by numeric player IDs serialized as strings. Faction tracks (`scope: 'faction'`) have no universal faction→player mapping outside card-driven runtime `factionOrder`; implementation must be generic and degrade safely when mapping is unavailable.

## Scope Update

- Keep this ticket strictly in `deriveRenderModel()` + runner model tests.
- Implement card-driven current-card derivation using turn-order config + zone state (not runtime eligibility fields).
- For faction tracks, resolve player via card-driven `factionOrder` when available; otherwise fall back safely to default numeric value (non-throwing).

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
  - `currentValue`: Read from the corresponding variable.
    - For `scope: 'global'`, read `state.globalVars[id]`.
    - For `scope: 'faction'`, resolve faction→player via card-driven `state.turnOrderState.runtime.factionOrder` index when available; if unresolved or non-numeric, return a safe fallback (track `min`).

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
  - `id` copied.
  - `drawZoneId = eventDeck.drawZone`, `discardZoneId = eventDeck.discardZone`.
  - `displayName`: `formatIdAsDisplayName(id)`.
  - `deckSize`: Token count in `state.zones[eventDeck.drawZone]`.
  - `discardSize`: Token count in `state.zones[eventDeck.discardZone]`.
  - `currentCardId`: Derive from card lifecycle played slot when card-driven: `def.turnOrder?.type === 'cardDriven'` and top token id at `state.zones[def.turnOrder.config.turnFlow.cardLifecycle.played]?.[0]?.id`; otherwise `null`.
  - `currentCardTitle`: Look up card title from `def.eventDecks` by `currentCardId`.

## Acceptance Criteria

### Tests that must pass

- [x] Global variables: all `state.globalVars` entries appear as `RenderVariable` with correct name, value, displayName
- [x] Per-player variables: each player's vars mapped correctly with `PlayerId` keys
- [x] Space markers: `state.markers['saigon']['terror']` produces `RenderMarker` with correct state and `possibleStates` from lattice def
- [x] Space markers: marker on zone with no lattice def still works (possibleStates may be empty)
- [x] Global markers: `state.globalMarkers['support']` produces `RenderGlobalMarker` with lattice `possibleStates`
- [x] Missing optional fields: no `globalMarkers` on state → empty array; no `activeLastingEffects` → empty array
- [x] Tracks: global track reads value from `state.globalVars[trackId]`; faction track reads from per-player var
- [x] Tracks: faction mapping unavailable (non-card-driven / missing faction) falls back safely without throwing
- [x] Track min/max/scope copied correctly from def
- [x] Active lasting effects: card title looked up from event deck def
- [x] Active lasting effects: fallback displayName when card not found in any deck
- [x] Interrupt stack: empty stack → `isInInterrupt = false`, `interruptStack = []`
- [x] Interrupt stack: non-empty → `isInInterrupt = true`, frames mapped
- [x] Event decks: deck/discard sizes from zone token counts
- [x] Event decks: `drawZone`/`discardZone` are mapped to render `drawZoneId`/`discardZoneId`
- [x] Event decks: card-driven `currentCardId` comes from card lifecycle played slot top token
- [x] Event decks: missing event decks on def → empty array
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- `RenderVariable.value` is `number | boolean` only (matches engine `VariableValue`)
- All display names derived via `formatIdAsDisplayName()` — no hardcoded names
- Handles all optional fields gracefully (no crashes on `undefined`)
- No game-specific logic
- No engine source files modified

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented all planned state-metadata derivations in `deriveRenderModel()` (global/player vars, zone/global markers, tracks, active effects, interrupt stack, event decks).
  - Refined `deriveRenderModel()` architecture by separating static `GameDef`-derived slices (map spaces, marker lattices, track defs, event deck projections/card titles, played-card slot) from dynamic `GameState` derivation paths, improving extensibility for future memoization/store-level optimization.
  - Corrected stale ticket assumptions before implementation:
    - Event deck engine fields are `drawZone`/`discardZone` and are mapped to render `drawZoneId`/`discardZoneId`.
    - Current event card is derived from card lifecycle played slot top token, not `turnOrderState.runtime.currentCard`.
    - Faction track resolution is performed via card-driven `factionOrder` when available, with safe fallback to track `min`.
  - Added focused runner model tests in `packages/runner/test/model/derive-render-model-state.test.ts` to lock in these invariants and edge cases.
- **Verification**:
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm turbo test`
  - `pnpm turbo lint`

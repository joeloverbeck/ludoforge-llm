# STATEMOD-005: Implement Hidden Information Filtering in `deriveRenderModel()`

**Status**: PENDING
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D4)
**Deps**: STATEMOD-004

## Objective

Add hidden information filtering to the zone and token derivation in `deriveRenderModel()`. The render model must only expose tokens visible to the viewing player, correctly tracking hidden token counts and face-up/face-down status based on zone visibility and RevealGrant mechanisms.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — modify zone and token derivation to apply visibility filtering
- `packages/runner/test/model/derive-render-model-visibility.test.ts` — **new file**: visibility/hidden info tests

## Out of Scope

- Selectability / highlighting (STATEMOD-007)
- Markers, tracks, lasting effects, interrupts (STATEMOD-006)
- Store integration (STATEMOD-008)
- PixiJS / React rendering of hidden tokens
- Any engine changes

## What to Do

### 1. Public zone visibility

Zones with `visibility: 'public'`:
- All tokens visible to all players.
- `tokenIDs` contains all token IDs from `state.zones[zoneId]`.
- `hiddenTokenCount` = `0`.
- All tokens have `faceUp = true`.

### 2. Owner zone visibility

Zones with `visibility: 'owner'`:
- **If `context.playerID` matches the zone's owner**: all tokens visible, `faceUp = true`, `hiddenTokenCount = 0`.
- **If `context.playerID` does NOT match**: `tokenIDs` is empty (no individual token details), `hiddenTokenCount` = actual token count in that zone. Tokens from this zone are excluded from `RenderModel.tokens` for this player.

### 3. Hidden zone visibility

Zones with `visibility: 'hidden'`:
- No player sees individual tokens.
- `tokenIDs` is always empty.
- `hiddenTokenCount` = actual token count.
- No tokens from this zone appear in `RenderModel.tokens`.

### 4. RevealGrant overrides

Check `state.reveals` for grants affecting each zone:
- `state.reveals[zoneId]` contains an array of `RevealGrant` objects.
- Each grant has `observers: 'all' | readonly PlayerId[]`.
- If the current player (`context.playerID`) is in a grant's `observers` list (or observers is `'all'`), matching tokens become visible.
- A `RevealGrant.filter` is an array of `TokenFilterPredicate` — if present, only tokens matching all predicates in the filter are revealed. If no filter, all tokens in the zone are revealed by that grant.
- Revealed tokens appear in `tokenIDs` with `faceUp = true`, even in owner/hidden zones.
- `hiddenTokenCount` must be decremented by the number of tokens revealed by grants.

### 5. Token `faceUp` derivation

`faceUp` is NOT a stored token property. It is derived purely from:
- Zone visibility rules (public → true, owner zone as owner → true)
- RevealGrant mechanisms (grant matches → true)
- Default in non-visible situations → false (but these tokens are excluded from `tokenIDs`)

## Acceptance Criteria

### Tests that must pass

- [ ] Public zone: all tokens visible, `hiddenTokenCount = 0`, all `faceUp = true`
- [ ] Owner zone, viewing as owner: all tokens visible, `hiddenTokenCount = 0`, all `faceUp = true`
- [ ] Owner zone, viewing as non-owner: `tokenIDs` empty, `hiddenTokenCount` = actual count, no tokens in `RenderModel.tokens` from this zone
- [ ] Hidden zone: `tokenIDs` empty, `hiddenTokenCount` = actual count regardless of viewer
- [ ] RevealGrant with `observers: 'all'` in hidden zone: revealed tokens appear in `tokenIDs` with `faceUp = true`
- [ ] RevealGrant with specific player observers: only that player sees the tokens
- [ ] RevealGrant with filter: only matching tokens revealed, non-matching remain hidden
- [ ] `hiddenTokenCount` correctly decremented when some tokens are revealed by grants
- [ ] RevealGrant in owner zone for non-owner: revealed tokens visible, others remain hidden
- [ ] Zone with no tokens: `tokenIDs = []`, `hiddenTokenCount = 0` regardless of visibility
- [ ] `pnpm -F @ludoforge/runner typecheck` passes
- [ ] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- A token can only appear in `RenderModel.tokens` if it is visible to `context.playerID`
- `hiddenTokenCount` + visible token count = actual token count in zone (always)
- `faceUp` is never stored in engine state — derived purely from visibility rules
- No game-specific logic (works for any game with visibility rules)
- No engine source files modified

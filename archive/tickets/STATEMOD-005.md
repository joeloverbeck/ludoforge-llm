# STATEMOD-005: Implement Hidden Information Filtering in `deriveRenderModel()`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: M
**Spec**: 37 — State Management & Render Model (D4)
**Deps**: archive/tickets/STATEMOD-004.md (completed)

## Objective

Add hidden information filtering to the zone and token derivation in `deriveRenderModel()`. The render model must only expose tokens visible to the viewing player, correctly tracking hidden token counts and face-up/face-down status based on zone visibility and RevealGrant mechanisms.

## Assumption Reassessment (2026-02-17)

- `packages/runner/src/model/derive-render-model.ts` currently performs **no** hidden-information filtering. It always emits all zone token IDs and all zone tokens with `faceUp = true`.
- Existing runner coverage for `deriveRenderModel()` is in `packages/runner/test/model/derive-render-model-zones.test.ts` and validates zone materialization/adjacency/map spaces only; there is currently no visibility-focused suite.
- `STATEMOD-004` is already completed and archived at `archive/tickets/STATEMOD-004.md`; this ticket builds directly on that result.
- `GameState.reveals` is optional; missing reveals must be treated as no grants.
- `RevealGrant.filter` supports `TokenFilterPredicate` values that may be literal scalars/sets or `ValueExpr`. In runner visibility filtering, `ValueExpr` predicates cannot be fully evaluated without kernel eval context. This ticket therefore applies a fail-closed rule: only literal scalar/set predicate values are matched; non-literal predicate values do not reveal additional tokens.
- Reveal grants that reference zone IDs not present in the materialized render zones are ignored.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — modify zone and token derivation to apply visibility filtering
- `packages/runner/test/model/derive-render-model-zones.test.ts` — extend existing deriveRenderModel coverage with visibility/hidden info tests

## Out of Scope

- Selectability / highlighting (STATEMOD-007)
- Markers, tracks, lasting effects, interrupts (STATEMOD-006)
- Store integration (STATEMOD-008)
- PixiJS / React rendering of hidden tokens
- Engine query semantics changes beyond token-filter sharing

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
- Predicate matching in this ticket supports literal scalar/set filter values only (`string | number | boolean` and literal arrays of those values). Non-literal `ValueExpr` filter values are treated as non-matching (fail-closed; no accidental information leak).
- Revealed tokens appear in `tokenIDs` with `faceUp = true`, even in owner/hidden zones.
- `hiddenTokenCount` must be decremented by the number of tokens revealed by grants.

### 5. Token `faceUp` derivation

`faceUp` is NOT a stored token property. It is derived purely from:
- Zone visibility rules (public → true, owner zone as owner → true)
- RevealGrant mechanisms (grant matches → true)
- Default in non-visible situations → false (but these tokens are excluded from `tokenIDs`)

## Acceptance Criteria

### Tests that must pass

- [x] Public zone: all tokens visible, `hiddenTokenCount = 0`, all `faceUp = true`
- [x] Owner zone, viewing as owner: all tokens visible, `hiddenTokenCount = 0`, all `faceUp = true`
- [x] Owner zone, viewing as non-owner: `tokenIDs` empty, `hiddenTokenCount` = actual count, no tokens in `RenderModel.tokens` from this zone
- [x] Hidden zone: `tokenIDs` empty, `hiddenTokenCount` = actual count regardless of viewer
- [x] RevealGrant with `observers: 'all'` in hidden zone: revealed tokens appear in `tokenIDs` with `faceUp = true`
- [x] RevealGrant with specific player observers: only that player sees the tokens
- [x] RevealGrant with filter: only matching tokens revealed, non-matching remain hidden
- [x] RevealGrant with non-literal `ValueExpr` filter value does not reveal tokens (fail-closed)
- [x] `hiddenTokenCount` correctly decremented when some tokens are revealed by grants
- [x] RevealGrant in owner zone for non-owner: revealed tokens visible, others remain hidden
- [x] Unknown `state.reveals` zone keys are ignored safely
- [x] Zone with no tokens: `tokenIDs = []`, `hiddenTokenCount = 0` regardless of visibility
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner test` passes
- [x] `pnpm -F @ludoforge/runner lint` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- A token can only appear in `RenderModel.tokens` if it is visible to `context.playerID`
- `hiddenTokenCount` + visible token count = actual token count in zone (always)
- `faceUp` is never stored in engine state — derived purely from visibility rules
- No game-specific logic (works for any game with visibility rules)
- Shared token-filter semantics are centralized in game-agnostic engine code to avoid runner/kernel drift

## Outcome

- Completion date: 2026-02-17
- What changed:
  - Implemented hidden-information filtering in `deriveRenderModel()` zone/token derivation for `public` / `owner` / `hidden` visibility rules.
  - Added RevealGrant observer + filter handling for visibility overrides.
  - Added fail-closed handling for non-literal `ValueExpr` RevealGrant filter values to avoid accidental information leakage.
  - Ensured `hiddenTokenCount` invariant per zone and that `RenderModel.tokens` includes only visible tokens.
  - Introduced shared engine token-filter utility (`packages/engine/src/kernel/token-filter.ts`) and reused it in both kernel query evaluation and runner visibility derivation to keep semantics centralized and game-agnostic.
  - Expanded `derive-render-model-zones.test.ts` with visibility/reveal coverage and updated one legacy expectation that conflicted with the new hidden-info behavior.
- Deviations from original plan:
  - Reused and extended existing `packages/runner/test/model/derive-render-model-zones.test.ts` instead of creating a separate visibility test file to keep deriveRenderModel coverage consolidated.
  - Included a focused engine refactor so token-filter semantics are defined once and consumed by runner + kernel; this intentionally exceeds the original "no engine changes" boundary for architectural robustness.
- Verification:
  - `pnpm -F @ludoforge/engine build` (pass)
  - `pnpm -F @ludoforge/engine test` (pass)
  - `pnpm -F @ludoforge/runner typecheck` (pass)
  - `pnpm -F @ludoforge/runner test` (pass)
  - `pnpm -F @ludoforge/runner lint` (pass)

# 80INCZOBHAS-003: Instrument Token Effect Handlers with Incremental Hash Updates

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effects-token.ts
**Deps**: 80INCZOBHAS-001

## Problem

Token effect handlers (`moveToken`, `moveAll`, `moveTokenAdjacent`, `draw`,
`shuffle`, `createToken`, `destroyToken`) modify `tokenPlacement` Zobrist
features without updating the running hash. These are the highest-volume
operations in most games — Texas Hold'em's `draw` and `moveToken` account for
the majority of per-move state changes.

## Assumption Reassessment (2026-03-24)

1. All token handlers are in `effects-token.ts` — confirmed.
2. `applyMoveToken` (~line 314) moves a token between zones — modifies 2 tokenPlacement features (old zone/slot removed, new zone/slot added).
3. `applyMoveAll` (~line 900) moves all matching tokens — N tokenPlacement changes.
4. `applyMoveTokenAdjacent` (~line 433) — same as moveToken but destination is adjacent zone.
5. `applyCreateToken` (~line 479) — adds a new tokenPlacement feature.
6. `applyDestroyToken` (~line 557) — removes a tokenPlacement feature.
7. `applyDraw` (~line 699) — moves 1+ tokens from source to dest zone.
8. `applyShuffle` (~line 1030) — reorders tokens within a zone (slot indices change).
9. `setTokenProp` (~line 601) — modifies token properties, which are NOT hashed (token placement key uses id only) — **no hash update needed**.
10. ZobristFeature `tokenPlacement` uses `{ kind: 'tokenPlacement', zoneId, slotIndex, tokenId }` — confirmed.

## Architecture Check

1. Token movements produce exactly 2 features per token moved: one removed (old zone+slot), one added (new zone+slot). The existing `updateHashTokenPlacement` helper in zobrist.ts handles this directly.
2. `shuffle` is the expensive case — up to 52 tokens in Texas Hold'em. Each token gets a new slot index, requiring N remove + N add operations. This is still O(N) per shuffle, not O(total-features), so it's a net improvement.
3. Engine-agnosticism preserved — tokenPlacement is a generic kernel concept.

## What to Change

### 1. `applyMoveToken` — 1 Token, 2 Features

Before moving, capture the token's current zone and slot. After moving, call `updateRunningHash` with old and new `tokenPlacement` features. Use `removeFromRunningHash` for old placement and `addToRunningHash` for new placement.

### 2. `applyMoveTokenAdjacent` — Same as moveToken

Identical pattern — capture old zone/slot, move, update hash.

### 3. `applyMoveAll` — N Tokens, 2N Features

For each token being moved, capture old placement before the batch move. After moving all tokens, issue hash updates for each.

### 4. `applyDraw` — 1+ Tokens Moved

For each drawn token, capture old placement (source zone + slot), then after placement in dest zone, issue hash update with new placement.

### 5. `applyShuffle` — N Tokens, Slot Reorder

Before shuffle: capture all token placements (zone, slot, tokenId). After shuffle: capture new slot assignments. For each token, XOR out old placement and XOR in new placement.

### 6. `applyCreateToken` — 1 New Feature

After creating and placing the token, call `addToRunningHash` with the new `tokenPlacement` feature.

### 7. `applyDestroyToken` — 1 Removed Feature

Before (or at point of) destruction, capture the token's placement. Call `removeFromRunningHash` with the old `tokenPlacement` feature.

### 8. `applySetTokenProp` — No Change

Token properties are not part of the Zobrist hash (placement key uses tokenId only). No hash update needed. Add a comment documenting this decision.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify — all 7 handlers)

## Out of Scope

- Variable effect handlers (ticket 002).
- Marker effect handlers (ticket 004).
- Phase/turn-flow handlers (ticket 005).
- Any changes to types-core.ts, zobrist.ts, initial-state.ts (ticket 001).
- Verification mode or switchover (tickets 006–007).
- Runner package changes.
- Changing the Zobrist feature schema (tokenPlacement stays id-only).

## Acceptance Criteria

### Tests That Must Pass

1. **Unit test**: `moveToken` updates `_runningHash` such that the hash matches `computeFullHash` after the move.
2. **Unit test**: `moveTokenAdjacent` updates `_runningHash` correctly.
3. **Unit test**: `createToken` adds the new token's feature to `_runningHash`.
4. **Unit test**: `destroyToken` removes the token's feature from `_runningHash`.
5. **Unit test**: `draw` (single and multi-token) updates `_runningHash` for all moved tokens.
6. **Unit test**: `moveAll` updates `_runningHash` for all matched tokens.
7. **Unit test**: `shuffle` updates `_runningHash` for all slot reassignments — final hash matches `computeFullHash`.
8. **Unit test**: `setTokenProp` does NOT modify `_runningHash`.
9. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass.
10. Existing suite: `pnpm turbo typecheck` — no type errors.

### Invariants

1. After any token handler, `_runningHash` reflects the XOR-diff of all changed `tokenPlacement` features.
2. Token creation adds exactly one feature; destruction removes exactly one.
3. Token movement (any variant) removes the old placement and adds the new one — net zero feature count change.
4. `shuffle` within a zone preserves feature count (same tokens, different slots).
5. Hash update is skipped gracefully when `cachedRuntime?.zobristTable` is unavailable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/zobrist-incremental-tokens.test.ts` — tests for all 7 token handlers' hash behavior.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-24
- **What changed**:
  - New file `packages/engine/src/kernel/zobrist-token-hash.ts` — `updateZoneTokenHash` helper that XORs out all old tokenPlacement features for a zone and XORs in all new ones.
  - `packages/engine/src/kernel/effects-token.ts` — instrumented `applyMoveToken`, `applyCreateToken`, `applyDestroyToken`, `applyDraw` (including reshuffle path), `applyMoveAll`, `applyShuffle` with incremental hash updates. Added comment to `applySetTokenProp` documenting no hash update needed.
  - `packages/engine/src/kernel/index.ts` — exported `zobrist-token-hash.ts`.
  - New test file `packages/engine/test/unit/kernel/zobrist-incremental-tokens.test.ts` — 11 tests covering all 8 handlers + graceful degradation without zobristTable.
- **Deviations**: Rather than per-token XOR pairs, used zone-level `updateZoneTokenHash` that XORs out all old placements and XORs in all new placements. This correctly handles slot-index shifts when tokens are inserted/removed from zones. Same net hash result, simpler implementation.
- **Verification**: 4710 tests pass, 0 failures. Typecheck and lint clean.

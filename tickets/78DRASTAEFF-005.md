# 78DRASTAEFF-005: Migrate effects-token handlers to native (env, cursor) signature

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effects-token.ts, effect-registry.ts
**Deps**: 78DRASTAEFF-002

## Problem

`effects-token.ts` contains 8 handlers wrapped with `simple()`: `applyMoveToken`, `applyMoveAll`, `applyMoveTokenAdjacent`, `applyDraw`, `applyShuffle`, `applyCreateToken`, `applyDestroyToken`, `applySetTokenProp`. This is the largest handler file (1000 lines). Each handler reconstructs EffectContext and creates new GameState objects via spreading. Migration eliminates both overheads.

## Assumption Reassessment (2026-03-23)

1. All 8 handlers have signature `(effect, ctx: EffectContext) => EffectResult` — confirmed.
2. Token handlers modify `state.zones` — they need `ensureZoneCloned(state, tracker, zoneId)` from `state-draft.ts` before mutating zone arrays.
3. `applyShuffle` modifies `state.rng` as well — must update `cursor.rng`.
4. `applyDraw` modifies source and destination zones plus `rng`.
5. `applyCreateToken` modifies `zones` and `tokenStateIndex`.
6. `applyDestroyToken` modifies `zones` and `tokenStateIndex`.
7. `applySetTokenProp` modifies individual tokens within zones — need to clone the token object before mutation (tokens are shared references).

## Architecture Check

1. Token handlers primarily mutate `state.zones` — a `Record<string, Token[]>`. The outer record is cloned by `createMutableState`; inner arrays need `ensureZoneCloned` before mutation.
2. Individual `Token` objects within zone arrays must also be cloned before property mutation (e.g., `setTokenProp`). This is a shallow clone of the token object.
3. No backwards-compatibility shims — direct migration to native signature.

## What to Change

### 1. Migrate all 8 handlers in `effects-token.ts`

For each handler:
- Change signature to `EffectHandler<K>` (i.e., `(effect, env, cursor, _budget, _applyBatch) => EffectResult`)
- Replace `ctx.*` → `env.*` (static fields) or `cursor.*` (dynamic fields)
- Replace `resolveEffectBindings(ctx)` → `resolveEffectBindings(env, cursor)` from `effect-context.ts`
- For zone mutations: call `ensureZoneCloned(cursor.state as MutableGameState, cursor.tracker!, zoneId)` before mutating zone arrays
- Replace `{ ...ctx.state, zones: newZones }` → mutate `(cursor.state as MutableGameState).zones[zoneId] = newArray`
- Return `{ state: cursor.state, rng: cursor.rng, emittedEvents: [...] }`

Specific handler notes:
- **applyMoveToken**: clone source zone, clone dest zone, splice/push token
- **applyMoveAll**: clone source zone, clone dest zone for batch move
- **applyMoveTokenAdjacent**: same pattern as moveToken with adjacency resolution
- **applyDraw**: clone source and dest zones, update rng
- **applyShuffle**: clone target zone array, update rng
- **applyCreateToken**: clone dest zone, push new token
- **applyDestroyToken**: clone source zone, splice token
- **applySetTokenProp**: clone zone array, clone token object, set property

### 2. Remove file-local `resolveEffectBindings` from `effects-token.ts`

Import from `effect-context.ts` instead.

### 3. Update registry entries in `effect-registry.ts`

Unwrap all 8 `simple()` calls for token handlers.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify — migrate 8 handlers)
- `packages/engine/src/kernel/effect-registry.ts` (modify — unwrap 8 simple() calls)

## Out of Scope

- Migrating handlers in other effect files (tickets 004, 006, 007)
- Changes to `state-draft.ts` copy-on-write helpers (ticket 001)
- Token state index mutations — if `tokenStateIndex` needs mutable update, that's scoped to this ticket's token handlers only
- Removing the `simple()` function definition (ticket 008)

## Acceptance Criteria

### Tests That Must Pass

1. `effects-token-move-draw.test.ts` — all move/draw tests pass
2. `effects-token-deck-behavior.test.ts` — deck operations pass
3. `effects-token-zone-entry-resets.test.ts` — zone entry resets pass
4. `effects-zone-ops.test.ts` — zone operation tests pass
5. `effects.golden.test.ts` — golden output unchanged
6. `effects.property.test.ts` — property tests pass (no token duplication, no crashes)
7. `spatial-effects.test.ts` — spatial/adjacency tests pass
8. FITL and Texas Hold'em E2E tests pass
9. Existing suite: `pnpm turbo test --force`
10. Typecheck: `pnpm turbo typecheck`

### Invariants

1. Tokens MUST NOT be duplicated across zones after any move operation — same invariant as before.
2. Zone arrays in `state.zones` MUST be cloned via `ensureZoneCloned` before any splice/push/filter operation.
3. Individual `Token` objects MUST be cloned before property mutation (setTokenProp).
4. `tokenStateIndex` updates must remain consistent with zone mutations.
5. The RNG state must be correctly threaded through draw/shuffle operations.

## Test Plan

### New/Modified Tests

1. No new tests — existing tests are comprehensive. If any test calls token handlers directly with `EffectContext`, update to pass `(effect, env, cursor, budget, applyBatch)`.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "moveToken|moveAll|draw|shuffle|createToken|destroyToken|setTokenProp"`
2. `pnpm turbo typecheck`
3. `pnpm turbo test --force`

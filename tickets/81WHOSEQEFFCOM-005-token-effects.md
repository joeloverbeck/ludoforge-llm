# 81WHOSEQEFFCOM-005: Compile token effects (moveToken, moveAll, moveTokenAdjacent, createToken, destroyToken, setTokenProp, draw, shuffle)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md

## Problem

Eight token effects (tags 4-11) fall back to the interpreter. Token effects are the most numerous effect category and are heavily used in both FITL (troop placement, movement, removal) and Texas Hold'em (card dealing, community card placement). They share common patterns: zone resolution, token query evaluation, zone mutation via `DraftTracker.ensureZoneCloned`, stacking enforcement, and mandatory `invalidateTokenStateIndex(state)` calls.

## Assumption Reassessment (2026-03-25)

1. Token effects are implemented in `effects-token.ts` (~1098 lines). This is the largest effect handler file.
2. All token effects must call `invalidateTokenStateIndex(state)` after zone mutations (from `token-state-index.ts`). Stale caches produce wrong results for subsequent queries.
3. `DraftTracker` provides `ensureZoneCloned` for copy-on-write zone mutations. The tracker handles zone-level token Zobrist hashing automatically.
4. Token query evaluation (`evalTokenSel`, `evalZoneSel`) is needed to resolve which tokens and zones are affected.
5. Stacking enforcement is checked after token placement in zones that have stacking limits.
6. `EFFECT_KIND_TAG`: `moveToken` (4), `moveAll` (5), `moveTokenAdjacent` (6), `draw` (7), `shuffle` (8), `createToken` (9), `destroyToken` (10), `setTokenProp` (11).
7. Trace emission: token effects use `resolveTraceProvenance` for trace entries.

## Architecture Check

1. Token effects are leaf effects — no nested bodies or control flow. They are pure state mutations on zones.
2. The compiled closures should delegate to shared helpers for zone mutation (clone zone, add/remove token, invalidate index) rather than duplicating the logic.
3. `shuffle` is unique: it consumes RNG to randomize token order within a zone.
4. `draw` is a bounded loop: moves `count` tokens from source to target.
5. `moveTokenAdjacent` needs the adjacency graph from `ctx.adjacencyGraph` for target zone resolution.
6. Given the size of `effects-token.ts` (1098 lines), compiled closures should either (a) extract shared helpers that both interpreted and compiled paths use, or (b) delegate to the existing interpreter helpers wrapped in the compiled fragment contract — whichever keeps the diff smaller and more reviewable.
7. If delegate-style wrappers are used for multiple token effects, this ticket SHOULD consolidate them behind a shared codegen helper instead of introducing eight near-identical bridge adapters. That keeps the compiler robust and aligns with Foundations 9 and 10.

## What to Change

### 1. Add pattern descriptors for all 8 token effects

In `effect-compiler-patterns.ts`:
- `MoveTokenPattern`: token selector, source zone (optional), target zone
- `MoveAllPattern`: optional filter, source zone, target zone
- `MoveTokenAdjacentPattern`: token selector, direction/filter for adjacency resolution
- `CreateTokenPattern`: token type, properties, target zone
- `DestroyTokenPattern`: token selector
- `SetTokenPropPattern`: token selector, property name, value expression
- `DrawPattern`: count expression, source zone, target zone
- `ShufflePattern`: target zone
- Add `match*` functions for each, wire into `classifyEffect` switch for tags 4-11

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileMoveToken(desc)` — resolve token and zones, `ensureZoneCloned` for source and target, move token, stacking check, `invalidateTokenStateIndex`, trace emission
- `compileMoveAll(desc)` — resolve filter, move all matching tokens, `invalidateTokenStateIndex`
- `compileMoveTokenAdjacent(desc)` — resolve token, resolve adjacent target via `ctx.adjacencyGraph`, move, `invalidateTokenStateIndex`
- `compileCreateToken(desc)` — instantiate token, add to target zone, stacking check, `invalidateTokenStateIndex`
- `compileDestroyToken(desc)` — resolve token, remove from zone, `invalidateTokenStateIndex`
- `compileSetTokenProp(desc)` — resolve token, create modified copy with new prop, replace in zone, `invalidateTokenStateIndex`
- `compileDraw(desc)` — bounded loop moving `count` tokens, `invalidateTokenStateIndex`
- `compileShuffle(desc)` — randomize zone token order using RNG, `invalidateTokenStateIndex`
- If two or more token effects delegate to existing runtime handlers instead of inlining their semantics, extract or reuse a shared delegate-wrapper helper rather than repeating binding/tracker/decision-scope adapter code per effect
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- Variable effects (ticket 002)
- Marker effects (ticket 003)
- Turn flow effects (ticket 004)
- `forEach`/`reduce`/`removeByPriority` (ticket 006)
- Refactoring `effects-token.ts` internals — compiled closures use existing helpers or replicate the logic
- Deleting `createFallbackFragment` (ticket 010)
- Action-context effects

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test for each of the 8 token effects: compiled fragment produces identical zone state to interpreted path
2. Parity test: each token effect compiled output matches interpreted output (all 7 verification dimensions)
3. `invalidateTokenStateIndex` test: every compiled token effect invalidates the index after mutation
4. `DraftTracker` test: `ensureZoneCloned` is called before any zone mutation
5. Stacking enforcement test: `moveToken` and `createToken` enforce stacking limits identically to interpreted path
6. `shuffle` RNG test: compiled shuffle produces identical token order to interpreted path for same RNG state
7. `draw` bounded loop test: draws exactly `count` tokens, handles insufficient tokens same as interpreter
8. Trace parity test: compiled token effects emit identical trace entries (`resolveTraceProvenance`) to interpreted path
9. Edge case tests: moveToken on empty zone, destroyToken for non-existent token, draw from empty zone — all match interpreter behavior
10. Existing suite: `pnpm turbo test`
11. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `invalidateTokenStateIndex(state)` is called after every zone mutation in compiled token effects
2. `DraftTracker.ensureZoneCloned` is called before modifying any zone
3. Stacking enforcement in compiled path is identical to interpreted path
4. Token Zobrist hashing (handled by DraftTracker) remains correct
5. Coverage ratio increases significantly for token-heavy sequences
6. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for all 8 compiled token effect generators
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for all 8 token match functions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

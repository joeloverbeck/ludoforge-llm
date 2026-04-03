# 65INTINTDOM-003: GameState.zones array migration and zone access

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — types-core.ts (GameState.zones type), all kernel zone access sites, resolve-selectors.ts (sortAndDedupeZones)
**Deps**: `archive/tickets/65INTINTDOM-002.md`

## Problem

`GameState.zones` is currently `Readonly<Record<string, readonly Token[]>>` — a string-keyed object. Zone access via `state.zones[zoneId]` triggers V8's megamorphic property access path (`Builtins_LoadIC_Megamorphic` at 4.98% CPU). Changing to an integer-indexed array makes zone access monomorphic (always fast). Additionally, `sortAndDedupeZones` uses `localeCompare` (1.38% CPU) which is unnecessary with integer IDs.

## Assumption Reassessment (2026-04-03)

1. `GameState.zones` is defined in `types-core.ts` (~line 1074) as `Readonly<Record<string, readonly Token[]>>`.
2. `sortAndDedupeZones` is in `resolve-selectors.ts:36-38`: `return [...new Set(zones)].sort((left, right) => left.localeCompare(right))`. Called 4 times in that file (lines 90, 277, 327, 356).
3. ~22 files directly access `state.zones[...]` across kernel, sim, and agents.
4. Zone indices will be contiguous 0-based after ticket 001 (compiler assigns sequentially).

## Architecture Check

1. Array-indexed zones are a pure performance optimization — the external contract (`applyMove(state) -> newState`) is unchanged. Foundation 11 (Immutability) is preserved via `readonly` arrays.
2. Zone access becomes `state.zones[zoneId]` where `zoneId` is now a number — same syntax, different underlying V8 optimization path (monomorphic array access vs megamorphic property lookup).
3. No game-specific logic introduced — this is a generic storage optimization. Foundation 1 (Engine Agnosticism) preserved.

## What to Change

### 1. Change `GameState.zones` type in `types-core.ts`

```typescript
// Before
readonly zones: Readonly<Record<string, readonly Token[]>>;

// After
readonly zones: readonly (readonly Token[])[];
```

### 2. Replace `sortAndDedupeZones` with `dedupeZones` in `resolve-selectors.ts`

```typescript
function dedupeZones(zones: readonly ZoneId[]): readonly ZoneId[] {
  return [...new Set(zones)];
}
```

Integer `Set` iteration order is insertion order, which is deterministic given deterministic input (Foundation 8). The `localeCompare` sort is eliminated entirely.

### 3. Update all zone access sites

Fix all ~22 files that access `state.zones[...]`. Most are already `state.zones[zoneId]` which works with both Record and array — but some may use `Object.keys(state.zones)`, `Object.entries(state.zones)`, or `Object.values(state.zones)` which need different patterns:

- `Object.keys(state.zones)` → `state.zones.map((_, i) => asZoneId(i))` or iterate with index
- `Object.entries(state.zones)` → `state.zones.map((tokens, i) => [asZoneId(i), tokens] as const)`
- Zone existence check `zoneId in state.zones` → `zoneId < state.zones.length`

### 4. Update zone construction in state initialization

State initialization that builds zones as a Record must change to build an array indexed by integer ZoneId. The compiler's intern table determines the zone count.

### 5. Update golden fixtures and test helpers

All golden fixtures containing `zones: { "zone-name": [...] }` change to `zones: [[...], [...], ...]` (integer-indexed arrays). Test helpers that construct GameState with zone Records change to arrays.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — `GameState.zones` type
- `packages/engine/src/kernel/resolve-selectors.ts` (modify) — `sortAndDedupeZones` → `dedupeZones`
- `packages/engine/src/kernel/effects-token.ts` (modify) — zone access
- `packages/engine/src/kernel/eval-query.ts` (modify) — zone token lookups
- `packages/engine/src/kernel/observation.ts` (modify) — zone observation
- `packages/engine/src/kernel/phase-advance.ts` (modify) — card lifecycle zones
- `packages/engine/src/kernel/spatial.ts` (modify) — zone neighbor operations
- `packages/engine/src/kernel/apply-move.ts` (modify) — state zone updates
- `packages/engine/src/sim/delta.ts` (modify) — zone access in delta computation
- All kernel/sim/agent files accessing `state.zones` (modify)
- All golden fixture files (modify) — re-generate with array-indexed zones
- Test helpers that construct GameState (modify)

## Out of Scope

- Serialization boundary (ticket 004) — this ticket changes internal storage only
- Runner migration (ticket 005)
- Other ID type migrations (ticket 007)
- Variable name interning (ticket 009)

## Acceptance Criteria

### Tests That Must Pass

1. `sortAndDedupeZones` no longer exists — replaced by `dedupeZones` with no `localeCompare`
2. `GameState.zones` is an array type — `typeof state.zones.length === 'number'`
3. All zone access uses integer index — no `String()` casts, no string key access
4. Determinism test: same GameDef + seed produces identical game outcome
5. Existing suite: `pnpm turbo test`

### Invariants

1. `state.zones[zoneId]` returns the correct token array for any valid ZoneId (0-based integer)
2. Zone array length equals the number of zones in `GameDef.internTable.zones`
3. No `localeCompare` calls remain for zone sorting
4. Foundation 8: deterministic zone deduplication (integer Set insertion order is deterministic)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/resolve-selectors.test.ts` — verify `dedupeZones` deduplicates correctly with integer IDs
2. All existing zone-related tests — update fixture zones from Record to array format
3. Determinism replay test — same seed produces identical serialized output

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

# SEATRES-001: Universal seat-name resolution across all player selector positions

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler pipeline (`compile-selectors.ts`, `compile-conditions.ts`, `compile-lowering.ts`, `compile-effects.ts`)
**Deps**: None (builds on already-merged cross-seat choice ownership work)

## Problem

Seat-name resolution (e.g. `NVA` → `{ id: 2 }`) currently only works in `chooser` fields of `chooseOne`/`chooseN` effects. All other player selector positions silently reject seat names with `CNL_COMPILER_PLAYER_SELECTOR_INVALID`. This inconsistency means a game author can write `chooser: NVA` but not `actor: NVA`, `executor: US`, or `filter.owner: ARVN`, even though the underlying `normalizePlayerSelector` function already supports `seatIds` — it just doesn't receive them at most call sites.

### Affected call sites (no `seatIds` today)

| File | Line(s) | Context |
|------|---------|---------|
| `compile-selectors.ts` | `normalizeActionExecutorSelector` (~line 61) | Action `executor` field |
| `compile-selectors.ts` | `normalizeZoneOwnerQualifier` (~line 98) | Zone owner qualifiers |
| `compile-lowering.ts` | ~line 480 | Action `actor` normalization |
| `compile-lowering.ts` | ~line 965 | Trigger result `player` normalization |
| `compile-conditions.ts` | ~line 680 | `spaceFilter.owner` in conditions |
| `compile-conditions.ts` | ~line 953 | `filter.owner` in token filters |
| `compile-conditions.ts` | ~line 1251 | `pvar.player` in per-player variable refs |
| `compile-effects.ts` | ~line 2254 | Nested `normalizePlayerSelector` in miscellaneous effect contexts |

## Assumption Reassessment (2026-03-01)

1. `normalizePlayerSelector` already accepts an optional `seatIds` parameter and performs case-insensitive matching — confirmed in current `compile-selectors.ts`.
2. `EffectLoweringSharedContext` already carries `seatIds?: readonly string[]` — confirmed in current `compile-lowering.ts`.
3. `ConditionLoweringSharedContext` is `Pick<EffectLoweringSharedContext, 'ownershipByBase' | 'tokenTraitVocabulary' | 'namedSets' | 'typeInference'>` — does NOT include `seatIds`. This is the root cause for conditions.
4. `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector` call `normalizePlayerSelector` without forwarding `seatIds` — confirmed by code inspection.

## Architecture Check

1. **Cleaner than alternatives**: Rather than adding ad-hoc `seatIds` plumbing per call site, the approach extends the shared context types that already flow through the compiler. This is a one-time widening of `ConditionLoweringSharedContext` and a signature update to two public selectors.
2. **Game-agnostic**: `seatIds` comes from `derivedFromAssets.seats` which is game-spec data. The compiler resolves seat names to numeric `{ id: N }` indices — no game-specific logic enters the kernel. Games without seats simply have `seatIds === undefined` and the code path is a no-op.
3. **No backwards-compatibility shims**: The `seatIds` parameter is already optional. Existing call sites that don't pass it continue to work identically.

## What to Change

### 1. Extend `ConditionLoweringSharedContext`

In `compile-lowering.ts`, add `'seatIds'` to the `Pick`:

```typescript
export type ConditionLoweringSharedContext = Pick<
  EffectLoweringSharedContext,
  'ownershipByBase' | 'tokenTraitVocabulary' | 'namedSets' | 'typeInference' | 'seatIds'
>;
```

This automatically makes `seatIds` available to all condition lowering functions.

### 2. Pass `seatIds` to `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector`

Add optional `seatIds` parameter to both functions in `compile-selectors.ts` and forward it to `normalizePlayerSelector`.

### 3. Pass `seatIds` at remaining call sites

In `compile-lowering.ts` (~lines 480, 965): pass `context.seatIds` to `normalizePlayerSelector` for action `actor` and result `player`.

In `compile-conditions.ts` (~lines 680, 953, 1251): pass `context.seatIds` to `normalizePlayerSelector` for `spaceFilter.owner`, `filter.owner`, `pvar.player`.

In `compile-effects.ts` (~line 2254): pass `context.seatIds` to the nested `normalizePlayerSelector` call.

### 4. Normalize guard style in `effects-choice.ts` (minor)

Both `applyChooseOne` and `applyChooseN` now check `chooser === undefined` to skip the authority mismatch guard, but they use different access patterns (`effect.chooseOne.chooser` vs destructured `chooseN.chooser`). Normalize to one style for consistency.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify) — extend `ConditionLoweringSharedContext`, pass `seatIds` at action.actor and result.player call sites
- `packages/engine/src/cnl/compile-selectors.ts` (modify) — add `seatIds` param to `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector`
- `packages/engine/src/cnl/compile-conditions.ts` (modify) — pass `context.seatIds` at 3 call sites
- `packages/engine/src/cnl/compile-effects.ts` (modify) — pass `context.seatIds` at nested call site
- `packages/engine/src/kernel/effects-choice.ts` (modify) — normalize guard style
- `packages/engine/test/unit/compile-selectors.test.ts` (modify) — add tests for seat names in zone owner, executor contexts

## Out of Scope

- Runtime authority changes (already handled by cross-seat choice ownership work)
- Adding seat-name resolution to the JSON Schema (`GameDef.schema.json`) — seat names are resolved at compile time and never appear in GameDef
- Condition-level `chooser` fields — conditions don't have chooser semantics

## Acceptance Criteria

### Tests That Must Pass

1. `normalizeZoneOwnerQualifier('NVA', path, fitlSeats)` resolves to `'2'` (zone owner uses string format)
2. `normalizeActionExecutorSelector('US', path, fitlSeats)` resolves to `{ id: 0 }`
3. Condition-level `spaceFilter.owner: NVA` compiles without diagnostics when `seatIds` is provided
4. All existing selector tests remain unchanged (no regression)
5. Existing suite: `pnpm turbo test`

### Invariants

1. Games without `seats` in their spec produce identical compilation output (no behavioral change)
2. Keyword selectors (`active`, `actor`, `all`, `allOther`) always take priority over seat names
3. Seat-name matching remains case-insensitive

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-selectors.test.ts` — extend `with seatIds` block to cover `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector` with seat names
2. New compiler integration test — compile a minimal spec with `actor: <seatName>` and verify it resolves correctly in the GameDef output

### Commands

1. `node --test packages/engine/dist/test/unit/compile-selectors.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

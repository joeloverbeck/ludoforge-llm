# SEATRES-001: Universal seat-name resolution across all player selector positions

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler pipeline (`compile-selectors.ts`, `compile-zones.ts`, `compile-conditions.ts`, `compile-lowering.ts`, `compile-effects.ts`)
**Deps**: None

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
| `compile-zones.ts` | ~line 223 | Zone owner qualifier canonicalization (`base:qualifier`) |

## Assumption Reassessment (2026-03-01)

1. `normalizePlayerSelector` already accepts an optional `seatIds` parameter and performs case-insensitive matching — confirmed in current `compile-selectors.ts`.
2. `EffectLoweringSharedContext` already carries `seatIds?: readonly string[]` and compiler-core already provides it from `derivedFromAssets.seats`.
3. `ConditionLoweringSharedContext` still excludes `seatIds`, and `buildConditionLoweringContext`/`makeConditionContext` also drop it. This is the root cause for conditions and any effect code that re-enters condition/query lowering.
4. `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector` call `normalizePlayerSelector` without forwarding `seatIds`.
5. `canonicalizeZoneSelector` in `compile-zones.ts` is the central owner-qualifier path and currently calls `normalizeZoneOwnerQualifier` without `seatIds`.
6. `effects-choice.ts` already uses equivalent explicit-chooser guards in both `applyChooseOne` and `applyChooseN`; no behavioral or architecture change is needed there for this ticket.

## Architecture Check

1. **Cleaner than alternatives**: Rather than adding ad-hoc `seatIds` plumbing per call site, the approach extends shared lowering contexts and the zone canonicalization choke point. This avoids drift between zone parsing, query lowering, and direct selector normalization.
2. **Game-agnostic**: `seatIds` comes from `derivedFromAssets.seats` which is game-spec data. The compiler resolves seat names to numeric `{ id: N }` indices — no game-specific logic enters the kernel. Games without seats simply have `seatIds === undefined` and the code path is a no-op.
3. **No backwards-compatibility shims**: `seatIds` remains optional. Behavior for specs without seats remains unchanged.

## What to Change

### 1. Extend condition context plumbing with `seatIds`

In `compile-lowering.ts`, add `'seatIds'` to `ConditionLoweringSharedContext` and forward it in `buildConditionLoweringContext`.

In `compile-conditions.ts`, extend `ConditionLoweringContext` with optional `seatIds` so all condition/query/reference lowering can consume it.

In `compile-effects.ts`, update `makeConditionContext` to include `seatIds` when present.

### 2. Pass `seatIds` to `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector`

Add optional `seatIds` parameter to both functions in `compile-selectors.ts` and forward it to `normalizePlayerSelector`.

### 3. Thread `seatIds` through zone canonicalization

In `compile-zones.ts`, add optional `seatIds` parameter to `canonicalizeZoneSelector` and pass it to `normalizeZoneOwnerQualifier`.

Update condition/effect call sites of `canonicalizeZoneSelector` to pass `context.seatIds`, so `zoneBase:<seatName>` is resolved consistently.

### 4. Pass `seatIds` at remaining player-selector call sites

In `compile-lowering.ts` (~lines 480, 965): pass `context.seatIds` to `normalizePlayerSelector` for action `actor` and result `player`, and to `normalizeActionExecutorSelector`.

In `compile-conditions.ts` (~lines 680, 953, 1251): pass `context.seatIds` to `normalizePlayerSelector` for `spaceFilter.owner`, `filter.owner`, `pvar.player`.

In `compile-effects.ts` (~line 2254): pass `context.seatIds` to the nested `normalizePlayerSelector` call.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify) — extend `ConditionLoweringSharedContext`; pass `seatIds` for action.actor, action.executor, terminal result.player; include `seatIds` in condition context builder
- `packages/engine/src/cnl/compile-selectors.ts` (modify) — add `seatIds` param to `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector`
- `packages/engine/src/cnl/compile-zones.ts` (modify) — add `seatIds` to `canonicalizeZoneSelector` and forward into qualifier normalization
- `packages/engine/src/cnl/compile-conditions.ts` (modify) — add `seatIds` to context and pass it at owner/pvar + zone canonicalization call sites
- `packages/engine/src/cnl/compile-effects.ts` (modify) — pass `seatIds` to nested player selector + zone canonicalization + condition context builder
- `packages/engine/test/unit/compile-selectors.test.ts` (modify) — add tests for seat names in zone owner/executor contexts
- `packages/engine/test/unit/compile-zones.test.ts` (modify) — add tests for seat-name qualifiers in zone selectors

## Out of Scope

- Runtime authority changes (already handled by cross-seat choice ownership work)
- Adding seat-name resolution to the JSON Schema (`GameDef.schema.json`) — seat names are resolved at compile time and never appear in GameDef
- Condition-level `chooser` fields — conditions don't have chooser semantics

## Acceptance Criteria

### Tests That Must Pass

1. `normalizeZoneOwnerQualifier('NVA', path, fitlSeats)` resolves to `'2'` (zone owner uses string format)
2. `normalizeActionExecutorSelector('US', path, fitlSeats)` resolves to `{ id: 0 }`
3. Condition-level `spaceFilter.owner: NVA` compiles without diagnostics when `seatIds` is provided
4. `canonicalizeZoneSelector('hand:NVA', ownershipByBase, path, fitlSeats)` resolves to `'hand:2'`
5. Action/terminal selectors accept seat names when `seatIds` is provided
6. Existing selector/zone tests remain unchanged aside from explicit new seat coverage

### Invariants

1. Games without `seats` in their spec produce identical compilation output (no behavioral change)
2. Keyword selectors (`active`, `actor`, `all`, `allOther`) always take priority over seat names
3. Seat-name matching remains case-insensitive

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-selectors.test.ts` — extend `with seatIds` coverage for `normalizeZoneOwnerQualifier` and `normalizeActionExecutorSelector` with seat names
2. `packages/engine/test/unit/compile-zones.test.ts` — add seat-name qualifier coverage for `canonicalizeZoneSelector`
3. `packages/engine/test/unit/compile-conditions.test.ts` — add condition/query owner + `pvar.player` seat-name coverage with context `seatIds`
4. `packages/engine/test/unit/compile-lowering.test.ts` (or closest lowering-focused suite) — add actor/executor/result seat-name lowering coverage

### Commands

1. `node --test packages/engine/dist/test/unit/compile-selectors.test.js`
2. `node --test packages/engine/dist/test/unit/compile-zones.test.js`
3. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
4. `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-01
- **What Changed**:
  - Implemented universal seat-name resolution for compiler player selector surfaces across lowering, conditions, effects, and zone canonicalization.
  - Added `seatIds` propagation to condition/effect context adapters and terminal end-condition lowering.
  - Updated selector/zone helper signatures so seat-name lookup is consistently available when seats are derived from `dataAssets`.
  - Added/extended unit tests for selectors, zones, conditions, effects, and compile-level action/terminal lowering with seat-name inputs.
- **Deviations From Original Plan**:
  - `compile-zones.ts` became a first-class change target because zone owner qualifier resolution is centralized there.
  - Instead of a non-existent `compile-lowering.test.ts`, compile-level seat-name coverage was added to `compile-actions.test.ts`.
  - `effects-choice.ts` was not changed because guard style was already consistent and no architecture benefit existed.
  - To satisfy workspace gate requirements, fixed pre-existing runner typecheck drift (`EffectTraceReduce` now uses `resultMacroOrigin`).
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/compile-selectors.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-zones.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-actions.test.js` ✅
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅

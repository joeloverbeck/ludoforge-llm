# FITLOPEFULEFF-002: New Effect Macros

**Status**: COMPLETED
**Priority**: P0 (blocker — operation profiles depend on these macros)
**Estimated effort**: Medium (3-4 hours)
**Spec reference**: Spec 26, "New Macros" section
**Depends on**: None (macros are YAML definitions + existing macro expansion engine from Spec 13a)

## Summary

Add 4 new effect macros to the FITL GameSpecDoc that are shared across multiple operation profiles:

1. **`coin-assault-removal-order`** — Wraps `piece-removal-ordering` with COIN-specific behavior: each insurgent Base removed adds +6 Aid.
2. **`insurgent-attack-removal-order`** — Wraps piece removal with Attack-specific behavior: US pieces to Casualties, attacker attrition per US piece removed.
3. **`per-province-city-cost`** — Faction-conditional per-space cost that charges 0 for LoCs.
4. **`sweep-activation`** — Guerrilla activation counting cubes + Special Forces, with Jungle terrain ratio.

## Files to Touch

- `test/fixtures/cnl/compiler/fitl-operations-coin.md` — Add `effectMacros` section with `coin-assault-removal-order`, `per-province-city-cost`, `sweep-activation`
- `test/fixtures/cnl/compiler/fitl-operations-insurgent.md` — Add `effectMacros` section with `insurgent-attack-removal-order`, `per-province-city-cost`
- `data/games/fire-in-the-lake.md` — Add all 4 macros to the master GameSpecDoc
- `test/integration/fitl-removal-ordering.test.ts` — **New file**: tests for `coin-assault-removal-order` and `insurgent-attack-removal-order`
- `test/integration/fitl-faction-costs.test.ts` — **New file**: tests for `per-province-city-cost`

## Out of Scope

- Changes to the macro expansion engine (`src/cnl/expand-effect-macros.ts`) — the engine already supports all required features from Spec 13a
- Changes to existing macros (`piece-removal-ordering`, `place-from-available-or-map`)
- Any kernel code changes
- Operation profile YAML (subsequent tickets)

## Acceptance Criteria

### Tests That Must Pass
1. New integration test: `coin-assault-removal-order` removes insurgent pieces in correct order (Troops → Active Guerrillas → Bases), adds +6 Aid per Base removed
2. New integration test: `insurgent-attack-removal-order` removes COIN pieces, attacker loses 1 piece to Available per US piece removed
3. New integration test: `per-province-city-cost` charges cost for Province/City but not for LoC
4. New integration test: `per-province-city-cost` skips cost when `__freeOperation` is true
5. New integration test: `sweep-activation` counts cubes + Special Forces, Jungle halves activation count
6. All 4 macros compile without diagnostics
7. Existing `fitl-coin-operations.test.ts` continues to pass
8. Existing `fitl-insurgent-operations.test.ts` continues to pass

### Invariants
- Macro expansion engine (`src/cnl/expand-effect-macros.ts`) is NOT modified
- Existing macros (`piece-removal-ordering`, `place-from-available-or-map`) are NOT modified
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)

## Outcome

- **Completion date**: 2026-02-13
- **What was changed**:
  - Added all 4 effect macros to `data/games/fire-in-the-lake.md` (master GameSpecDoc)
  - Added `effectMacros` sections to both COIN and insurgent test fixtures
  - Created 3 new integration test files with 14 total tests:
    - `fitl-removal-ordering.test.ts` (5 tests): COIN/insurgent fixture compilation + runtime behavior
    - `fitl-faction-costs.test.ts` (4 tests): Province/City charge, LoC skip, freeOperation skip
    - `fitl-sweep-activation.test.ts` (5 tests): non-jungle 1:1 ratio, jungle 1:2 ratio, edge cases
- **Deviations from plan**:
  - Skipped kernel `mapSpaces` injection (out of scope); tested at `applyEffects` level with manual `EffectContext`
  - Compilation tests that invoke macros from `setup` were removed because `__freeOperation` is a runtime binding not in compile-time scope — runtime behavior tests cover the same logic
  - Discovered pre-existing issue: YAML macro filter `{ prop: type }` checks `token.props.type` (undefined) instead of `token.type`; does not affect this ticket since macros are defined but not yet invoked from actions
- **Verification**: 974 tests pass, 0 failures, build and typecheck clean

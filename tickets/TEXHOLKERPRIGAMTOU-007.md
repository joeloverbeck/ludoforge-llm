# TEXHOLKERPRIGAMTOU-007: Tier 2 — Compilation Tests (Parse, Validate, Compile Texas Hold 'Em)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-001 through -006 (all kernel primitives and GameSpecDoc files)
**Blocks**: TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Write the compilation test suite that verifies the Texas Hold 'Em GameSpecDoc files parse, validate, and compile to a valid GameDef JSON. Also add a test helper for loading the Texas Hold 'Em production spec (parallel to the existing FITL `compileProductionSpec()` helper).

## What to Change

### 1. Add Texas Hold 'Em production spec helper

**File**: `test/helpers/production-spec-helpers.ts` (modify)

Add a `compileTexasHoldemSpec()` function following the same pattern as `compileProductionSpec()`:
- Path: `data/games/texas-holdem/`
- Lazy-cached: parse + validate + compile
- Cache invalidation on content hash change
- Returns `CompiledProductionSpec` (same interface)

### 2. Write compilation test suite

**File**: `test/unit/compile-texas-holdem.test.ts` (new)

Tests:

1. **Parse**: `parseGameSpec` on all 6 Texas Hold 'Em spec files succeeds without parse errors
2. **Validate**: `validateGameSpec` on parsed doc returns no error-severity diagnostics
3. **Compile**: `compileGameSpecToGameDef` succeeds without errors
4. **GameDef structure — zones**: Compiled GameDef contains all 5 zone types:
   - `deck` (owner: none, visibility: hidden, ordering: stack)
   - `burn` (owner: none, visibility: hidden, ordering: set)
   - `community` (owner: none, visibility: public, ordering: queue)
   - `hand` (owner: player, visibility: owner, ordering: set)
   - `muck` (owner: none, visibility: hidden, ordering: set)
5. **GameDef structure — per-player vars**: All 7 per-player variables present with correct types and init values (`chipStack`, `streetBet`, `totalBet`, `handActive`, `allIn`, `eliminated`, `seatIndex`)
6. **GameDef structure — global vars**: All 14 global variables present with correct types and init values (`pot`, `currentBet`, `lastRaiseSize`, `dealerSeat`, `smallBlind`, `bigBlind`, `ante`, `blindLevel`, `handsPlayed`, `handPhase`, `activePlayers`, `playersInHand`, `actingPosition`, `bettingClosed`)
7. **GameDef structure — actions**: All 5 actions present (`fold`, `check`, `call`, `raise`, `allIn`)
8. **GameDef structure — phases**: All 7 phases present (`hand-setup`, `preflop`, `flop`, `turn`, `river`, `showdown`, `hand-cleanup`)
9. **GameDef structure — terminal**: Terminal conditions include `activePlayers == 1` check
10. **Macro expansion**: Verify macro expansion produced valid effects (no `macro:` references remain in compiled output)
11. **New effects present**: Compiled GameDef contains `reveal`, `evaluateSubset`, and `commitResource` effects in the appropriate phases/actions
12. **JSON Schema validation**: Compiled GameDef passes the JSON Schema in `schemas/gamedef.schema.json` (if this schema is kept up to date; skip if schema is stale)

## Files to Touch

| File | Change Type |
|------|-------------|
| `test/helpers/production-spec-helpers.ts` | Modify — add `compileTexasHoldemSpec()` |
| `test/unit/compile-texas-holdem.test.ts` | Create — compilation test suite |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files (if tests fail, the fix belongs in earlier tickets)
- **DO NOT** modify GameSpecDoc files (if spec files have bugs, fix via ticket -004/-005/-006 amendments)
- **DO NOT** write integration or E2E tests (those are tickets -008 and -009)
- **DO NOT** modify existing FITL test files
- **DO NOT** add hand mechanics tests, betting tests, or tournament tests

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/unit/compile-texas-holdem.test.ts` — all 12 tests above pass
2. **Regression**: `npm test` — all existing tests continue to pass (including FITL compilation tests)
3. **Build**: `npm run build` succeeds
4. **Lint**: `npm run lint` passes

### Invariants That Must Remain True

1. **FITL unaffected**: `compileProductionSpec()` still works identically — no changes to FITL path or behavior
2. **Helper caching**: `compileTexasHoldemSpec()` caches correctly — second call returns same object without recompilation
3. **No warnings**: Compilation produces zero warning-severity diagnostics (or if warnings exist, they are documented and expected)
4. **Deterministic**: Same spec files → same compiled GameDef (no random elements in compilation)
5. **GameDef completeness**: Every section of the GameDef is populated — no empty `actions`, `zones`, `phases`, or `triggers` arrays where content is expected

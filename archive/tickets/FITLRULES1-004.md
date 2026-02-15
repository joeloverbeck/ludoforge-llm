# FITLRULES1-004: US Map Sourcing Exception Fix

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — GameSpecDoc macro condition fix + test coverage updates

## Problem

The `place-from-available-or-map` macro in `20-macros.md` (line 1422) blocks ALL US forces from being sourced from the map:

```yaml
- { op: '!=', left: { param: faction }, right: 'US' }
```

But rule 1.4.1 says: "The US player may do so only with US-led Irregulars and any ARVN forces, not with US Troops nor with US Bases."

This means:
- US Troops: **cannot** be sourced from map (current behavior correct)
- US Bases: **cannot** be sourced from map (current behavior correct)
- US Irregulars: **can** be sourced from map (current behavior WRONG — blocked)
- ARVN forces: **can** be sourced from map (current behavior correct — ARVN ≠ US)

## What to Change

**File**: `data/games/fire-in-the-lake/20-macros.md`

At line 1422, change the map-sourcing gate from "not US" to "not US, OR piece type is irregular":

```yaml
# OLD (line 1422):
- { op: '!=', left: { param: faction }, right: 'US' }

# NEW: Allow map sourcing unless it's US troops or US bases (but allow US irregulars)
op: or
args:
  - { op: '!=', left: { param: faction }, right: 'US' }
  - { op: '==', left: { param: pieceType }, right: 'irregular' }
```

This condition is part of the `op: and` block at lines 1420-1423. The full block after the fix:

```yaml
op: and
args:
  - op: or
    args:
      - { op: '!=', left: { param: faction }, right: 'US' }
      - { op: '==', left: { param: pieceType }, right: 'irregular' }
  - { op: '>', left: { ref: binding, name: $remaining }, right: 0 }
```

### Verification

Check all call sites of `place-from-available-or-map` macro to ensure the `pieceType` parameter is always passed. Grep for `macro: place-from-available-or-map` across all GameSpecDoc files and verify each invocation includes a `pieceType` arg.

## Reassessed Assumptions And Scope

### Confirmed assumptions

1. Rule 1.4.1 in `reports/fire-in-the-lake-rules-section-1.md` explicitly allows US-led Irregulars to be sourced from the map when none are Available.
2. The current macro blocks all US map sourcing via:
   ```yaml
   - { op: '!=', left: { param: faction }, right: 'US' }
   ```
   so US Irregular map sourcing is currently impossible.
3. All current call sites pass `pieceType` and `faction`, so the macro can safely branch by piece type.

### Discrepancies in original ticket

1. The original test plan assumes direct production runtime paths that invoke this macro with `faction: US, pieceType: troops|base`. Current FITL action pipelines do not use `place-from-available-or-map` for US Troops/Bases, so those exact runtime cases are not directly executable through a real operation flow.
2. The original integration test wording says "map sourcing option is presented". In this engine, map sourcing is represented by a `chooseN` decision over source spaces with `min: 0`; tests should validate executable behavior (piece moved when source selected) and gating logic, not only UI option phrasing.

### Updated implementation scope

1. Update only `data/games/fire-in-the-lake/20-macros.md` for the gating condition.
2. Keep architecture generic and data-driven: no engine code changes, no per-game branching in kernel/compiler.
3. Add tests at two levels:
   - Parsed/compiled macro structure assertions for gating logic.
   - Runtime integration through a real operation (`train-us-profile`, `place-irregulars`) proving US Irregular map sourcing works when none are Available.
4. Add regression assertions that non-US map sourcing behavior remains intact and call-site parameter contracts are preserved.

## Invariants

1. Macro gate must evaluate true for non-US factions regardless of piece type.
2. Macro gate must evaluate true for `faction: US` only when `pieceType: irregular`.
3. Macro gate must evaluate false for `faction: US` with `pieceType: troops|base`.
4. Runtime US Train (`place-irregulars`) must be able to move US Irregular from map when none are Available.
5. All existing macro call sites must still compile without errors and include required args.

## Tests

1. **Integration runtime test**: US Train `place-irregulars` with no Available Irregulars and at least one US Irregular on map; selecting a source space moves one Irregular from map to target.
2. **Integration structure test**: Parsed macro contains `faction != US OR pieceType == irregular` gate in map-sourcing branch.
3. **Integration structure test**: All `place-from-available-or-map` call sites pass `pieceType` and `faction`.
4. **Compilation regression**: Production spec compiles without diagnostics.
5. **Targeted regression run**: Relevant FITL operation/rules tests pass with no behavior regressions.

## Outcome

- **Completion date**: 2026-02-15
- **What actually changed**:
  - Updated `place-from-available-or-map` in `data/games/fire-in-the-lake/20-macros.md` to allow map sourcing when `(faction != US) OR (pieceType == irregular)`.
  - Added integration coverage in `test/integration/fitl-us-map-sourcing-exception.test.ts`:
    - Runtime US Train path proving US Irregular map sourcing works when none are Available.
    - Structural assertion of the macro gate expression.
    - Contract assertion that all macro call sites provide `pieceType` and `faction`.
- **Deviations from original plan**:
  - Replaced unrealistic direct runtime tests for `faction: US, pieceType: troops|base` (no production call path) with structural gate assertions plus real operation runtime validation.
- **Verification results**:
  - `npm test` passed.
  - `npm run lint` passed.

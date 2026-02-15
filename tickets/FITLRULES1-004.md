# FITLRULES1-004: US Map Sourcing Exception Fix

**Status**: TODO
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — macro condition fix

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

## Invariants

1. US Troops placement from map must still be blocked.
2. US Base placement from map must still be blocked.
3. US Irregulars placement from map must now be allowed.
4. ARVN forces placement from map must remain allowed (unaffected).
5. NVA and VC forces placement from map must remain allowed (unaffected).
6. All existing macro call sites must still compile without errors.

## Tests

1. **Unit test**: Compile production spec, verify no compilation errors after macro change.
2. **Integration test**: Invoke `place-from-available-or-map` with `faction: US, pieceType: irregular` — verify map sourcing option is presented.
3. **Integration test**: Invoke `place-from-available-or-map` with `faction: US, pieceType: troops` — verify map sourcing is NOT presented.
4. **Integration test**: Invoke `place-from-available-or-map` with `faction: US, pieceType: base` — verify map sourcing is NOT presented.
5. **Regression test**: Invoke with `faction: ARVN, pieceType: troops` — verify map sourcing still works.
6. **Regression test**: Invoke with `faction: NVA, pieceType: guerrilla` — verify map sourcing still works.

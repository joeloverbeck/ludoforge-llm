# FITLRULES1-006: Faction Alliance Metadata (Deferred)

**Status**: DEFERRED
**Priority**: LOW
**Effort**: Large (touches compiler + dozens of YAML locations)
**Engine Changes**: Would require compiler support for alliance references

## Problem

COIN/Insurgent faction groupings are hardcoded as `[US, ARVN]` / `[NVA, VC]` filter arrays throughout all macros and actions in the GameSpecDoc files. This is not DRY — the same arrays appear in dozens of locations across `20-macros.md` and `30-rules-actions.md`.

## Why Deferred

This is a structural improvement, not a correctness bug. The hardcoded arrays work correctly and produce the right game behavior. Centralizing faction alliances would require:

1. A new metadata field in the GameSpecDoc (e.g., `factionAlliances` in the game's config section).
2. Compiler support to expand alliance references (e.g., `{ ref: alliance, name: COIN }`) into faction arrays at compile time.
3. Updating all macros and actions to use alliance references instead of literal arrays.

The blast radius is large (dozens of YAML locations plus compiler code) with no behavioral impact. This should be done as a cleanup/DRY pass after more urgent correctness fixes are complete.

## Future Implementation Sketch

### Game Config Addition

```yaml
factionAlliances:
  COIN: [US, ARVN]
  Insurgent: [NVA, VC]
```

### Compiler Change

Add a macro-expansion pass or ValueExpr node that resolves `{ ref: alliance, name: COIN }` → `['US', 'ARVN']` during compilation.

### YAML Updates

Replace all instances of:
```yaml
factions: [US, ARVN]
```
with:
```yaml
factions: { ref: alliance, name: COIN }
```

And similarly for `[NVA, VC]` → `{ ref: alliance, name: Insurgent }`.

## Invariants

1. After refactoring, all compiled `GameDef` output must be identical to current output.
2. No behavioral changes in any game mechanics.
3. All existing tests must continue to pass without modification.

## Tests

1. **Golden test**: Compiled `GameDef` JSON before and after refactoring must be byte-identical.
2. **Unit test**: Compiler correctly expands alliance references to faction arrays.
3. **Regression test**: Full test suite passes with no changes.

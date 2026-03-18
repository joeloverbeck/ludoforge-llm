# EASTEROFF-001: Replace verbose `op: or` category filter with `op: in` in Easter Offensive macro

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — game data only
**Deps**: `data/games/fire-in-the-lake/20-macros.md`

## Problem

The `easter-offensive` macro in `20-macros.md` uses a verbose 7-line `op: or` with three `==` comparisons to test whether a zone's category is one of `[province, city, loc]`. The DSL already supports the `op: in` condition with `item`/`set` fields for membership testing, which expresses this in 3 lines. The workaround was introduced because the author mistakenly used `left`/`right` (comparison operator syntax) instead of `item`/`set` (membership operator syntax) and assumed the feature was unsupported.

The same `op: in` + `item`/`set` pattern is already used elsewhere in the codebase (e.g., `40-content-data-assets.md` line 835, `20-macros.md` line 2495).

## Assumption Reassessment (2026-03-18)

1. `op: in` condition with `item`/`set` fields compiles and evaluates correctly — confirmed by existing usage in `40-content-data-assets.md:835`, `20-macros.md:2495`, `20-macros.md:2700`, `30-rules-actions.md:2832`.
2. The `easter-offensive` macro's `chooseN` filter for `$eoMarchDestinations` uses the verbose `op: or` workaround at approximately line 4199 of `20-macros.md`.
3. No mismatch — this is a straightforward YAML simplification with no behavioral change.

## Architecture Check

1. **Cleaner than current**: Replaces a 7-line boilerplate pattern with the canonical 3-line `op: in` expression. Reduces maintenance surface and makes intent clearer.
2. **GameSpecDoc boundary preserved**: This change is entirely within game-specific GameSpecDoc data (`20-macros.md`). No kernel, compiler, or runtime changes.
3. **No backwards-compatibility aliasing**: Direct replacement; the old `op: or` pattern is removed entirely.

## What to Change

### 1. Replace `op: or` category filter in `easter-offensive` macro

In `20-macros.md`, inside the `easter-offensive` macro's Step 1 `chooseN` filter, replace:

```yaml
- op: or
  args:
    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'province' }
    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'city' }
    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: 'loc' }
```

With:

```yaml
- op: in
  item: { ref: zoneProp, zone: $zone, prop: category }
  set: ['province', 'city', 'loc']
```

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify)

## Out of Scope

- Auditing other macros for similar verbose patterns (could be a separate sweep ticket)
- Compiler changes to improve error messages for `op: in` misuse (see CNLDIAG-001)

## Acceptance Criteria

### Tests That Must Pass

1. All 20 Easter Offensive tests in `fitl-events-easter-offensive.test.ts` continue to pass
2. No new compiler warnings or errors from production spec compilation
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. March destination filter must include provinces, cities, AND LoCs
2. No behavioral change — same set of eligible spaces before and after

## Test Plan

### New/Modified Tests

1. No new tests needed — existing `fitl-events-easter-offensive.test.ts` covers the march destination selection behavior.

### Commands

1. `pnpm turbo build --force` (verify compilation)
2. `node --test dist/test/integration/fitl-events-easter-offensive.test.js` (targeted)
3. `pnpm turbo test --force && pnpm turbo lint && pnpm turbo typecheck` (full verification)

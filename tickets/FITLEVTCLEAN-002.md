# FITLEVTCLEAN-002: Reduce Kissinger unshaded concat from 3 sources to 2

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data file only
**Deps**: None

## Problem

Card-2 (Kissinger) unshaded uses a 3-source `concat` to query insurgent pieces in Cambodia/Laos — one source per piece type (troops, guerrillas, bases). The troops and guerrillas sources are identical except for `{ prop: type, eq: troops }` vs `{ prop: type, eq: guerrilla }`. These can be merged into a single source using `{ prop: type, op: in, value: ['troops', 'guerrilla'] }`, reducing repetition of the 5-line `spaceFilter` block.

The 3-source design was a deliberate choice to avoid applying the `tunnel: untunneled` filter to non-base types (which lack the `tunnel` property and would be incorrectly excluded). That concern remains valid — but only for the base source. Troops and guerrillas share identical filter logic and can safely be combined.

## Assumption Reassessment (2026-02-27)

1. `{ prop: type, op: in, value: [...] }` syntax is valid — already used for faction filtering in the same card: `{ prop: faction, op: in, value: ['NVA', 'VC'] }`.
2. The `tunnel` property issue only applies to bases — troops and guerrillas don't need a tunnel filter in either the 2-source or 3-source approach.
3. No active specs or tickets address this; Spec 51 (cross-game primitive elevation) covers compiler templates and kernel primitives, not data-file cleanup.

## Architecture Check

1. Reducing from 3 to 2 sources eliminates one full copy of the `spaceFilter` block (5 lines) and the redundant query header, making the card ~8 lines shorter and easier to read.
2. Change is entirely within `GameSpecDoc` YAML — no engine/kernel/compiler changes.
3. No backwards-compatibility shims; the compiled output is semantically identical (same tokens selected, same order-independence guarantee from `chooseN`).

## What to Change

### 1. Merge troops + guerrillas into a single concat source

Replace the first two `tokensInMapSpaces` sources in card-2 unshaded `concat`:

**Before** (3 sources):
```yaml
sources:
  - query: tokensInMapSpaces
    spaceFilter: { ... Cambodia+Laos ... }
    filter:
      - { prop: faction, op: in, value: ['NVA', 'VC'] }
      - { prop: type, eq: troops }
  - query: tokensInMapSpaces
    spaceFilter: { ... Cambodia+Laos ... }
    filter:
      - { prop: faction, op: in, value: ['NVA', 'VC'] }
      - { prop: type, eq: guerrilla }
  - query: tokensInMapSpaces
    spaceFilter: { ... Cambodia+Laos ... }
    filter:
      - { prop: faction, op: in, value: ['NVA', 'VC'] }
      - { prop: type, eq: base }
      - { prop: tunnel, eq: untunneled }
```

**After** (2 sources):
```yaml
sources:
  - query: tokensInMapSpaces
    spaceFilter: { ... Cambodia+Laos ... }
    filter:
      - { prop: faction, op: in, value: ['NVA', 'VC'] }
      - { prop: type, op: in, value: ['troops', 'guerrilla'] }
  - query: tokensInMapSpaces
    spaceFilter: { ... Cambodia+Laos ... }
    filter:
      - { prop: faction, op: in, value: ['NVA', 'VC'] }
      - { prop: type, eq: base }
      - { prop: tunnel, eq: untunneled }
```

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-1968-us.test.ts` (modify — update concat source count assertion if present)

## Out of Scope

- Refactoring other cards' concat sources (each card should be evaluated individually)
- Adding a DSL-level "shared filter" primitive to eliminate spaceFilter repetition
- Engine/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. Card-2 integration test continues to pass (may need source-count assertion updated from 3 to 2 in `chooseN.options.sources`)
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The set of tokens selectable by the unshaded `chooseN` is identical before and after (troops + guerrillas + untunneled bases of NVA/VC in Cambodia/Laos)
2. Compiled GameDef JSON for card-2 unshaded produces functionally equivalent `chooseN` options

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-1968-us.test.ts` — update Kissinger test if it asserts on concat source count (currently does not, so likely no change needed)

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`

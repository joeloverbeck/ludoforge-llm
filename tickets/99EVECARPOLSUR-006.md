# 99EVECARPOLSUR-006: Add FITL agent profile visibility entries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — game data only
**Deps**: 99EVECARPOLSUR-004

## Problem

The FITL agent profile (`92-agents.md`) does not declare visibility for the three new active-card surface categories. Without these entries, the card surfaces default to `hidden` and are inaccessible to the policy evaluator even though the infrastructure supports them.

## Assumption Reassessment (2026-03-31)

1. `data/games/fire-in-the-lake/92-agents.md` exists and contains the FITL agent profile YAML — confirmed.
2. The visibility section is under `agents.visibility` in the YAML — need to verify exact structure by reading the file.
3. FITL event cards are public information (the current event card is face-up) — `public` visibility is appropriate for all three categories.

## Architecture Check

1. This is a data-only change in game-specific YAML — no engine code modification.
2. Setting all three categories to `public` matches FITL's game rules: the current event card is visible to all players.
3. Games with hidden event cards would set different visibility — this is FITL-specific configuration, not a universal default.

## What to Change

### 1. Add visibility entries to `92-agents.md`

In the `agents.visibility` YAML section, add:

```yaml
activeCardIdentity:
  current: public
  preview:
    visibility: public
    allowWhenHiddenSampling: false
activeCardTag:
  current: public
  preview:
    visibility: public
    allowWhenHiddenSampling: false
activeCardMetadata:
  current: public
  preview:
    visibility: public
    allowWhenHiddenSampling: false
```

Read the file first to determine exact placement within the existing visibility block.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Texas Hold'em agent profile (no event decks — no visibility entries needed)
- Card tag enrichment (Spec 99 Part F — optional, incremental)
- Adding stateFeatures or scoreTerms that USE the card surfaces — that's evolution campaign work

## Acceptance Criteria

### Tests That Must Pass

1. FITL agent profile compiles without errors: `pnpm -F @ludoforge/engine test`
2. Compiled FITL `surfaceVisibility` includes `activeCardIdentity`, `activeCardTag`, `activeCardMetadata` with `current: 'public'`.
3. Existing FITL compilation and simulation tests pass unchanged.

### Invariants

1. Only FITL agent profile is modified — no engine code changes.
2. All three card visibility categories are set to `public` (matching FITL's face-up event card rule).

## Test Plan

### New/Modified Tests

1. No new test files — existing FITL compilation tests will validate the new entries compile correctly.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "fitl"` (targeted)
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`

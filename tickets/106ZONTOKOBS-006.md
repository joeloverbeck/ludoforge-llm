# 106ZONTOKOBS-006: Texas Hold'em migration, integration tests, and golden fixture updates

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + tests
**Deps**: `tickets/106ZONTOKOBS-003.md`, `tickets/106ZONTOKOBS-004.md`, `tickets/106ZONTOKOBS-005.md`, `specs/106-zone-token-observer-integration.md`

## Problem

Texas Hold'em has hidden hands and a hidden deck, but no observer-level zone visibility declarations. Per FOUNDATIONS.md #14, the Texas Hold'em game spec must be migrated to use the new `zones` field in observer profiles in the same change as the type additions. Integration tests must prove both FITL and Texas Hold'em compile and run correctly.

## Assumption Reassessment (2026-04-01)

1. Texas Hold'em game files at `data/games/texas-holdem/` — confirmed. Has `92-agents.md` but no `93-observability.md`.
2. Texas Hold'em entrypoint at `data/games/texas-holdem.game-spec.md` — must be verified at implementation time.
3. FITL `93-observability.md` exists with `currentPlayer` observer (from Spec 102) — confirmed. No zone overrides needed (all public).
4. Texas Hold'em zone definitions in `10-vocabulary.md` — confirmed. Must read at implementation time to determine zone base IDs and their visibility.
5. Texas Hold'em has no agent profiles with `observer` field — profiles use built-in `default`.

## Architecture Check

1. Foundation 14 compliance: Texas Hold'em migration is atomic with the zone type additions.
2. FITL needs no changes — all zones are public, observer defers to `ZoneDef.visibility`.
3. Texas Hold'em observer profile properly models hidden information in the observer contract.

## What to Change

### 1. Create Texas Hold'em observability file

Create `data/games/texas-holdem/93-observability.md` with zone visibility overrides:

```yaml
observability:
  observers:
    currentPlayer:
      zones:
        hand:
          tokens: owner
          order: owner
        deck:
          tokens: hidden
          order: hidden
        community:
          tokens: public
          order: public
        burn:
          tokens: hidden
          order: hidden
        muck:
          tokens: hidden
          order: hidden
```

Exact zone base IDs must be read from Texas Hold'em's `10-vocabulary.md` at implementation time.

### 2. Update Texas Hold'em entrypoint

Add `93-observability.md` to `data/games/texas-holdem.game-spec.md` imports.

### 3. Write integration tests

- End-to-end: FITL compiles with observer zones (no zone overrides, defers to `ZoneDef.visibility`)
- End-to-end: Texas Hold'em compiles with observer zones
- GameDef Zod validation passes for both
- Texas Hold'em `GameDef.observers` includes zone entries for hidden zones
- Behavioral equivalence: FITL observation unchanged

### 4. Update golden test fixtures

Update any golden fixtures affected by observer profile shape changes (profiles now may include `zones`).

## Files to Touch

- `data/games/texas-holdem/93-observability.md` (new)
- `data/games/texas-holdem.game-spec.md` (modify — add import)
- `packages/engine/test/integration/observer-zone-e2e.test.ts` (new)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify — if profile shape changed)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (modify — if affected)

## Out of Scope

- FITL zone overrides — not needed (all public zones)
- Runner-side observer enforcement — follow-up spec
- Passing observer profiles at `derivePlayerObservation` call sites — runner integration follow-up

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles successfully with observer zones
2. Texas Hold'em compiles successfully with observer zone overrides
3. Both GameDefs pass Zod schema validation
4. Texas Hold'em `GameDef.observers.observers.currentPlayer.zones` includes expected entries
5. FITL observer profiles have `zones: undefined` (no zone overrides)
6. Golden fixtures match updated compilation output

### Invariants

1. FITL behavior unchanged — no zone overrides, defers to `ZoneDef.visibility`
2. Texas Hold'em zone visibility accurately models the game's hidden information

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/observer-zone-e2e.test.ts` — cross-game zone observer integration tests

### Commands

1. `pnpm -F @ludoforge/engine test:e2e` — end-to-end tests
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm turbo typecheck` — type correctness

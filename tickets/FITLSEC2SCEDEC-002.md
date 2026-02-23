# FITLSEC2SCEDEC-002: Add `excludedCardIds` to Medium and Full Scenario Deck Compositions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None (Spec 44, Gap 2)

## Problem

In Medium and Full scenarios, pivotal event cards (card-121 through card-124) are distributed face-up to their owning factions — they are never shuffled into the draw deck. Neither scenario currently has `excludedCardIds`, so the 4 pivotals would incorrectly appear in the shuffled deck alongside regular events.

## Assumption Reassessment (2026-02-23)

1. Medium scenario `deckComposition` at line ~1795 of `40-content-data-assets.md`: `pileCount: 3`, `eventsPerPile: 12`, `coupsPerPile: 1`, no `excludedCardIds` — confirmed.
2. Full scenario `deckComposition` at line ~1086: `pileCount: 6`, `eventsPerPile: 12`, `coupsPerPile: 1`, no `excludedCardIds` — confirmed.
3. Both scenarios need the same 4 pivotal exclusions (card-121 through card-124). Medium does NOT need a Failed Attempt exclusion (unlike Short) — confirmed by rules.
4. `excludedCardIds` is already in the schema — no engine changes needed.

## Architecture Check

1. Pure data change — adds a YAML field the schema already supports. Zero engine code impact.
2. Game-specific data stays in `data/games/fire-in-the-lake/`. No kernel/compiler/runtime changes.
3. No aliasing or shims introduced.

## What to Change

### 1. Add `excludedCardIds` to Full scenario `deckComposition`

In `data/games/fire-in-the-lake/40-content-data-assets.md`, locate the Full scenario's `deckComposition` block (line ~1086) and add:

```yaml
      deckComposition:
        pileCount: 6
        eventsPerPile: 12
        coupsPerPile: 1
        excludedCardIds:
          - card-121   # Linebacker II (US pivotal)
          - card-122   # Easter Offensive (NVA pivotal)
          - card-123   # Vietnamization (ARVN pivotal)
          - card-124   # Tet Offensive (VC pivotal)
```

### 2. Add `excludedCardIds` to Medium scenario `deckComposition`

In the same file, locate the Medium scenario's `deckComposition` block (line ~1795) and add:

```yaml
      deckComposition:
        pileCount: 3
        eventsPerPile: 12
        coupsPerPile: 1
        excludedCardIds:
          - card-121   # Linebacker II (US pivotal)
          - card-122   # Easter Offensive (NVA pivotal)
          - card-123   # Vietnamization (ARVN pivotal)
          - card-124   # Tet Offensive (VC pivotal)
```

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — Full and Medium scenario `deckComposition` blocks)

## Out of Scope

- Short scenario deck composition (covered by FITLSEC2SCEDEC-001)
- `leaderBoxCardCount` initialization (covered by FITLSEC2SCEDEC-003)
- Pivotal single-use enforcement (covered by FITLSEC2SCEDEC-004)
- Period filter schema or data (covered by FITLSEC2SCEDEC-005)
- Any engine/compiler/kernel code changes
- Any changes to `41-content-event-decks.md`
- Any changes to `10-vocabulary.md` or `30-rules-actions.md`

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation
2. `pnpm turbo test` — all existing tests pass
3. **New test**: Compile production spec, find the `fitl-scenario-medium` scenario asset, and assert its `deckComposition.excludedCardIds` is an array of exactly 4 entries: `['card-121', 'card-122', 'card-123', 'card-124']`
4. **New test**: Compile production spec, find the `fitl-scenario-full` scenario asset, and assert its `deckComposition.excludedCardIds` is an array of exactly 4 entries: `['card-121', 'card-122', 'card-123', 'card-124']`

### Invariants

1. Full scenario's `pileCount`, `eventsPerPile`, and `coupsPerPile` remain unchanged (6, 12, 1).
2. Medium scenario's `pileCount`, `eventsPerPile`, and `coupsPerPile` remain unchanged (3, 12, 1).
3. Short scenario is not modified by this ticket.
4. The `ScenarioDeckCompositionSchema` and `ScenarioDeckComposition` interface remain unchanged.
5. All existing FITL compilation, scenario conservation, and derived value tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` — extend (or create if FITLSEC2SCEDEC-001 hasn't run yet) to add Medium and Full scenario `excludedCardIds` assertions via `compileProductionSpec()`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`

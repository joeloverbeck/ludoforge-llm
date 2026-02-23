# FITLSEC2SCEDEC-001: Add `excludedCardIds` to Short Scenario Deck Composition

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None (Spec 44, Gap 1)

## Problem

The Short scenario setup rules say "remove 1 Failed Coup and all Pivotal Events" from the draw deck. The current Short scenario `deckComposition` in `40-content-data-assets.md` (line ~1421) has no `excludedCardIds`, despite the schema already supporting it (`schemas-gamespec.ts:189`, `types-events.ts:131`). This means all 4 pivotals and both Failed Attempt coups would be shuffled into the draw deck, producing an incorrect deck composition.

## Assumption Reassessment (2026-02-23)

1. `excludedCardIds` is already defined in `ScenarioDeckCompositionSchema` (`schemas-gamespec.ts:189`) and `ScenarioDeckComposition` interface (`types-events.ts:131`) — confirmed, no schema changes needed.
2. Short scenario `deckComposition` at line ~1421 of `40-content-data-assets.md` has `pileCount: 3`, `eventsPerPile: 8`, `coupsPerPile: 1` and no `excludedCardIds` — confirmed.
3. Pivotal card IDs: card-121 (US), card-122 (NVA), card-123 (ARVN), card-124 (VC) — confirmed from `fitl-events-pivotal.test.ts`.
4. Failed Attempt coup cards: card-129 and card-130 — confirmed from `41-content-event-decks.md` lines ~4350-4373. Rules say remove 1 of 2, so exclude card-129 and keep card-130.

## Architecture Check

1. Pure data change — adds a YAML field the schema already supports. Zero engine code impact.
2. Game-specific data stays in `data/games/fire-in-the-lake/` (GameSpecDoc boundary). No kernel/compiler/runtime changes.
3. No aliasing or shims introduced.

## What to Change

### 1. Add `excludedCardIds` to Short scenario `deckComposition`

In `data/games/fire-in-the-lake/40-content-data-assets.md`, locate the Short scenario's `deckComposition` block (line ~1421) and add:

```yaml
      deckComposition:
        pileCount: 3
        eventsPerPile: 8
        coupsPerPile: 1
        excludedCardIds:
          - card-121   # Linebacker II (US pivotal)
          - card-122   # Easter Offensive (NVA pivotal)
          - card-123   # Vietnamization (ARVN pivotal)
          - card-124   # Tet Offensive (VC pivotal)
          - card-129   # Failed Attempt (1 of 2 removed in Short)
```

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — Short scenario `deckComposition`)

## Out of Scope

- Medium or Full scenario deck composition (covered by FITLSEC2SCEDEC-002)
- `leaderBoxCardCount` initialization (covered by FITLSEC2SCEDEC-003)
- Pivotal single-use enforcement (covered by FITLSEC2SCEDEC-004)
- Period filter schema or data (covered by FITLSEC2SCEDEC-005)
- Any engine/compiler/kernel code changes
- Any changes to `41-content-event-decks.md`
- Any changes to `10-vocabulary.md` or `30-rules-actions.md`

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation (no parser/validator errors from the modified YAML)
2. `pnpm turbo test` — all existing tests pass (no regressions)
3. **New test**: Compile production spec, find the `fitl-scenario-short` scenario asset, and assert its `deckComposition.excludedCardIds` is an array of exactly 5 entries: `['card-121', 'card-122', 'card-123', 'card-124', 'card-129']`

### Invariants

1. The Short scenario's `pileCount`, `eventsPerPile`, and `coupsPerPile` values remain unchanged (3, 8, 1).
2. No other scenario assets are modified by this ticket.
3. The `ScenarioDeckCompositionSchema` and `ScenarioDeckComposition` interface remain unchanged.
4. All existing FITL compilation and scenario tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` — new test file verifying Short scenario `excludedCardIds` count and content after compilation via `compileProductionSpec()`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`

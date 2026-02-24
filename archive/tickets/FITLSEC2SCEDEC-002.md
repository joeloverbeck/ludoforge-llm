# FITLSEC2SCEDEC-002: Add `excludedCardIds` to Medium and Full Scenario Deck Compositions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None (Spec 44, Gap 2)

## Problem

In Medium and Full scenarios, pivotal event cards (card-121 through card-124) are distributed face-up to their owning factions — they are never shuffled into the draw deck. Neither scenario currently has `excludedCardIds`, so the 4 pivotals would incorrectly appear in the shuffled deck alongside regular events.

## Assumption Reassessment (2026-02-24)

1. Full scenario `deckComposition` in `data/games/fire-in-the-lake/40-content-data-assets.md` currently has `pileCount: 6`, `eventsPerPile: 12`, `coupsPerPile: 1`, and **no** `excludedCardIds` — confirmed.
2. Medium scenario `deckComposition` in the same file currently has `pileCount: 3`, `eventsPerPile: 12`, `coupsPerPile: 1`, and **no** `excludedCardIds` — confirmed.
3. Short scenario deck exclusions are already implemented (including `card-129`) and covered by `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts`; this ticket must not duplicate or alter Short behavior.
4. `ScenarioDeckCompositionSchema` and `ScenarioDeckComposition` already support `excludedCardIds`; compiler/runtime already validate and materialize these filters. No schema/engine code changes are needed.
5. Rules references in `reports/fire-in-the-lake-rules-section-2.md` confirm Pivotal Events are distributed to factions in Medium/Full setup and therefore should not be in the shuffled deck.

## Architecture Check

1. The beneficial architectural move here is to keep scenario-specific deck composition declarative in scenario data, not in compiler/runtime branches.
2. This preserves the agnostic-engine contract: no FITL-specific conditions in shared deck materialization logic.
3. No aliasing/backward-compatibility shim is introduced; this is direct canonical data correction.
4. Broader refactor idea (out of scope): derive scenario exclusions from card tags (for example, `pivotal`) plus scenario setup rules. That could reduce duplication across scenarios but needs a separate design ticket because it changes data-model semantics.

## What to Change

### 1. Add `excludedCardIds` to Full scenario `deckComposition`

In `data/games/fire-in-the-lake/40-content-data-assets.md`, locate the Full scenario's `deckComposition` block and add:

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

In the same file, locate the Medium scenario's `deckComposition` block and add:

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

### 3. Extend FITL scenario deck exclusions integration test

In `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts`, add assertions for:
- `fitl-scenario-full` `deckComposition.excludedCardIds`
- `fitl-scenario-medium` `deckComposition.excludedCardIds`

Each must assert exact match with `['card-121', 'card-122', 'card-123', 'card-124']`.

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify — Full and Medium scenario `deckComposition` blocks)
- `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` (modify — add Medium/Full assertions)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify — fix invalid `casualties-ARVN:none` zone references discovered by regression)
- `packages/engine/test/integration/fitl-events-full-deck.test.ts` (modify — add regression assertion preventing non-existent casualty-zone references)
- `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` (modify — harden deterministic setup assumptions revealed by deck correction)

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

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm turbo build`
4. `pnpm turbo test`
5. **Modified test**: `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` asserts Medium scenario exact exclusions `['card-121', 'card-122', 'card-123', 'card-124']`.
6. **Modified test**: Same file asserts Full scenario exact exclusions `['card-121', 'card-122', 'card-123', 'card-124']`.

### Invariants

1. Full scenario's `pileCount`, `eventsPerPile`, and `coupsPerPile` remain unchanged (6, 12, 1).
2. Medium scenario's `pileCount`, `eventsPerPile`, and `coupsPerPile` remain unchanged (3, 12, 1).
3. Short scenario is not modified by this ticket.
4. The `ScenarioDeckCompositionSchema` and `ScenarioDeckComposition` interface remain unchanged.
5. All existing FITL compilation, scenario conservation, and derived value tests continue to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-scenario-deck-exclusions.test.ts` — extend existing test coverage to include Medium and Full scenario `excludedCardIds` assertions via `compileProductionSpec()`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm turbo build && pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Added Full + Medium scenario `deckComposition.excludedCardIds` for pivotal cards (`card-121` through `card-124`).
  - Extended FITL scenario deck exclusions integration coverage to assert exact Medium + Full exclusions.
  - Fixed a surfaced FITL data defect (`card-108` referencing non-existent `casualties-ARVN:none`), replacing it with the canonical `casualties-US:none` zone.
  - Added a regression assertion to prevent future non-existent casualty-zone references in FITL event deck logic.
  - Hardened momentum prohibition test setup so it does not rely on brittle deterministic action-option assumptions.
- **Deviations from original plan**:
  - Ticket originally scoped out `41-content-event-decks.md` and additional test files. These were required because the deck correction exposed a real runtime data invariant violation and a brittle deterministic test assumption.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm turbo build` ✅
  - `pnpm turbo test` ✅

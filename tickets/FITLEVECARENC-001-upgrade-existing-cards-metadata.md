# FITLEVECARENC-001: Upgrade Existing Cards with Tags & Metadata

**Status**: TODO
**Priority**: P0 (prerequisite for all other tickets)
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md

## Description

The two existing cards in `data/games/fire-in-the-lake.md` (card-82 Domino Theory, card-27 Phoenix Program) lack the `tags`, `metadata` (period, factionOrder, flavorText), and `text` fields described in the spec's card definition format. Upgrade them to the new standard format so that all subsequent cards follow a consistent pattern.

Also add card-68 (Green Berets), which the spec marks as "done" but is **missing from the production data file**.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add `tags`, `metadata` (period, factionOrder, flavorText), and `text` fields to card-82 and card-27. Add card-68 definition.
- `test/integration/fitl-events-domino-theory.test.ts` — Add assertions for new `tags`, `metadata`, and `text` fields.
- `test/integration/fitl-events-phoenix-program.test.ts` — Add assertions for new `tags`, `metadata`, and `text` fields.
- `test/integration/fitl-events-green-berets.test.ts` — **New file**. Integration test for card-68.

## Out of Scope

- Changing `EventCardDef` types, Zod schemas, or JSON Schema (already support `tags`/`metadata`/`text`/`playCondition`).
- Changing event-execution.ts or cross-validate.ts (already have `playCondition` check and pivotal validation).
- Encoding any cards beyond 27, 68, and 82.
- Changing the compiler, parser, or kernel.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-domino-theory.test.ts` — existing assertions still pass, plus new assertions verify `metadata.period === "1965"`, `metadata.factionOrder` is `["ARVN", "VC", "US", "NVA"]`, `metadata.flavorText` is present, and `unshaded.text` / `shaded.text` are present.
2. `test/integration/fitl-events-phoenix-program.test.ts` — existing assertions still pass, plus new assertions verify `metadata.period === "1968"`, `metadata.factionOrder` is `["US", "VC", "ARVN", "NVA"]`, and `text` fields are present.
3. `test/integration/fitl-events-green-berets.test.ts` — card-68 compiles, has `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["ARVN", "US", "VC", "NVA"]`, correct `text` on both sides, correct effects (place pieces, set support for unshaded; remove irregulars, set opposition for shaded).
4. `npm run build` passes.
5. `npm test` passes (all existing tests unbroken).

### Invariants That Must Remain True

- All existing tests pass without modification to their core assertions (only additions).
- The production spec compiles without errors.
- Card IDs remain `card-27`, `card-68`, `card-82` (no renumbering).
- Card ordering by `order` field is preserved (27 < 68 < 82).

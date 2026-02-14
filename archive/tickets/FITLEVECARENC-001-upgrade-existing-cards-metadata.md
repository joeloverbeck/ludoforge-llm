# FITLEVECARENC-001: Upgrade Existing Cards with Tags & Metadata

**Status**: ✅ COMPLETED
**Priority**: P0 (prerequisite for all other tickets)
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md

## Description

The two existing cards in `data/games/fire-in-the-lake.md` (card-82 Domino Theory, card-27 Phoenix Program) lack the `tags`, `metadata` (period, factionOrder, flavorText), and `text` fields described in the spec's card definition format. Upgrade them to the new standard format so that all subsequent cards follow a consistent pattern.

Also add card-68 (Green Berets), which the spec marks as "done" but is **missing from the production data file**.

## Reassessed Assumptions (2026-02-14)

1. `data/games/fire-in-the-lake.md` currently defines only two event cards in `fitl-events-initial-card-pack`: `card-27` and `card-82`.
2. Existing integration tests for Domino Theory and Phoenix Program exist and currently validate structural compilation, ordering, and selected effects.
3. `test/integration/fitl-events-green-berets.test.ts` does not exist yet.
4. `test/integration/fitl-production-data-compilation.test.ts` currently hardcodes exactly 2 event cards and exact ID set `{card-27, card-82}`.
5. `EventCardDef` / schemas / runtime checks already support `tags`, `metadata`, `playCondition`, and side `text`; no engine/schema changes are required for this ticket.

## Architecture Rationale

- Adding `tags`/`metadata`/`text` at the data layer is aligned with the agnostic-engine architecture because these are declarative card payload fields, not hardcoded runtime branches.
- Replacing brittle exact-card-count assertions with invariant-focused assertions (required cards present + ordering constraints + deck identity) is more robust as the event catalog grows from tutorial cards toward the full 130-card deck.
- This ticket should remain data-and-tests focused; compiler/kernel/runtime changes would add coupling without benefit.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add `tags`, `metadata` (period, factionOrder, flavorText), and `text` fields to card-82 and card-27. Add card-68 definition.
- `test/integration/fitl-events-domino-theory.test.ts` — Add assertions for new `tags`, `metadata`, and `text` fields.
- `test/integration/fitl-events-phoenix-program.test.ts` — Add assertions for new `tags`, `metadata`, and `text` fields.
- `test/integration/fitl-events-green-berets.test.ts` — **New file**. Integration test for card-68.
- `test/integration/fitl-production-data-compilation.test.ts` — Update brittle event-card-count assumptions to invariants compatible with ongoing deck expansion.

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
4. `test/integration/fitl-production-data-compilation.test.ts` — validates event deck presence and required card IDs including `card-68`, without asserting a frozen total card count that would block future card additions.
5. `npm run build` passes.
6. `npm test` passes (all existing tests unbroken).

### Invariants That Must Remain True

- All existing tests pass without modification to their core assertions (only additions).
- The production spec compiles without errors.
- Card IDs remain `card-27`, `card-68`, `card-82` (no renumbering).
- Card ordering by `order` field is preserved (27 < 68 < 82).

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added `tags`, `metadata`, and side `text` to `card-82` and `card-27` in `data/games/fire-in-the-lake.md`.
  - Added `card-68` (Green Berets) to the production event deck with dual-side text/metadata and declarative effect structures for placement/support and removal/opposition.
  - Extended existing integration tests for Domino Theory and Phoenix Program to assert new metadata/text fields.
  - Added new integration test `test/integration/fitl-events-green-berets.test.ts`.
  - Updated `test/integration/fitl-production-data-compilation.test.ts` to validate required card inclusion plus `order` invariants instead of brittle exact deck-size assumptions.
- **Deviation from original plan**:
  - The ticket originally did not include `test/integration/fitl-production-data-compilation.test.ts`; this was added after reassessment because it hardcoded the legacy two-card deck assumption.
- **Verification**:
  - `npm run build` passed.
  - Targeted FITL integration tests passed:
    - `dist/test/integration/fitl-events-domino-theory.test.js`
    - `dist/test/integration/fitl-events-phoenix-program.test.js`
    - `dist/test/integration/fitl-events-green-berets.test.js`
    - `dist/test/integration/fitl-production-data-compilation.test.js`
  - `npm test` passed.
  - `npm run lint` passed.

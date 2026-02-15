# FITLEVECARENC-012: 1968 Period — US-First Faction Order Cards

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: archive/tickets/FITLEVECARENC-001-upgrade-existing-cards-metadata.md

## Description

Encode the 1968 period cards where US is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 2 | Kissinger | US, NVA, ARVN, VC | High | Die roll removal; multi-faction effects |
| 3 | Peace Talks | US, NVA, ARVN, VC | High | Conditional capability marker (Linebacker 11) |
| 4 | Top Gun | US, NVA, ARVN, VC | Medium | US Capability |
| 9 | Psychedelic Cookie | US, NVA, VC, ARVN | Medium | Troop movement |
| 11 | Abrams | US, ARVN, NVA, VC | Medium | US Capability |
| 12 | Capt Buck Adams | US, ARVN, NVA, VC | Medium | Flip + removal |
| 13 | Cobras | US, ARVN, NVA, VC | Medium | US Capability; die roll |
| 16 | Blowtorch Komer | US, ARVN, VC, NVA | Medium | Momentum (unshaded) |
| 19 | CORDS | US, ARVN, VC, NVA | Medium | US Capability |
| 20 | Laser Guided Bombs | US, ARVN, VC, NVA | Medium | US Capability |
| 21 | Americal | US, VC, NVA, ARVN | Medium | Troop movement; Opposition shift |
| 27 | Phoenix Program | US, VC, ARVN, NVA | Low | Already exists (FITLEVECARENC-001) |
| 30 | USS New Jersey | US, VC, ARVN, NVA | Medium | Free Air Strikes coastal |

**Note**: Card 27 (Phoenix Program) is already encoded. Skip it. That leaves 12 cards.

## Reassessed Assumptions (2026-02-15)

1. The 12 target cards (`2, 3, 4, 9, 11, 12, 13, 16, 19, 20, 21, 30`) are not yet encoded in `data/games/fire-in-the-lake.md`; `card-27` (Phoenix Program) already exists and remains in scope only for non-regression assertions.
2. Capability cards are modeled in current architecture via global marker lattices and compile to `setGlobalMarker` effects, not `setVar` toggles. Relevant marker IDs already exist (`cap_topGun`, `cap_abrams`, `cap_cobras`, `cap_cords`, `cap_lgbs`).
3. Momentum cards are modeled using `lastingEffects` with `duration: round`; compiler output resolves setup/teardown to `setVar` global flag toggles.
4. Existing operation profiles already consume the target capability markers (Air Strike/Sweep/Assault/Train branches), so encoding these cards is high leverage and architecture-aligned.
5. No kernel/compiler/schema changes are required for this ticket; this is data + integration-test work only.
6. Card 3 (Peace Talks) references a conditional "Linebacker 11" rulebook construct, but there is no current engine consumer for a dedicated marker. Adding an unconsumed marker in this ticket would be dead state and architectural noise.

## Architecture Rationale

- Implementing the five US capability cards as canonical marker toggles improves correctness because runtime branches already gate on those markers.
- Encoding uncertain high-complexity card logic as text-first (while still providing required metadata/side payloads) is preferable to introducing speculative mechanics that could regress event behavior.
- Deferring "Linebacker 11" to a focused follow-up ticket is cleaner than introducing an unused global variable/marker now.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1968-us.test.ts` — **New file**. Integration tests.

## Out of Scope

- Card 27 (already exists).
- Other period/faction group cards.
- Any kernel/compiler changes.
- New global variables/markers that are not consumed by current runtime logic (for example a standalone `Linebacker 11` marker in this ticket).

## Encoding Notes

- **Capabilities** (4, 11, 13, 19, 20): Use `set-global-marker` (`cap_topGun`, `cap_abrams`, `cap_cobras`, `cap_cords`, `cap_lgbs`). Tags: `["capability", "US"]`.
- **Momentum** (16 unshaded): `lastingEffects` with `duration: "round"`.
- **Card 3 (Peace Talks)**: Keep declarative card metadata/text complete; do not introduce an unconsumed Linebacker marker in this ticket.
- **Die rolls** (2, 13): DSL supports `rollRandom`; use only where behavior is clear and testable.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-us.test.ts`:
   - All 12 cards compile, correct metadata, faction orders.
   - Capability cards: correct `setGlobalMarker`, correct tags.
   - Card 16: momentum `lastingEffects`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- Card 27 definition unchanged. All existing cards unchanged.
- Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

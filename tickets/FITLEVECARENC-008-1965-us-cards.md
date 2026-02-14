# FITLEVECARENC-008: 1965 Period — US-First Faction Order Cards

**Status**: TODO
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where US is the first faction in the order. Sub-batching the 48-card 1965 period by first-faction keeps batches reviewable. Cards:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 5 | Wild Weasels | US, NVA, ARVN, VC | Medium | Momentum (shaded) |
| 6 | Aces | US, NVA, VC, ARVN | Medium | Free Air Strike |
| 7 | ADSID | US, NVA, VC, ARVN | Medium | Momentum (unshaded) |
| 8 | Arc Light | US, NVA, VC, ARVN | Medium | US Capability |
| 10 | Rolling Thunder | US, NVA, VC, ARVN | Medium | Momentum (shaded) |
| 14 | M-48 Patton | US, ARVN, NVA, VC | Medium | US Capability |
| 18 | Combined Action Platoons | US, ARVN, VC, NVA | Medium | US Capability |
| 22 | Da Nang | US, VC, NVA, ARVN | Medium | Momentum (shaded) |
| 23 | Operation Attleboro | US, VC, NVA, ARVN | High | Multi-step: Air Lift + Sweep + Assault |
| 24 | Operation Starlite | US, VC, NVA, ARVN | Medium | Remove all VC from coastal |
| 25 | TF-116 Riverines | US, VC, NVA, ARVN | High | LoC operations, Mekong |
| 28 | Search and Destroy | US, VC, ARVN, NVA | Medium | US Capability |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1965-us.test.ts` — **New file**. Integration tests.

## Out of Scope

- 1965 cards where NVA, ARVN, or VC is first faction.
- 1964 period cards.
- 1968 period cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Capabilities** (8, 14, 18, 28): Set appropriate `cap*` variable. Tags: `["capability", "US"]`.
- **Momentum** (5 shaded, 7 unshaded, 10 shaded, 22 shaded): `lastingEffects` with `duration: "round"`. Tags: `["momentum"]`.
- **Multi-step operations** (23, 25): May require sequential `freeOp` chains. Flag expressiveness gaps.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-us.test.ts`:
   - All 12 cards compile without errors.
   - Each card: correct `sideMode`, `metadata.period === "1965"`, `metadata.factionOrder`, `text` fields.
   - Capability cards have `setVar` for correct capability var and tags include `"capability"`.
   - Momentum cards have `lastingEffects` with `duration: "round"` and tags include `"momentum"`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

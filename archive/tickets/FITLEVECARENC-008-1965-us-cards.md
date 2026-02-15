# FITLEVECARENC-008: 1965 Period — US-First Faction Order Cards

**Status**: ✅ COMPLETED
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

## Assumption Reassessment

- `data/games/fire-in-the-lake.md` is the active production spec source for FITL card encoding in this repo.
- Capability cards in current architecture are encoded via `setGlobalMarker` on capability marker lattices (for example `cap_aaa`), not `setVar`.
- Momentum cards in current architecture are encoded via `lastingEffects` with `duration: round` and setup/teardown `setVar` toggles of predeclared `mom_*` global vars.
- Multi-step "free X then Y then Z" flows (cards 23, 25) are not currently enforced as strict ordered operation pipelines at the card payload level; encode them declaratively with free-operation grants/effects consistent with existing engine primitives, without kernel/compiler changes.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1965-us.test.ts` — **New file**. Integration tests.

## Out of Scope

- 1965 cards where NVA, ARVN, or VC is first faction.
- 1964 period cards.
- 1968 period cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Capabilities** (8, 14, 18, 28): Set appropriate capability marker via `setGlobalMarker` (`cap_arcLight`, `cap_m48Patton`, `cap_caps`, `cap_searchAndDestroy`). Tags: `["capability", "US"]`.
- **Momentum** (5 shaded, 7 unshaded, 10 shaded, 22 shaded): `lastingEffects` with `duration: round`, plus setup/teardown `setVar` toggles of the corresponding predeclared `mom_*` global vars. Tags: `["momentum"]`.
- **Multi-step operations** (23, 25): May require sequential `freeOp` chains. Flag expressiveness gaps.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-us.test.ts`:
   - All 12 cards compile without errors.
   - Each card: correct `sideMode`, `metadata.period === "1965"`, `metadata.factionOrder`, `text` fields.
   - Capability cards use `setGlobalMarker` for the correct capability marker and tags include `"capability"`.
   - Momentum cards have `lastingEffects` with `duration: "round"`, include setup/teardown `setVar` toggles for the correct `mom_*` var, and tags include `"momentum"`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 12 US-first 1965 event cards (`5, 6, 7, 8, 10, 14, 18, 22, 23, 24, 25, 28`) to `data/games/fire-in-the-lake.md`.
  - Added `test/integration/fitl-events-1965-us.test.ts` with metadata/card-shape assertions plus capability and momentum encoding checks.
  - Updated this ticket’s assumptions/scope to match the current architecture (`setGlobalMarker` for capabilities, `lastingEffects` + `setVar` toggles for momentum).
- **Deviations from original plan**:
  - Capability acceptance criteria were corrected from `setVar` to `setGlobalMarker` to match the existing marker-lattice architecture.
  - Complex free-op sequencing cards (23, 25) were encoded declaratively without introducing kernel/compiler changes.
- **Verification**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.

# FITLEVECARENC-009: 1965 Period — NVA-First Faction Order Cards

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where NVA is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 34 | SA-2s | NVA, US, ARVN, VC | Medium | NVA Capability |
| 38 | McNamara Line | NVA, US, VC, ARVN | High | Momentum, no shaded |
| 39 | Oriskany | NVA, US, VC, ARVN | Medium | Momentum (shaded) |
| 46 | 559th Transport Grp | NVA, ARVN, VC, US | Medium | Momentum (unshaded) |
| 47 | Chu Luc | NVA, ARVN, VC, US | Medium | Troop placement |
| 53 | Sappers | NVA, VC, US, ARVN | Medium | Piece removal |
| 56 | Vo Nguyen Giap | NVA, VC, ARVN, US | High | Free March + free Op/SA |
| 59 | Plei Mei | NVA, VC, ARVN, US | Medium | Piece removal + free March/Attack |

## Assumption Reassessment

- `data/games/fire-in-the-lake.md` is still the active FITL production source, and these 8 NVA-first 1965 cards are currently **missing** from the event deck.
- Existing engine/data architecture encodes capabilities with `setGlobalMarker` against predefined marker lattices (for example `cap_sa2s`), not raw `setVar` flags.
- Existing engine/data architecture encodes momentum via `lastingEffects` (`duration: round`) that toggle predeclared `mom_*` global vars via setup/teardown `setVar`.
- The relevant momentum/capability hooks already exist in runtime profiles and globals (`mom_mcnamaraLine`, `mom_oriskany`, `mom_559thTransportGrp`, `cap_sa2s`), so this ticket’s scope is to wire missing card payloads to those generic hooks.
- For cards with no second side text (card 38), prefer canonical `sideMode: single` encoding instead of dual-side placeholders.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 8 card definitions.
- `test/integration/fitl-events-1965-nva.test.ts` — **New file**. Integration tests.

## Out of Scope

- 1965 cards where US, ARVN, or VC is first faction.
- Other period cards.
- Any kernel/compiler changes.

## Encoding Notes (Corrected)

- **Card 34 (SA-2s)**: NVA capability via `setGlobalMarker` for `cap_sa2s`. Tags: `["capability", "NVA"]`.
- **Card 38 (McNamara Line)**: No shaded text. Encode as `sideMode: "single"` with unshaded payload only. Momentum via `lastingEffects` toggling `mom_mcnamaraLine`. Tags include `"momentum"`.
- **Card 39 (Oriskany)**: Shaded momentum via `lastingEffects` toggling `mom_oriskany`.
- **Card 46 (559th Transport Grp)**: Unshaded momentum via `lastingEffects` toggling `mom_559thTransportGrp`.
- **Card 56 (Vo Nguyen Giap)**: Multi-step free-activity semantics should be encoded with existing declarative primitives (for example branches/free operation grants) without adding bespoke engine logic.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-nva.test.ts`:
   - All 8 cards compile, with correct IDs/titles/orders, 1965 metadata, faction orders, and expected side payload shape.
   - Card 34: capability marker toggle uses `setGlobalMarker` for `cap_sa2s`, with tags `["capability", "NVA"]`.
   - Cards 38, 39, 46: momentum `lastingEffects` use `duration: "round"` and setup/teardown toggles for `mom_mcnamaraLine`, `mom_oriskany`, `mom_559thTransportGrp` respectively.
2. `npm run build` passes.
3. `npm test` passes.
4. `npm run lint` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 8 NVA-first 1965 event cards (`34, 38, 39, 46, 47, 53, 56, 59`) to `data/games/fire-in-the-lake.md`.
  - Added `test/integration/fitl-events-1965-nva.test.ts` with metadata/side-shape coverage and focused capability/momentum assertions.
  - Corrected this ticket’s architecture assumptions before implementation (`setGlobalMarker` capabilities, `lastingEffects` + `setVar` momentum toggles, `sideMode: single` for no-shaded card 38).
- **Deviations from original plan**:
  - Capability acceptance criteria were corrected from `setVar` to `setGlobalMarker` to match existing marker-lattice architecture.
  - Card 38 was encoded as canonical `sideMode: single` rather than dual-side placeholder encoding.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-1965-nva.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.

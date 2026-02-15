# FITLEVECARENC-011: VC-First Batch — 1965 Cards + Card 116 Carryover

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the remaining VC-first cards for this batch:
- 11 cards from period **1965**
- plus **card 116 (Cadres)** as an explicit carryover (period **1964**) to complete the missing VC capability event wiring.

| # | Title | Period | Faction Order | Complexity | Notes |
|---|-------|--------|---------------|------------|-------|
| 95 | Westmoreland | 1965 | VC, US, NVA, ARVN | High | Free Air Lift + Sweep/Assault + Air Strike |
| 98 | Long Tan | 1965 | VC, US, ARVN, NVA | Medium | Piece placement or removal |
| 99 | Masher/White Wing | 1965 | VC, US, ARVN, NVA | Medium | Free Sweep + Assault "as US" |
| 100 | Rach Ba Rai | 1965 | VC, US, ARVN, NVA | Medium | Remove VC or non-Troop NVA; die roll |
| 102 | Cu Chi | 1965 | VC, NVA, US, ARVN | Medium | Tunnel removal/placement |
| 104 | Main Force Bns | 1965 | VC, NVA, US, ARVN | Medium | VC Capability |
| 105 | Rural Pressure | 1965 | VC, NVA, US, ARVN | Low | Support/Opposition shifts |
| 106 | Binh Duong | 1965 | VC, NVA, ARVN, US | Medium | Shifts + piece placement, no shaded |
| 108 | Draft Dodgers | 1965 | VC, NVA, ARVN, US | Low | Conditional Troop movement |
| 109 | Nguyen Huu Tho | 1965 | VC, NVA, ARVN, US | Medium | City shifts; Base + Guerrilla placement |
| 114 | Tri Quang | 1965 | VC, ARVN, US, NVA | Medium | City Support setting; Opposition shifts |
| 116 | Cadres | 1964 | VC, ARVN, NVA, US | Medium | VC Capability (carryover) |

12 cards total.

## Assumption Reassessment

- `data/games/fire-in-the-lake.md` is still the canonical FITL production source, and these 12 card definitions are currently missing.
- Existing architecture encodes capability cards via global marker lattices and `setGlobalMarker` effects (typically through the `set-global-marker` macro), not raw `setVar` toggles.
- Existing architecture encodes no-shaded cards as `sideMode: single` rather than dual-side placeholders.
- Card 116 (`Cadres`) is period `1964` in the source spec; this ticket keeps it in scope as an intentional carryover to complete missing VC capability coverage.
- No kernel/compiler changes are needed; this is a data + integration-test encoding task.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 12 card definitions.
- `test/integration/fitl-events-1965-vc.test.ts` — **New file**. Integration tests.

## Out of Scope

- Other missing cards outside this 12-card batch.
- Any kernel/compiler changes.

## Encoding Notes (Corrected)

- **Card 104 (Main Force Bns)**: VC capability via `setGlobalMarker` for `cap_mainForceBns`. Tags: `[`capability`, `VC`]`.
- **Card 116 (Cadres)**: VC capability via `setGlobalMarker` for `cap_cadres`. Tags: `[`capability`, `VC`]`.
- **Card 106 (Binh Duong)**: No shaded text; encode as `sideMode: single`.
- **Card 95 (Westmoreland)**: Encode multi-step free-operation intent with existing declarative event primitives (for example free-operation grants/branches), without adding bespoke engine handlers.
- **Card 100 (Rach Ba Rai)**: Preserve die-roll semantics in text and encode no custom primitives.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-vc.test.ts`:
   - All 12 cards compile with correct IDs/titles/orders, faction orders, and expected side payload shape.
   - Cards `95, 98, 99, 100, 102, 104, 105, 106, 108, 109, 114` have `metadata.period === "1965"`.
   - Card `116` has `metadata.period === "1964"`.
   - Cards `104` and `116` encode capability marker toggles via `setGlobalMarker` (`cap_mainForceBns`, `cap_cadres`) and include tags `[`capability`, `VC`]`.
   - Card `106` is encoded as `sideMode: "single"` with no shaded payload.
2. `npm run build` passes.
3. `npm test` passes.
4. `npm run lint` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 12 VC-first batch event cards to `data/games/fire-in-the-lake.md`: `95, 98, 99, 100, 102, 104, 105, 106, 108, 109, 114, 116`.
  - Added `test/integration/fitl-events-1965-vc.test.ts` with metadata/shape assertions, capability marker-toggle assertions, and free-operation grant assertions for cards 95/99.
  - Corrected ticket assumptions before implementation to align with current architecture (`setGlobalMarker` capability toggles, `sideMode: single` for no-shaded cards, and card 116 period metadata).
- **Deviations from original plan**:
  - Scope wording was corrected from “1965-only” to “1965 VC-first batch + card 116 carryover”, because card 116 is period 1964 in source definitions.
  - Capability acceptance criteria were corrected from `setVar` to marker-based toggles (`setGlobalMarker` / `set-global-marker` macro expansion).
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-1965-vc.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.

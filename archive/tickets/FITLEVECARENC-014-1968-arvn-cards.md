# FITLEVECARENC-014: 1968 Period — ARVN-First Faction Order Cards

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.4, Phase 4)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1968 period cards where ARVN is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 61 | Armored Cavalry | ARVN, US, NVA, VC | Medium | ARVN Capability |
| 62 | Cambodian Civil War | ARVN, US, NVA, VC | High | Free Air Lift + Sweep; Base removal |
| 65 | International Forces | ARVN, US, NVA, VC | Low | Pieces from out-of-play; die roll |
| 71 | An Loc | ARVN, NVA, US, VC | Medium | Troop removal + placement |
| 74 | Lam Son 719 | ARVN, NVA, US, VC | Medium | Troop placement + Trail degrade |
| 77 | Detente | ARVN, NVA, VC, US | Medium | Resource halving |
| 80 | Light at the End of the Tunnel | ARVN, NVA, VC, US | High | Multi-step per-piece effects, no shaded |
| 84 | To Quoc | ARVN, VC, US, NVA | Medium | Piece placement per space |
| 88 | Phan Quang Dan | ARVN, VC, NVA, US | Low | Saigon shifts + Patronage |

9 cards total.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 9 card definitions.
- `test/integration/fitl-events-1968-arvn.test.ts` — **New file**. Integration tests following the existing production-spec batch pattern.

## Out of Scope

- Other period/faction group cards.
- Any kernel/compiler changes.

## Assumptions Revalidated (Code/Test Reality)

- The target cards are currently missing from `data/games/fire-in-the-lake.md` (`card-61`, `62`, `65`, `71`, `74`, `77`, `80`, `84`, `88`).
- Integration coverage for 1968 currently exists for US-first and NVA-first only (`fitl-events-1968-us.test.ts`, `fitl-events-1968-nva.test.ts`); ARVN-first coverage is missing.
- Capability encoding in this codebase is marker-lattice based (`setGlobalMarker` to `unshaded`/`shaded`), not legacy/global-var toggles.
- Cards with no shaded text are encoded as `sideMode: single` and must omit `shaded` payloads.
- Architecture direction remains data-first: implement card behavior in event-card YAML only; no engine branching or game-specific kernel logic.

## Encoding Notes

- **Card 61 (Armored Cavalry)**: ARVN Capability. Tags: `["capability", "ARVN"]`. Encode with `setGlobalMarker` (`cap_armoredCavalry`) on both sides.
- **Card 77 (Detente)**: "Cut resources to half" should be encoded with expression-driven `setVar` assignments (integer floor semantics via existing expression behavior).
- **Card 80 (Light at the End of the Tunnel)**: No shaded text, so encode as `sideMode: single` with unshaded only.
- Prefer existing reusable effect/macro patterns where possible to keep event encoding DRY.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1968-arvn.test.ts`:
   - All 9 cards compile with correct metadata and faction orders.
   - Card 80 is asserted as `sideMode: single` with no `shaded` payload.
   - Card 61 capability is asserted as marker toggle effects (`setGlobalMarker` to `unshaded`/`shaded`) with tags `["capability", "ARVN"]`.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 9 ARVN-first 1968 event cards (`61`, `62`, `65`, `71`, `74`, `77`, `80`, `84`, `88`) to `data/games/fire-in-the-lake.md`.
  - Implemented `card-61` capability wiring as tri-state global marker toggles (`cap_armoredCavalry`) for unshaded/shaded.
  - Encoded `card-80` as `sideMode: single` (no shaded payload).
  - Added `test/integration/fitl-events-1968-arvn.test.ts` covering metadata/side-mode invariants, capability marker wiring, and Detente resource-halving expression shape.
- **Deviations from original plan**:
  - Corrected outdated assumption from capability `setVar` to marker-lattice `setGlobalMarker` architecture.
  - Expanded acceptance to assert single-side invariant for card 80 and expression encoding for card 77.
- **Verification**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm run test:integration -- --test-name-pattern='FITL 1968 ARVN-first event-card production spec'` ✅
  - `npm test` ✅

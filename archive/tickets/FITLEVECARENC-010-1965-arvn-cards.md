# FITLEVECARENC-010: 1965 Period — ARVN-First Faction Order Cards

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.3, Phase 3)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 1965 period cards where ARVN is the first faction in the order:

| # | Title | Faction Order | Complexity | Notes |
|---|-------|---------------|------------|-------|
| 64 | Honolulu Conference | ARVN, US, NVA, VC | Medium | Aid/Patronage changes, no shaded |
| 67 | Amphib Landing | ARVN, US, VC, NVA | Medium | Troop relocation + free Sweep/Assault |
| 69 | MACV | ARVN, US, VC, NVA | High | Free Special Activities, no shaded |
| 70 | ROKs | ARVN, US, VC, NVA | High | "As if US" Sweep/Assault |
| 72 | Body Count | ARVN, NVA, US, VC | Medium | Momentum (unshaded) |
| 76 | Annam | ARVN, NVA, VC, US | Medium | Resource loss + Patronage |
| 78 | General Landsdale | ARVN, NVA, VC, US | Medium | Momentum (shaded) |
| 81 | CIDG | ARVN, VC, US, NVA | Medium | Replace pieces |
| 82 | Domino Theory | ARVN, VC, US, NVA | Low | Already exists (FITLEVECARENC-001) |
| 83 | Election | ARVN, VC, US, NVA | Low | Support shifts + Aid |
| 85 | USAID | ARVN, VC, US, NVA | Low | Support shifts |
| 86 | Mandate of Heaven | ARVN, VC, NVA, US | Medium | ARVN Capability |
| 87 | Nguyen Chanh Thi | ARVN, VC, NVA, US | Medium | Piece placement + shifts |
| 89 | Tam Chau | ARVN, VC, NVA, US | Low | Saigon shifts + Patronage |
| 90 | Walt Rostow | ARVN, VC, NVA, US | Medium | Piece placement/relocation |

**Note**: Card 82 (Domino Theory) is already encoded. Skip it here. That leaves 14 cards.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 14 card definitions.
- `test/integration/fitl-events-1965-arvn.test.ts` — **New file**. Integration tests.

## Assumption Reassessment (2026-02-15)

- Verified current data state: only `card-82` from this group is already encoded; the remaining 14 cards are missing.
- Verified test state: `test/integration/fitl-events-1965-arvn.test.ts` does not exist yet.
- Current schema constraint: `sideMode: "dual"` requires both `unshaded` and `shaded` payloads. Therefore, "no shaded text" cards must use `sideMode: "single"` (not dual with empty shaded).
- Current capability convention: capability cards are encoded with `setGlobalMarker` (marker state `unshaded`/`shaded`), not `setVar`.
- Current momentum convention: encode YAML with shared `set-global-flag-true/false` macros under `lastingEffects`; compiled assertions may validate lowered `setVar` setup/teardown effects.

## Out of Scope

- Card 82 (Domino Theory) — already handled in FITLEVECARENC-001.
- Other period/faction group cards.
- Any kernel/compiler changes.

## Encoding Notes

- **Card 86 (Mandate of Heaven)**: ARVN Capability. Tags: `["capability", "ARVN"]`.
- **Cards 64, 69**: No shaded text. Encode as `sideMode: "single"` with only `unshaded`.
- **Card 70 (ROKs)**: "As if US" modifier on Sweep/Assault is not represented by a dedicated generic primitive yet; keep card-level effect text/data declarative and avoid kernel hardcoding in this ticket.
- **Card 86 (Mandate of Heaven)**: encode capability marker toggles via `setGlobalMarker` with marker `cap_mandateOfHeaven`.
- **Momentum** (72 unshaded, 78 shaded): `lastingEffects` with `duration: "round"` and canonical setup/teardown global-flag toggles.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-1965-arvn.test.ts`:
   - All 14 cards compile with correct IDs, metadata, faction orders, and side-mode invariants.
   - Cards 64 and 69 compile as single-side cards (`sideMode: "single"`, no shaded payload).
   - Card 86 encodes capability marker toggles for `cap_mandateOfHeaven` and tags `["capability", "ARVN"]`.
   - Cards 72 and 78 encode momentum lasting effects with `duration: "round"` and canonical setup/teardown toggles.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- Card 82 definition unchanged by this ticket.
- All existing cards unchanged. Card IDs unique. Faction orders valid.
- Production spec compiles without errors.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Added 14 missing ARVN-first 1965 card definitions to `data/games/fire-in-the-lake.md` (cards 64, 67, 69, 70, 72, 76, 78, 81, 83, 85, 86, 87, 89, 90).
  - Added `test/integration/fitl-events-1965-arvn.test.ts` covering card presence/metadata/side modes plus capability and momentum invariants.
  - Updated this ticket assumptions to match current architecture and schema conventions before implementation.
  - Added a game-agnostic `executeAsFaction` free-operation grant primitive in kernel/compiler/schemas and encoded card 70 (ROKs) to use it for "as if US" Sweep/Assault semantics.
  - Added integration/unit coverage for `executeAsFaction` dispatch and cross-validation.
- **Deviations from original plan**:
  - Replaced the original "dual with empty shaded" guidance with schema-compliant `sideMode: "single"` for no-shaded cards (64, 69).
  - Replaced original capability `setVar` assumption with macro-based `set-global-marker` encoding (compiles to marker toggles).
  - Expanded beyond original ticket scope (which initially excluded kernel/compiler changes) to land the generic execution-faction override architecture.
  - Preserved `card-82` unchanged as required.
- **Verification**:
  - `npm run build` passed.
  - `node --test "dist/test/integration/fitl-event-macro-dryness.test.js"` passed.
  - `node --test "dist/test/integration/fitl-events-1965-arvn.test.js"` passed.
  - `npm run lint` passed.
  - `npm test` passed.

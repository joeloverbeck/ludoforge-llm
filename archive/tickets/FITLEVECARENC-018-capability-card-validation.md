# FITLEVECARENC-018: Capability-Granting Card Cross-Validation

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.7)
**Depends on**: FITLEVECARENC-004, FITLEVECARENC-008, FITLEVECARENC-009, FITLEVECARENC-010, FITLEVECARENC-011, FITLEVECARENC-012, FITLEVECARENC-013, FITLEVECARENC-014

## Description

After all capability-granting cards are encoded, run a validation pass to verify each card correctly references its Spec 28 capability global marker ID and sets the correct side (unshaded/shaded).

Current FITL architecture encodes capabilities as tri-state global marker lattices. Event cards set capability state via `setGlobalMarker` (currently authored through the shared `set-global-marker` macro), not via `setVar`.

### Expected Capability Cards

| # | Title | Faction | Capability Marker ID | Unshaded Sets | Shaded Sets |
|---|-------|---------|------------|---------------|-------------|
| 4 | Top Gun | US | cap_topGun | "unshaded" | "shaded" |
| 8 | Arc Light | US | cap_arcLight | "unshaded" | "shaded" |
| 11 | Abrams | US | cap_abrams | "unshaded" | "shaded" |
| 13 | Cobras | US | cap_cobras | "unshaded" | "shaded" |
| 14 | M-48 Patton | US | cap_m48Patton | "unshaded" | "shaded" |
| 18 | Combined Action Platoons | US | cap_caps | "unshaded" | "shaded" |
| 19 | CORDS | US | cap_cords | "unshaded" | "shaded" |
| 20 | Laser Guided Bombs | US | cap_lgbs | "unshaded" | "shaded" |
| 28 | Search and Destroy | US | cap_searchAndDestroy | "unshaded" | "shaded" |
| 31 | AAA | NVA | cap_aaa | "unshaded" | "shaded" |
| 32 | Long Range Guns | NVA | cap_longRangeGuns | "unshaded" | "shaded" |
| 33 | MiGs | NVA | cap_migs | "unshaded" | "shaded" |
| 34 | SA-2s | NVA | cap_sa2s | "unshaded" | "shaded" |
| 45 | PT-76 | NVA | cap_pt76 | "unshaded" | "shaded" |
| 61 | Armored Cavalry | ARVN | cap_armoredCavalry | "unshaded" | "shaded" |
| 86 | Mandate of Heaven | ARVN | cap_mandateOfHeaven | "unshaded" | "shaded" |
| 101 | Booby Traps | VC | cap_boobyTraps | "unshaded" | "shaded" |
| 104 | Main Force Bns | VC | cap_mainForceBns | "unshaded" | "shaded" |
| 116 | Cadres | VC | cap_cadres | "unshaded" | "shaded" |

## Files to Touch

- `test/integration/fitl-events-capability-validation.test.ts` — **New file**. Validation test that iterates all capability-tagged cards and checks compiled `setGlobalMarker` targets/states.

## Out of Scope

- Encoding any cards (done in prior tickets).
- Changing capability variable definitions (Spec 28).
- Any kernel/compiler changes.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-capability-validation.test.ts`:
   - For each card with `tags` including `"capability"`:
     - The unshaded side contains a `setGlobalMarker` effect targeting the expected capability marker with state `"unshaded"`.
     - The shaded side contains a `setGlobalMarker` effect targeting the same capability marker with state `"shaded"`.
   - All 19 capability cards are accounted for (none missing, none extra).
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- No card definitions are changed by this ticket (read-only validation).
- All capability marker IDs match Spec 28 definitions.

## Outcome

- **Completion date**: 2026-02-15
- **What changed**:
  - Updated ticket assumptions/scope to match the implemented architecture:
    - capability cards are validated via compiled `setGlobalMarker` effects (not `setVar`)
    - capability identifiers are Spec 28 global marker IDs (e.g., `cap_topGun`, `cap_caps`, `cap_lgbs`)
  - Added `test/integration/fitl-events-capability-validation.test.ts` to validate:
    - capability-tagged cards and capability marker lattices are in one-to-one alignment (none missing/extra)
    - each capability card side sets exactly one marker and uses `unshaded`/`shaded` state on the matching side
    - both sides of a capability card target the same marker
    - only declared capability marker lattices are referenced by capability cards
- **Deviations from original plan**:
  - Validation target shifted from `setVar`/cap-var IDs to `setGlobalMarker`/cap-marker IDs because FITL capabilities are encoded as global marker lattices.
  - The test intentionally avoids a duplicated hardcoded per-card expectation table and instead validates structural one-to-one invariants between compiled capability cards and capability marker lattices.
- **Verification results**:
  - `npm run build` ✅
  - `node --test dist/test/integration/fitl-events-capability-validation.test.js` ✅
  - `npm test` ✅
  - `npm run lint` ✅

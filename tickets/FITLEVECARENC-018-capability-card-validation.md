# FITLEVECARENC-018: Capability-Granting Card Cross-Validation

**Status**: TODO
**Priority**: P3
**Complexity**: S
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.7)
**Depends on**: FITLEVECARENC-004, FITLEVECARENC-008, FITLEVECARENC-009, FITLEVECARENC-010, FITLEVECARENC-011, FITLEVECARENC-012, FITLEVECARENC-013, FITLEVECARENC-014

## Description

After all capability-granting cards are encoded, run a validation pass to verify each card correctly references its Spec 28 capability variable ID and sets the correct side (unshaded/shaded).

### Expected Capability Cards

| # | Title | Faction | Cap Var ID | Unshaded Sets | Shaded Sets |
|---|-------|---------|------------|---------------|-------------|
| 4 | Top Gun | US | capTopGun | "unshaded" | "shaded" |
| 8 | Arc Light | US | capArcLight | "unshaded" | "shaded" |
| 11 | Abrams | US | capAbrams | "unshaded" | "shaded" |
| 13 | Cobras | US | capCobras | "unshaded" | "shaded" |
| 14 | M-48 Patton | US | capM48Patton | "unshaded" | "shaded" |
| 18 | Combined Action Platoons | US | capCAP | "unshaded" | "shaded" |
| 19 | CORDS | US | capCORDS | "unshaded" | "shaded" |
| 20 | Laser Guided Bombs | US | capLGB | "unshaded" | "shaded" |
| 28 | Search and Destroy | US | capSearchAndDestroy | "unshaded" | "shaded" |
| 31 | AAA | NVA | capAAA | "unshaded" | "shaded" |
| 32 | Long Range Guns | NVA | capLongRangeGuns | "unshaded" | "shaded" |
| 33 | MiGs | NVA | capMiGs | "unshaded" | "shaded" |
| 34 | SA-2s | NVA | capSA2s | "unshaded" | "shaded" |
| 45 | PT-76 | NVA | capPT76 | "unshaded" | "shaded" |
| 61 | Armored Cavalry | ARVN | capArmoredCavalry | "unshaded" | "shaded" |
| 86 | Mandate of Heaven | ARVN | capMandateOfHeaven | "unshaded" | "shaded" |
| 101 | Booby Traps | VC | capBoobyTraps | "unshaded" | "shaded" |
| 104 | Main Force Bns | VC | capMainForceBns | "unshaded" | "shaded" |
| 116 | Cadres | VC | capCadres | "unshaded" | "shaded" |

**Note**: Actual cap var IDs must match whatever Spec 28 defined. The IDs above are indicative — verify against the actual implementation.

## Files to Touch

- `test/integration/fitl-events-capability-validation.test.ts` — **New file**. Validation test that iterates all capability-tagged cards and checks `setVar` targets.

## Out of Scope

- Encoding any cards (done in prior tickets).
- Changing capability variable definitions (Spec 28).
- Any kernel/compiler changes.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-capability-validation.test.ts`:
   - For each card with `tags` including `"capability"`:
     - The unshaded side contains a `setVar` effect targeting the expected capability variable with value `"unshaded"`.
     - The shaded side contains a `setVar` effect targeting the same capability variable with value `"shaded"`.
   - All 19 capability cards are accounted for (none missing, none extra).
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- No card definitions are changed by this ticket (read-only validation).
- All capability var IDs match Spec 28 definitions.

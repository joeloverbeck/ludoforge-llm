# FITLSEC3RULGAP-003: Insurgent Rally Affordability Clamp (NVA/VC)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: FITLSEC3RULGAP-002, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

`rally-nva-profile` and `rally-vc-profile` still use non-LimOp `chooseN.max: 99`, so paid Rally can over-select spaces beyond current faction resources.

## Assumption Reassessment (2026-02-24)

1. `rally-nva-profile` and `rally-vc-profile` non-LimOp selection is currently uncapped (`max: 99`) in `data/games/fire-in-the-lake/30-rules-actions.md`.
2. Paid Rally spending is already enforced per selected space in `resolve-per-space` via `addVar ... delta: -1`, guarded by `__freeOperation != true`.
3. Free-operation Rally currently skips per-space spending, but selection-time affordability bypass is not encoded yet; it must be added.
4. Existing Rally integration tests in `packages/engine/test/integration/fitl-insurgent-operations.test.ts` cover filters, LimOp, and spend semantics, but do not yet assert paid affordability caps or explicit free-op cap bypass at selection time.

## Architecture Check

1. Selection affordability belongs in GameSpecDoc `chooseN.max` expressions, not kernel/runtime special-casing.
2. This ticket should remain profile-local and data-driven (`rally-nva-profile`, `rally-vc-profile`) with no `packages/engine/src/**` changes.
3. The broader insurgent macro-affordability refactor (Attack/March/Terror shared selectors) is intentionally separated into FITLSEC3RULGAP-004 to preserve ticket isolation and DRY architecture at the macro layer.
4. No backward-compatibility aliasing/shims should be introduced.

## What to Change

### 1. Clamp paid Rally selection by faction resources

1. `rally-nva-profile`: in non-LimOp selector, set `chooseN.max` to:
   - `99` when `__freeOperation == true`
   - otherwise `{ ref: gvar, var: nvaResources }`
2. `rally-vc-profile`: in non-LimOp selector, set `chooseN.max` to:
   - `99` when `__freeOperation == true`
   - otherwise `{ ref: gvar, var: vcResources }`
3. Keep LimOp `max: 1` unchanged.
4. Keep resolve-stage per-space spend and trail-improvement/cadres semantics unchanged.

### 2. Add Rally affordability runtime coverage

Add/extend tests to prove:
1. Paid Rally cannot select more Province/City spaces than current faction resources.
2. Zero-resource paid Rally can select zero spaces but rejects positive paid selections.
3. Free-operation Rally bypasses the paid selection cap.
4. Existing LimOp and non-space-cost semantics still hold.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)

## Out of Scope

- Attack/March/Terror selector macro interface changes (covered by FITLSEC3RULGAP-004).
- ARVN Sweep/Assault affordability work.
- Kernel/compiler/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. NVA paid Rally with 3 resources permits at most 3 selected spaces.
2. NVA paid Rally with 0 resources rejects selecting 1+ paid Province/City spaces.
3. VC paid Rally with 2 resources permits at most 2 selected spaces.
4. Free-operation Rally bypasses paid affordability caps for both NVA and VC.
5. Rally LimOp path remains max 1.
6. Existing Rally behavior tests for trail-improvement and free-operation non-space costs still pass.
7. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
8. `pnpm -F @ludoforge/engine test`
9. `pnpm turbo lint`

### Invariants

1. Trail-improvement cost semantics remain unchanged.
2. Rally action applicability and faction ownership remain unchanged.
3. No modifications to `packages/engine/src/**`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — add Rally resource-cap and free-op selection-bypass scenarios for NVA/VC.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-24
- Actual changes:
  - Updated `rally-nva-profile` and `rally-vc-profile` non-LimOp `targetSpaces` `chooseN.max` to be affordability-aware (`resourceVar` when paid, `99` when `__freeOperation == true`).
  - Added integration coverage for NVA and VC Rally paid selection caps and free-operation cap bypass in `fitl-insurgent-operations.test.ts`.
- Deviations from original plan:
  - None in scope; implementation stayed data + tests only and did not touch engine/kernel/compiler code.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts` passed (engine suite 270/270 under current script wiring).
  - `pnpm -F @ludoforge/engine test` passed (270/270).
  - `pnpm turbo lint` passed.

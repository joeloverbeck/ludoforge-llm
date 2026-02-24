# FITLSEC3RULGAP-003: Insurgent Rally Affordability Clamp (NVA/VC)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: FITLSEC3RULGAP-002, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

`rally-nva-profile` and `rally-vc-profile` currently allow over-selecting target spaces relative to current resources in non-LimOp paths.

## Assumption Reassessment (2026-02-24)

1. Rally profiles currently use broad non-LimOp selection caps.
2. Rally cost deduction is already handled per selected space in resolve logic.
3. Free operations should bypass affordability cap for operation-space selection.

## Architecture Check

1. Affordability gating belongs in YAML pipeline selection (`chooseN.max`) rather than runtime branching in engine code.
2. Profile-level Rally caps can be adjusted without changing shared kernel behavior.
3. Existing trail-improvement and non-space costs must remain unaffected.

## What to Change

### 1. Clamp Rally space selection by faction resources

1. `rally-nva-profile`: non-LimOp `chooseN.max` becomes NVA-resource-aware.
2. `rally-vc-profile`: non-LimOp `chooseN.max` becomes VC-resource-aware.
3. Keep LimOp `max: 1` unchanged.
4. Free operation path bypasses affordability cap.

### 2. Add Rally-focused runtime coverage

Add scenarios that prove max selectable spaces tracks current resources and that free-op bypass still works.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-insurgent-operations.test.ts` (modify)

## Out of Scope

- Attack/March/Terror selector macro interface changes.
- ARVN Sweep/Assault affordability work.
- Kernel/compiler code changes.

## Acceptance Criteria

### Tests That Must Pass

1. NVA Rally with 3 resources permits at most 3 selected spaces.
2. NVA Rally with 0 resources permits no paid Province/City Rally space selection.
3. VC Rally with 2 resources permits at most 2 selected spaces.
4. Free-operation Rally bypasses Rally resource cap.
5. Rally LimOp path remains max 1.
6. Existing Rally behavior tests for trail-improvement and free-operation non-space costs still pass.
7. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
8. `pnpm -F @ludoforge/engine test`

### Invariants

1. Trail-improvement cost semantics remain unchanged.
2. Rally action applicability and faction ownership remain unchanged.
3. No modifications to `packages/engine/src/**`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-insurgent-operations.test.ts` — add/update Rally resource-cap and free-op bypass cases.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-insurgent-operations.test.ts`
3. `pnpm -F @ludoforge/engine test`

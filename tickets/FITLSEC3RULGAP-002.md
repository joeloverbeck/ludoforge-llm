# FITLSEC3RULGAP-002: ARVN Sweep/Assault Affordability Clamp

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: FITLSEC3RULGAP-001, Spec 45 (`specs/45-fitl-section3-rules-gaps.md`)

## Problem

ARVN Sweep/Assault currently allow selecting more spaces than ARVN can afford in non-LimOp paths. Rule 3.0 requires affordability across selected spaces.

## Assumption Reassessment (2026-02-24)

1. `sweep-arvn-profile` and `assault-arvn-profile` have top-level legality checks for minimum resources but use broad `chooseN.max` in normal branches.
2. Existing structural tests include assumptions that non-capability branches preserve `max: 99`.
3. `mom_bodyCount` behavior must remain a free-operation override for Assault.

## Architecture Check

1. Affordability should be enforced in GameSpecDoc selection bounds, not kernel special-casing.
2. Existing per-space spend effects remain the source of actual deduction; selection cap prevents over-selection.
3. Capability limits (`cap_caps`, `cap_abrams`) must compose with affordability via min-bound behavior.

## What to Change

### 1. Clamp ARVN Sweep select-spaces max by resources

1. Replace normal-branch unlimited cap with `floorDiv(arvnResources, 3)`.
2. In `cap_caps` shaded branch, cap to `min(2, floorDiv(arvnResources, 3))`.
3. Keep LimOp branch `max: 1` unchanged.

### 2. Clamp ARVN Assault select-spaces max by resources

1. Keep `mom_bodyCount` branch effectively uncapped (free).
2. Non-Body-Count branch capped by `floorDiv(arvnResources, 3)`.
3. In `cap_abrams` shaded branch, cap to `min(2, floorDiv(arvnResources, 3))` when not free.

### 3. Update assertions and add runtime affordability tests

1. Remove/replace hard-coded `max: 99` expectations where ARVN Sweep/Assault are inspected.
2. Add runtime tests for resource-driven space-count limits.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-coin-operations.test.ts` (modify)
- `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` (modify)
- `packages/engine/test/integration/fitl-us-arvn-resource-spend-constraint.test.ts` (modify) or `packages/engine/test/integration/fitl-arvn-operation-affordability.test.ts` (new)

## Out of Scope

- US Sweep/Assault behavior changes.
- Insurgent (NVA/VC) Rally/March/Attack/Terror affordability work.
- Any kernel/compiler source edits.

## Acceptance Criteria

### Tests That Must Pass

1. ARVN Sweep affordability runtime checks:
   - 6 resources permits max 2 spaces.
   - 3 resources permits max 1 space.
   - 9 resources permits max 3 spaces.
2. ARVN Assault affordability runtime checks:
   - `mom_bodyCount=true` bypasses affordability cap.
   - `mom_bodyCount=false` caps by `floorDiv(arvnResources,3)`.
3. Capability composition checks:
   - `cap_caps` shaded path respects `min(2, affordability)` for Sweep.
   - `cap_abrams` shaded path respects `min(2, affordability)` for Assault.
4. LimOp checks remain enforced at max 1.
5. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
6. `pnpm -F @ludoforge/engine test -- fitl-capabilities-sweep-assault-airstrike.test.ts`
7. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-resource-spend-constraint.test.ts`
8. `pnpm -F @ludoforge/engine test`

### Invariants

1. ARVN per-space spend in resolve stages remains intact (no double-charge/no skipped charge in non-free paths).
2. `mom_bodyCount` semantics remain unchanged outside selection cap logic.
3. No edits in `packages/engine/src/**`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coin-operations.test.ts` — update ARVN Sweep/Assault select-space assertions.
2. `packages/engine/test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` — update capability-branch cap assertions.
3. ARVN affordability runtime test file (new or existing) — add explicit resource-bound selection tests.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-coin-operations.test.ts`
3. `pnpm -F @ludoforge/engine test -- fitl-capabilities-sweep-assault-airstrike.test.ts`
4. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-resource-spend-constraint.test.ts`
5. `pnpm -F @ludoforge/engine test`

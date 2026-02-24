# FITLSEC4RULGAP-003: Subvert Erroneous Guerrilla Activation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.5.2: "In each space, remove any 2 ARVN cubes or replace 1 there with a VC Guerrilla. Then drop Patronage..."

The `subvert-profile` `resolve-per-space` stage erroneously activates 1 Underground VC Guerrilla as the first step of resolution (lines ~4745-4756 in `30-rules-actions.md`). The rules do NOT require guerrilla activation for Subvert — Underground VC guerrillas must be present for legality but are not consumed or activated during execution.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` lines ~4745-4756 contain a `forEach` block that selects 1 Underground VC Guerrilla and sets its `activity` to `active`.
2. The subsequent ARVN cube removal/replacement logic (line 4757+) is independent — it does not reference `$subvertingGuerrilla`.
3. Subvert legality (requires Underground VC Guerrilla presence) is defined in the profile's precondition, not in the resolution effects — removing the activation block does not affect legality.
4. Existing NVA/VC SA tests in `fitl-nva-vc-special-activities.test.ts` may assert the activation effect. These must be updated.

## Architecture Check

1. Pure deletion of an erroneous effect block in GameSpecDoc YAML.
2. The surrounding effects (ARVN cube counting, removal/replacement, Patronage reduction) are self-contained and not impacted.
3. No backwards-compatibility shim introduced.

## What to Change

### 1. Remove guerrilla activation block

In `data/games/fire-in-the-lake/30-rules-actions.md`, `subvert-profile`, `resolve-per-space` stage:

Delete the entire `forEach` block at lines ~4745-4756:

```yaml
# DELETE THIS BLOCK:
- forEach:
    bind: $subvertingGuerrilla
    over:
      query: tokensInZone
      zone: $space
      filter:
        - { prop: faction, eq: VC }
        - { prop: type, eq: guerrilla }
        - { prop: activity, eq: underground }
    limit: 1
    effects:
      - setTokenProp: { token: $subvertingGuerrilla, prop: activity, value: active }
```

The ARVN cube removal/replacement logic beginning at line ~4757 becomes the first effect in the resolution.

### 2. Update tests

Update any test that asserts VC guerrilla activation during Subvert. Add a new assertion that Underground VC guerrillas remain Underground after Subvert resolution.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — remove guerrilla activation block from `subvert-profile`, ~lines 4745-4756)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (modify — update Subvert assertions)

## Out of Scope

- Subvert legality preconditions (require Underground VC Guerrilla) — these are correct and unchanged.
- ARVN cube removal/replacement logic — correct and unchanged.
- Patronage reduction logic — correct and unchanged.
- Any kernel/compiler source code.
- Other profiles or special activities (Infiltrate, Tax, etc.).

## Acceptance Criteria

### Tests That Must Pass

1. New/updated test: Subvert `resolve-per-space` effects do NOT contain a `setTokenProp` with `activity: active` targeting VC guerrillas.
2. Runtime test (if feasible): After Subvert resolution, Underground VC Guerrillas in the target space remain Underground.
3. Existing tests: ARVN cube removal/replacement still works correctly.
4. `pnpm turbo build`
5. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. Subvert legality (requires Underground VC Guerrilla) is unchanged.
3. Patronage reduction per space is unchanged.
4. Texas Hold'em compilation tests still pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` — assert Subvert resolve-per-space has no guerrilla activation effect; assert Underground VC guerrillas remain Underground.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-nva-vc-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`

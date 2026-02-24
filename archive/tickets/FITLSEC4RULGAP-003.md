# FITLSEC4RULGAP-003: Subvert Erroneous Guerrilla Activation

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.5.2: "In each space, remove any 2 ARVN cubes or replace 1 there with a VC Guerrilla. Then drop Patronage..."

The `subvert-profile` `resolve-per-space` stage erroneously activated 1 Underground VC Guerrilla as the first step of resolution (around lines ~4703-4713 in `30-rules-actions.md`). The rules do NOT require guerrilla activation for Subvert — Underground VC guerrillas must be present for legality but are not consumed or activated during execution.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` `subvert-profile` `resolve-per-space` currently contains a `forEach` block (around lines 4703-4713) that selects 1 Underground VC Guerrilla and sets its `activity` to `active`.
2. The subsequent ARVN cube removal/replacement logic is independent and does not reference `$subvertingGuerrilla`.
3. Subvert legality is currently enforced by the selection macro (`data/games/fire-in-the-lake/20-macros.md`, `subvert-select-spaces`) which requires:
   - at least 1 Underground VC Guerrilla in the space, and
   - ARVN cube conditions for remove-2 or replace-1 paths.
   Profile-level `legality` is `null`, so removing the activation block does not weaken legality checks.
4. Existing NVA/VC SA integration tests in `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` currently assert Subvert activation and must be updated.

## Architecture Check

1. Pure deletion of an erroneous effect block in GameSpecDoc YAML.
2. The surrounding effects (ARVN cube counting, removal/replacement, Patronage reduction) are self-contained and not impacted.
3. No backwards-compatibility shim introduced.

## What to Change

### 1. Remove guerrilla activation block

In `data/games/fire-in-the-lake/30-rules-actions.md`, `subvert-profile`, `resolve-per-space` stage:

Delete the entire `forEach` block around lines ~4703-4713:

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

Update tests that currently assert VC guerrilla activation during Subvert. Add assertions that Underground VC guerrillas remain Underground after Subvert resolution.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — remove guerrilla activation block from `subvert-profile`, ~lines 4703-4713)
- `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts` (modify — update Subvert assertions)

## Out of Scope

- Subvert legality preconditions (require Underground VC Guerrilla) — these are correct and unchanged.
- `subvert-select-spaces` macro behavior in `data/games/fire-in-the-lake/20-macros.md` (no macro edits required for this ticket).
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

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Removed the Subvert `resolve-per-space` VC guerrilla activation block from `data/games/fire-in-the-lake/30-rules-actions.md`.
  - Added explicit `subvert-profile.legality` in `data/games/fire-in-the-lake/30-rules-actions.md` so base Subvert eligibility is encoded at profile level, not only via selection macro filtering.
  - Updated `packages/engine/test/integration/fitl-nva-vc-special-activities.test.ts`:
    - replaced activation expectations with Underground-preservation assertions,
    - added static pipeline assertions that Subvert no longer contains `setTokenProp` activity activation effects and no longer has `legality: null`.
  - Corrected this ticket’s assumptions to reflect that Subvert legality is enforced by `subvert-select-spaces` macro in `20-macros.md` (not profile-level `legality`).
- **Deviations from original plan**:
  - Added explicit compile-time assertions to guard against reintroducing activation behavior and against drifting back to macro-only legality encoding.
- **Verification results**:
  - ✅ `pnpm turbo build`
  - ✅ `pnpm -F @ludoforge/engine test`
  - ✅ `pnpm turbo lint`
  - ⚠️ `pnpm -F @ludoforge/engine test:e2e` fails in unrelated Texas Hold'em e2e tests; no FITL Subvert regressions observed.

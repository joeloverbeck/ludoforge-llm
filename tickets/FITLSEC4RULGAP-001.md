# FITLSEC4RULGAP-001: Transport Ranger Movement (Non-Shaded Branch)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data + tests only
**Deps**: Spec 46 (`specs/46-fitl-section4-rules-gaps.md`)

## Problem

Rule 4.3.2: "Select 1 space and move up to 6 ARVN Troops and/or Rangers from there onto 1 or more adjacent LoCs..."

The `transport-profile` `move-selected-pieces` stage non-shaded branch filters pieces with `{ prop: type, eq: troops }`, excluding Rangers (faction: ARVN, type: guerrilla). Both Troops and Rangers must be selectable. The shaded (`cap_armoredCavalry`) branch already uses `{ prop: type, op: in, value: [troops, guerrilla] }` correctly.

## Assumption Reassessment (2026-02-24)

1. `data/games/fire-in-the-lake/30-rules-actions.md` line ~4095 contains the non-shaded Transport move filter with `{ prop: type, eq: troops }`.
2. The shaded branch already uses `{ prop: type, op: in, value: [troops, guerrilla] }` — confirming the DSL supports `op: in` filters.
3. Existing Transport capability tests in `fitl-capabilities-transport-govern-ambush-terror.test.ts` test the shaded branch; they should not break since that branch is unchanged.
4. No existing test asserts that the non-shaded Transport branch includes Rangers — a new test is needed.

## Architecture Check

1. This is a single-line filter change in GameSpecDoc YAML. No DSL extension needed.
2. The fix aligns the non-shaded branch with the already-correct shaded branch — pure data consistency.
3. No backwards-compatibility shim introduced.

## What to Change

### 1. Fix Transport non-shaded piece filter

In `data/games/fire-in-the-lake/30-rules-actions.md`, in the `transport-profile` `move-selected-pieces` stage, non-shaded `else` branch:

Change:
```yaml
- { prop: type, eq: troops }
```

To:
```yaml
- { prop: type, op: in, value: [troops, guerrilla] }
```

This makes the non-shaded branch select both ARVN Troops and Rangers, matching the rule text.

### 2. Add structural test for non-shaded Transport filter

Add a test in `fitl-us-arvn-special-activities.test.ts` (or a new focused file) that compiles the production spec and asserts the non-shaded Transport move-selected-pieces filter includes both `troops` and `guerrilla` types.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — Transport non-shaded filter, ~line 4095)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify — add Transport non-shaded Ranger inclusion assertion)

## Out of Scope

- Transport shaded (`cap_armoredCavalry`) branch — already correct.
- Ranger flip-to-Underground logic — covered by FITLSEC4RULGAP-002.
- Any kernel/compiler source code.
- Any other profiles or special activities.

## Acceptance Criteria

### Tests That Must Pass

1. New test: non-shaded Transport filter includes guerrilla type alongside troops in the piece selection query.
2. Existing test: shaded Transport branch remains unchanged and passes.
3. `pnpm turbo build`
4. `pnpm -F @ludoforge/engine test`

### Invariants

1. No file under `packages/engine/src/kernel/**` or `packages/engine/src/cnl/**` is modified.
2. The 6-piece limit on Transport movement is preserved in both branches.
3. The shaded (`cap_armoredCavalry`) branch is byte-identical before and after.
4. Texas Hold'em compilation tests still pass (engine-agnosticism).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — add assertion that non-shaded Transport `move-selected-pieces` filter uses `op: in` with `[troops, guerrilla]`.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts`
3. `pnpm -F @ludoforge/engine test`

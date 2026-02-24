# FITLSEC6RULGAP-002: Pacification Terror Prerequisite for shiftSupport

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML
**Deps**: None

## Problem

Rule 6.3.1: "Every 3 ARVN Resources spent removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Support..."

The "once no Terror is in a space" clause means `shiftSupport` should only be a legal action when the target space has no Terror marker. Currently, both `coupPacifyUS` (lines 246-272) and `coupPacifyARVN` (lines 394-420) in `30-rules-actions.md` allow `shiftSupport` without checking for terror absence. A player can choose `shiftSupport` even when Terror is present in the target space, bypassing the intended sequential constraint (remove terror first, then shift).

## Assumption Reassessment (2026-02-24)

1. `coupPacifyUS` action exists at `30-rules-actions.md` line 138 — **confirmed**.
2. The `shiftSupport` branch precondition (lines 246-272) checks `action == shiftSupport`, `supportOpposition != activeSupport`, and `coupSupportShiftCount != two` — **confirmed** by reading the file. **Missing**: `terror == none` check.
3. `coupPacifyARVN` action exists at `30-rules-actions.md` line 287 — **confirmed**.
4. The `shiftSupport` branch precondition (lines 394-420) has the same structure and same missing terror check — **confirmed**.
5. The `removeTerror` branches (lines 229-245 for US, lines 377-393 for ARVN) already correctly check `terror == terror` — **confirmed**; these are not touched.

## Architecture Check

1. Adding a `terror == none` condition to the `shiftSupport` precondition follows the exact same `mapSpaces` + `markerState` pattern already used throughout the file (e.g., the `removeTerror` branch checks `terror == terror`).
2. This is a data-only YAML change in GameSpecDoc. No engine or compiler code involved.
3. No backwards-compatibility shims. The precondition is tightened, not loosened.

## What to Change

### 1. Add terror == none check to `coupPacifyUS` shiftSupport precondition (line ~246)

In the `op: and` args array for the `shiftSupport` branch (currently containing `action == shiftSupport`, `supportOpposition != activeSupport`, `coupSupportShiftCount != two`), add a new condition:

```yaml
- op: '>'
  left:
    aggregate:
      op: count
      query:
        query: mapSpaces
        filter:
          op: and
          args:
            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: id }, right: { ref: binding, name: targetSpace } }
            - { op: '==', left: { ref: markerState, space: $zone, marker: terror }, right: none }
  right: 0
```

Insert this after the `action == shiftSupport` check and before the `supportOpposition != activeSupport` check, or at the end of the `args` array — ordering within `op: and` does not affect correctness.

### 2. Add terror == none check to `coupPacifyARVN` shiftSupport precondition (line ~394)

Identical change to the ARVN version. Add the same `terror == none` condition to the `op: and` args array for the `shiftSupport` branch.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add terror check to `coupPacifyUS` shiftSupport precondition at ~line 246 and `coupPacifyARVN` shiftSupport precondition at ~line 394)

## Out of Scope

- Kernel source code (`packages/engine/src/kernel/`)
- Compiler source code (`packages/engine/src/cnl/`)
- `removeTerror` branches in either action (already correct — they check for terror presence)
- `coupAgitateVC` action (handled by FITLSEC6RULGAP-003)
- Other preconditions (COIN Control, Police, Troops, resource check, space usage, shift count)
- `20-macros.md` (handled by FITLSEC6RULGAP-001)
- Effect blocks of `coupPacifyUS` / `coupPacifyARVN` (lines 274-285 / 421-434)
- Test fixture files (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`)

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles without errors: `compileProductionSpec()` returns no error-severity diagnostics.
2. `coupPacifyUS` with `action: shiftSupport` is only legal when the target space has `terror == none`.
3. `coupPacifyARVN` with `action: shiftSupport` is only legal when the target space has `terror == none`.
4. `coupPacifyUS` with `action: removeTerror` remains legal when terror is present (unchanged).
5. `coupPacifyARVN` with `action: removeTerror` remains legal when terror is present (unchanged).
6. Existing full test suite: `pnpm -F @ludoforge/engine test`
7. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
8. Full build: `pnpm turbo build`

### Invariants

1. No kernel source files created or modified.
2. No compiler source files created or modified.
3. `removeTerror` branch preconditions are byte-for-byte unchanged.
4. All other preconditions (COIN Control, Police presence, Troops presence, resource sufficiency, space usage limit, shift count) are unchanged.
5. Texas Hold'em compilation tests still pass (engine-agnosticism).
6. Effect blocks of both actions are untouched.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add test case: compile production def, set up a coupSupport state where US is active player, target space has `terror == terror`, verify that `coupPacifyUS` with `action: shiftSupport` is NOT a legal move but `action: removeTerror` IS legal.
2. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add test case: same setup but target space has `terror == none`, verify that `coupPacifyUS` with `action: shiftSupport` IS legal.
3. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add test cases: repeat (1) and (2) for `coupPacifyARVN` with ARVN as active player.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`

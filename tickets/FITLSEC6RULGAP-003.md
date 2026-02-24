# FITLSEC6RULGAP-003: Agitation Terror Prerequisite for shiftOpposition

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML
**Deps**: None

## Problem

Rule 6.3.2: "Every 1 VC Resource they spend removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Opposition..."

Same "once no Terror" constraint as Pacification. Currently, `coupAgitateVC` (lines 526-552 in `30-rules-actions.md`) allows `shiftOpposition` without checking for terror absence. The VC player can choose `shiftOpposition` even when Terror is present, bypassing the intended sequential constraint (remove terror first, then shift).

## Assumption Reassessment (2026-02-24)

1. `coupAgitateVC` action exists at `30-rules-actions.md` line 435 — **confirmed**.
2. The `shiftOpposition` branch precondition (lines 526-552) checks `action == shiftOpposition`, `supportOpposition != activeOpposition`, and `coupSupportShiftCount != two` — **confirmed** by reading the file. **Missing**: `terror == none` check.
3. The `removeTerror` branch (lines 510-525) already correctly checks `terror == terror` — **confirmed**; not touched.
4. The VC executor is seat `'3'` and the resource check is `vcResources >= 1` — **confirmed** at lines 437 and 506-508.

## Architecture Check

1. Identical pattern to FITLSEC6RULGAP-002: adding a `terror == none` condition using `mapSpaces` + `markerState` filter.
2. Data-only YAML change in GameSpecDoc. No engine or compiler code.
3. No backwards-compatibility shims. The precondition is tightened.

## What to Change

### 1. Add terror == none check to `coupAgitateVC` shiftOpposition precondition (line ~526)

In the `op: and` args array for the `shiftOpposition` branch (currently containing `action == shiftOpposition`, `supportOpposition != activeOpposition`, `coupSupportShiftCount != two`), add a new condition:

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

Insert this as an additional arg in the `shiftOpposition` `op: and` block. The position within the `args` array does not affect correctness.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add terror check to `coupAgitateVC` shiftOpposition precondition at ~line 526)

## Out of Scope

- Kernel source code (`packages/engine/src/kernel/`)
- Compiler source code (`packages/engine/src/cnl/`)
- `removeTerror` branch in `coupAgitateVC` (already correct — checks for terror presence)
- `coupPacifyUS` and `coupPacifyARVN` actions (handled by FITLSEC6RULGAP-002)
- Other preconditions (VC pieces, no COIN Control, resource check, space usage, shift count)
- `20-macros.md` (handled by FITLSEC6RULGAP-001)
- Effect block of `coupAgitateVC` (lines 554-563)
- Test fixture files (`fitl-foundation-inline-assets.md`, `fitl-foundation-coup-victory-inline-assets.md`)

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles without errors: `compileProductionSpec()` returns no error-severity diagnostics.
2. `coupAgitateVC` with `action: shiftOpposition` is only legal when the target space has `terror == none`.
3. `coupAgitateVC` with `action: removeTerror` remains legal when terror is present (unchanged).
4. Existing full test suite: `pnpm -F @ludoforge/engine test`
5. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
6. Full build: `pnpm turbo build`

### Invariants

1. No kernel source files created or modified.
2. No compiler source files created or modified.
3. `removeTerror` branch precondition is byte-for-byte unchanged.
4. All other preconditions (VC pieces, no COIN Control, resource sufficiency, space usage limit, shift count) are unchanged.
5. Texas Hold'em compilation tests still pass (engine-agnosticism).
6. Effect block of `coupAgitateVC` is untouched.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add test case: compile production def, set up a coupSupport state where VC (seat 3) is active player, target space has `terror == terror`, verify that `coupAgitateVC` with `action: shiftOpposition` is NOT a legal move but `action: removeTerror` IS legal.
2. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add test case: same setup but target space has `terror == none`, verify that `coupAgitateVC` with `action: shiftOpposition` IS legal.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`

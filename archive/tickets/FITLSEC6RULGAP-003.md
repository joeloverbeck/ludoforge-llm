# FITLSEC6RULGAP-003: Agitation Terror Prerequisite for shiftOpposition

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML
**Deps**: None

## Problem

Rule 6.3.2: "Every 1 VC Resource they spend removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Opposition..."

Same "once no Terror" constraint as Pacification. Currently, `coupAgitateVC` in `30-rules-actions.md` allows `shiftOpposition` without checking for terror absence. The VC player can choose `shiftOpposition` even when Terror is present, bypassing the intended sequential constraint (remove terror first, then shift).

## Assumption Reassessment (2026-02-24)

1. `coupAgitateVC` exists in `data/games/fire-in-the-lake/30-rules-actions.md` and is executor seat `'3'` with `vcResources >= 1` gating — **confirmed**.
2. The `shiftOpposition` branch currently checks:
   - `action == shiftOpposition`
   - `fitl-space-marker-state-is-not(... supportOpposition, activeOpposition)`
   - `fitl-space-marker-state-is-not(... coupSupportShiftCount, two)`
   but does **not** check `terror == none` — **confirmed**.
3. The `removeTerror` branch already uses `fitl-space-marker-state-is(... terror, terror)` — **confirmed** and should remain unchanged.
4. There is already integration coverage in `packages/engine/test/integration/fitl-coup-support-production.test.ts` for VC agitation cost and space-cap behavior; this ticket should extend that suite with explicit terror-gating assertions rather than creating a new harness.

## Architecture Check

1. Best fit with current architecture is to add a `conditionMacro` precondition (`fitl-space-marker-state-is` on `terror == none`) in the `shiftOpposition` branch, matching the surrounding predicate style.
2. Data-only YAML change in GameSpecDoc. No engine or compiler code.
3. No backwards-compatibility shims. The precondition is tightened.
4. A potential follow-up architecture improvement is to factor repeated coup support/agitation branch predicates into a shared macro surface, but that is intentionally out of scope for this correctness ticket.

## What to Change

### 1. Add terror == none check to `coupAgitateVC` shiftOpposition precondition

In the `op: and` args array for the `shiftOpposition` branch, add:

```yaml
- conditionMacro: fitl-space-marker-state-is
  args:
    spaceIdExpr: { ref: binding, name: targetSpace }
    markerId: terror
    markerStateExpr: none
```

Insert this as an additional arg in the `shiftOpposition` `op: and` block. The position within the `args` array does not affect correctness.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add terror check to `coupAgitateVC` shiftOpposition precondition)
- `packages/engine/test/integration/fitl-coup-support-production.test.ts` (modify — strengthen VC agitation terror-gating assertions)

## Out of Scope

- Kernel source code (`packages/engine/src/kernel/`)
- Compiler source code (`packages/engine/src/cnl/`)
- `removeTerror` branch in `coupAgitateVC` (already correct — checks for terror presence)
- `coupPacifyUS` and `coupPacifyARVN` actions (handled by FITLSEC6RULGAP-002)
- Other preconditions (VC pieces, no COIN Control, resource check, space usage, shift count)
- `20-macros.md` (handled by FITLSEC6RULGAP-001)
- Effect block of `coupAgitateVC`
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

1. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add/strengthen VC agitation coverage: with terror present, `action: shiftOpposition` is illegal while `action: removeTerror` is legal from the same rules-valid setup.
2. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add/strengthen VC agitation coverage: with no terror, `action: shiftOpposition` is legal and still spends 1 VC Resource.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Completion date: 2026-02-24
- Implemented:
  - Added a terror-absence prerequisite to `coupAgitateVC` `shiftOpposition` via existing `conditionMacro` style in `data/games/fire-in-the-lake/30-rules-actions.md`.
  - Strengthened `packages/engine/test/integration/fitl-coup-support-production.test.ts` to explicitly enforce agitation sequencing:
    - `shiftOpposition` illegal while terror is present.
    - `removeTerror` legal and resource-spending behavior preserved.
    - `shiftOpposition` legal once terror is absent.
    - Existing 4-space agitation cap coverage retained.
- Deviation from original plan:
  - Ticket assumptions were corrected first to reflect current architecture (condition macros instead of inline `mapSpaces` predicate shape) and current test baseline (extend existing integration suite).
- Verification results:
  - `pnpm turbo build` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `node --test packages/engine/dist/test/integration/fitl-coup-support-production.test.js` ✅
  - `pnpm -F @ludoforge/engine test:e2e` ❌ (existing unrelated Texas Hold'em e2e failures)

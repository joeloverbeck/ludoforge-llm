# FITLSEC6RULGAP-002: Pacification Terror Prerequisite for shiftSupport

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data-only YAML
**Deps**: None

## Problem

Rule 6.3.1: "Every 3 ARVN Resources spent removes a Terror marker or—**once no Terror is in a space**—shifts the space 1 level toward Active Support..."

The "once no Terror is in a space" clause means `shiftSupport` should only be a legal action when the target space has no Terror marker. Currently, both `coupPacifyUS` (lines 246-272) and `coupPacifyARVN` (lines 394-420) in `30-rules-actions.md` allow `shiftSupport` without checking for terror absence. A player can choose `shiftSupport` even when Terror is present in the target space, bypassing the intended sequential constraint (remove terror first, then shift).

## Assumption Reassessment (2026-02-24)

1. `coupPacifyUS` and `coupPacifyARVN` actions both exist in `data/games/fire-in-the-lake/30-rules-actions.md` — **confirmed**.
2. Each `shiftSupport` branch currently checks:
   - `action == shiftSupport`
   - `supportOpposition != activeSupport`
   - `coupSupportShiftCount != two`
   but does **not** check `terror == none` — **confirmed**.
3. Each `removeTerror` branch already checks `terror == terror` and is semantically aligned with Rule 6.3.1 — **confirmed**.
4. There is already an integration suite at `packages/engine/test/integration/fitl-coup-support-production.test.ts` covering coup support action availability/cost/caps, so this ticket should **extend existing tests** instead of introducing a new test harness.

## Architecture Check

1. Adding a `terror == none` condition to the `shiftSupport` precondition is the minimal, robust fix in the existing GameSpecDoc architecture.
2. The change stays data-driven (`GameSpecDoc` YAML), preserving engine/compiler agnosticism.
3. No backwards-compatibility aliases or dual behaviors: illegal historical behavior becomes invalid and tests should enforce the stricter rule.
4. A larger refactor (for example, abstracting repeated pacification predicates into macros) may improve long-term maintainability, but is out of scope for this ticket and should be tracked separately to avoid coupling a correctness fix with structural churn.

## What to Change

### 1. Add terror == none check to `coupPacifyUS` shiftSupport precondition

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

### 2. Add terror == none check to `coupPacifyARVN` shiftSupport precondition

Identical change to the ARVN version. Add the same `terror == none` condition to the `op: and` args array for the `shiftSupport` branch.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — add terror check to `coupPacifyUS` shiftSupport precondition at ~line 246 and `coupPacifyARVN` shiftSupport precondition at ~line 394)
- `packages/engine/test/integration/fitl-coup-support-production.test.ts` (modify — add/strengthen coverage for terror-gated `shiftSupport` legality in both US and ARVN pacification)

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

1. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add/strengthen US test: with terror present, `action: shiftSupport` is illegal while `action: removeTerror` is legal from the same rules-valid setup.
2. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add/strengthen US test: with no terror, `action: shiftSupport` is legal.
3. `packages/engine/test/integration/fitl-coup-support-production.test.ts` — Add/strengthen ARVN equivalents of (1) and (2).

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Completion date: 2026-02-24
- Implemented:
  - Added `terror == none` preconditions to the `shiftSupport` branches of both `coupPacifyUS` and `coupPacifyARVN` in `data/games/fire-in-the-lake/30-rules-actions.md`.
  - Strengthened `packages/engine/test/integration/fitl-coup-support-production.test.ts` with explicit US and ARVN terror-gating coverage:
    - `shiftSupport` blocked when terror is present.
    - `removeTerror` remains legal when terror is present.
    - `shiftSupport` legal when terror is absent.
- Deviation from original plan:
  - The ticket was corrected first to reflect current repository reality: there is already an integration suite to extend, not a new one to create.
  - `pnpm -F @ludoforge/engine test:e2e` fails in existing Texas Hold'em e2e tests unrelated to this FITL YAML/test change; FITL-targeted and full standard test/lint/build suites pass.
- Verification results:
  - `pnpm turbo build` ✅
  - `pnpm turbo lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test` ✅
  - `pnpm -F @ludoforge/engine test:e2e` ❌ (existing unrelated Texas e2e failures)

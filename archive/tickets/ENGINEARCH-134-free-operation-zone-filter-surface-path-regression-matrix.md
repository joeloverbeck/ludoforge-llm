# ENGINEARCH-134: Free-Operation Zone-Filter Surface/Path Regression Matrix

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel test contract coverage for zone-filter probe/strict branch parity
**Deps**: archive/tickets/ENGINEARCH-123-free-operation-zone-filter-deferral-path-completeness.md, archive/tickets/ENGINEARCH-132-free-operation-zone-filter-binding-resolution-contract.md

## Problem

Current tests lock deferral/strict behavior broadly, but strict/apply coverage still does not explicitly lock the per-zone candidate branch diagnostics (`candidateZone`). This leaves a regression gap where strict branch diagnostics could drift undetected.

## Assumption Reassessment (2026-02-28)

1. `turn-flow-eligibility.ts` applies the same surface policy in both zone-filter evaluation paths:
- no-zone path (`zones.length === 0`) and
- per-zone candidate loop (`for (const zone of zones)`),
using `shouldDeferFreeOperationZoneFilterFailure(surface, cause)`.
2. Existing strict/apply test coverage in `packages/engine/test/unit/kernel/apply-move.test.ts` only asserts strict failure on the no-zone path (malformed `gvar` binding), and does not assert per-zone diagnostics (`candidateZone`).
3. Existing deferral coverage is already present across discovery/wrapper paths (`legal-choices`, `legal-moves`, `move-decision-sequence`), but matrix ownership should be anchored at the contract owner surfaces (`legal-choices`, `turn-flow-eligibility`) to avoid duplicate wrapper-level matrix assertions.
4. Corrected scope: add/strengthen minimal owner-surface regression tests for surface (`legalChoices` vs `turnFlowEligibility`) x path (`no-zone` vs `per-zone`) with explicit diagnostics where strict failures occur.

## Architecture Check

1. Matrix coverage at owner boundaries (`legal-choices` and apply-time strict eligibility) is cleaner than duplicating the same matrix through wrappers (`legalMoves`, `moveDecisionSequence`).
2. This keeps runtime contract hardening focused and stable while preserving agnostic engine behavior.
3. No backwards-compatibility aliases/shims: tests enforce current canonical policy only.

## What to Change

### 1. Add strict per-zone failure regression

Add an `applyMove` unit test where free-operation zone-filter evaluation on `turnFlowEligibility` fails inside the per-zone candidate branch and throws `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` with `candidateZone` diagnostics.

### 2. Add minimal owner-surface matrix coverage

Ensure explicit tests cover:
- `legalChoices` + no-zone deferrable missing-binding failure => deferred (no throw)
- `legalChoices` + per-zone deferrable missing-binding failure => deferred (no throw)
- `turnFlowEligibility` + no-zone non-deferrable failure => typed throw
- `turnFlowEligibility` + per-zone non-deferrable failure => typed throw with `candidateZone`

### 3. Keep tests deterministic and non-game-specific

Use minimal synthetic action/zone fixtures and avoid game-specific rules or identifiers beyond generic test data.

## Files to Touch

- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)

## Out of Scope

- Changing zone-filter policy semantics.
- Introducing new runtime error codes.
- Runtime/kernel production code changes outside tests.
- GameSpecDoc or visual-config schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. Strict/apply (`turnFlowEligibility`) per-zone non-deferrable failures throw typed errors with `candidateZone` diagnostics.
2. Probe/discovery (`legalChoices`) no-zone and per-zone deferrable missing-binding failures are deferred.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Surface semantics stay explicit: only `legalChoices` defers; `turnFlowEligibility` remains strict.
2. Branch parity is enforced by tests across no-zone/per-zone paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add strict per-zone failure contract with `candidateZone` diagnostics.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — ensure explicit no-zone and per-zone deferral contracts at discovery surface.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Added strict per-zone `turnFlowEligibility` regression in `apply-move` unit tests, including `candidateZone` diagnostics assertions.
  - Added explicit `legalChoices` owner-surface tests for both no-zone and per-zone deferral paths on unresolved binding failures.
  - Reassessed and narrowed ticket scope to owner-surface contract tests (`apply-move`, `legal-choices`) rather than duplicating matrix assertions across wrapper suites.
- **Deviations From Original Plan**:
  - Did not modify `legal-moves.test.ts` or `move-decision-sequence.test.ts`; existing coverage there remains, but matrix ownership was intentionally centralized at contract boundaries.
  - No production runtime code changes were required.
- **Verification Results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`322` tests, `0` failed).
  - `pnpm turbo lint` passed.

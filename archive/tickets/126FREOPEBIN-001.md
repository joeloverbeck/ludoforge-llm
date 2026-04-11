# 126FREOPEBIN-001: Extend zone filter probe to handle MISSING_VAR for per-zone bindings

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel zone filter probe, missing binding policy, eval-query error path, grant authorization consumer
**Deps**: None

## Problem

Simulation canary tests crash ~40% of seeds with `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` when the zone filter probe for free-operation eligibility references per-zone interpolated bindings (e.g., `$movingTroops@{$zone}`) that only exist for zones previously selected in `$targetSpaces`. The probe's retry logic catches `MISSING_BINDING` but not `MISSING_VAR`, so interpolated per-zone bindings for candidate zones outside the target set propagate as unrecoverable errors.

## Assumption Reassessment (2026-04-11)

1. `evaluateFreeOperationZoneFilterProbe` in `free-operation-zone-filter-probe.ts` has retry logic that catches only `MISSING_BINDING` (line 46) — confirmed.
2. `shouldDeferFreeOperationZoneFilterFailure` in `missing-binding-policy.ts` has `MISSING_VAR` handling only for the `legalChoices` surface, not `turnFlowEligibility` — confirmed.
3. `applyZonesFilter` in `eval-query.ts` (private/internal) wraps errors into `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` at line 484, calling `shouldDeferFreeOperationZoneFilterFailure` at line 481 — confirmed.
4. `free-operation-grant-authorization.ts` imports `evaluateFreeOperationZoneFilterProbe` (line 216) and `shouldDeferFreeOperationZoneFilterFailure` (line 192) — confirmed. Any signature/return-type changes must propagate here.
5. `missing-binding-policy.test.ts` already exists at `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — confirmed.

## Architecture Check

1. The fix is engine-agnostic (Foundation 1): it handles the general case of `forEach`-scoped bindings being unavailable during cross-zone probing, not a FITL-specific workaround.
2. No game-specific logic enters the kernel. The pattern `$name@zone` is a generic interpolated binding convention, not FITL-specific.
3. No backwards-compatibility shims — the probe's error handling is extended in place, not aliased.

## What to Change

### 1. Extend probe retry logic in `free-operation-zone-filter-probe.ts`

Extend the retry/catch logic (currently line 46, `MISSING_BINDING` only) to also recognize `MISSING_VAR` errors where the missing binding name matches the pattern `<name>@<candidateZone>` (interpolated per-zone bindings). When such an error is caught during probing, return `inconclusive` rather than `failed` — the zone is neither confirmed nor denied as eligible.

### 2. Extend deferral policy in `missing-binding-policy.ts`

In `shouldDeferFreeOperationZoneFilterFailure`, extend the `MISSING_VAR` deferral clause to also apply on the `turnFlowEligibility` surface, not just `legalChoices`. Rationale: if a per-zone binding doesn't exist because the zone wasn't selected in the parent operation, the filter probe is inherently inconclusive regardless of which surface is asking.

### 3. Verify catch/rethrow path in `eval-query.ts`

In the `applyZonesFilter` function (private, zero external blast radius), verify that the catch/rethrow path at line 481–484 respects the updated deferral policy before escalating to `freeOperationZoneFilterEvaluationError`. If the deferral function now returns `true` for the previously-crashing case, the error should not be wrapped and thrown.

### 4. Propagate to `free-operation-grant-authorization.ts`

If the signature or return type of `evaluateFreeOperationZoneFilterProbe` changes (e.g., new `inconclusive` variant), update the call site at line 216 to handle the new variant. Similarly for `shouldDeferFreeOperationZoneFilterFailure` at line 192 if its signature changes.

## Files to Touch

- `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify — if signatures change)
- `packages/engine/test/unit/kernel/free-operation-zone-filter-probe.test.ts` (new)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/integration/fitl-march-free-operation.test.ts` (new)

## Out of Scope

- Legal-move enumeration budgets (ticket 002)
- Agent template completion fallback (ticket 003)
- FITL march zone filter restructuring (ticket 004)
- Full PolicyAgent overhaul

## Acceptance Criteria

### Tests That Must Pass

1. Unit: `MISSING_VAR` for interpolated per-zone binding `$name@candidateZone` during probe returns `inconclusive`, not `failed`
2. Unit: `shouldDeferFreeOperationZoneFilterFailure` returns `true` for `MISSING_VAR` on `turnFlowEligibility` surface when binding matches per-zone pattern
3. Integration: NVA march with `$targetSpaces = ['an-loc:none']` probed against `can-tho:none` does not crash
4. Existing suite: `pnpm turbo test`

### Invariants

1. Engine remains game-agnostic — no FITL-specific identifiers in kernel code
2. Determinism preserved — same seed + same state = same result
3. Non-per-zone `MISSING_VAR` errors on `turnFlowEligibility` still fail (deferral is scoped to the interpolated binding pattern)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-zone-filter-probe.test.ts` — new file testing probe behavior for `MISSING_VAR` with per-zone binding pattern
2. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — extend with `turnFlowEligibility` + `MISSING_VAR` deferral cases
3. `packages/engine/test/integration/fitl-march-free-operation.test.ts` — reproduce crash state from spec's stack trace

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "zone-filter-probe"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "missing-binding-policy"`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-04-11
- Extended `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` so per-zone interpolated `MISSING_VAR` errors matching the probed candidate zone return a deferred/inconclusive result instead of failing the probe.
- Extended `packages/engine/src/kernel/missing-binding-policy.ts` with shared per-zone interpolated binding detection and now defer those `MISSING_VAR` failures on both `legalChoices` and `turnFlowEligibility`, while leaving non-per-zone `MISSING_VAR` behavior unchanged.
- Verified `packages/engine/src/kernel/eval-query.ts` and `packages/engine/src/kernel/free-operation-grant-authorization.ts` needed no code change: both already respect deferred probe results once the shared policy returns `true`.
- Added regression coverage in `packages/engine/test/unit/kernel/free-operation-zone-filter-probe.test.ts`, `packages/engine/test/unit/kernel/missing-binding-policy.test.ts`, and `packages/engine/test/integration/fitl-march-free-operation.test.ts`.
- Schema/artifact fallout checked: none required and none changed.

## Verification Run

- Command substitution applied: the ticket's Jest-style focused examples are stale for this repo's built `node --test` workflow. Ran `pnpm -F @ludoforge/engine build`, then:
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-zone-filter-probe.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/missing-binding-policy.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-march-free-operation.test.js`
- Broader proof:
  - `pnpm turbo test`
  - `pnpm turbo typecheck`

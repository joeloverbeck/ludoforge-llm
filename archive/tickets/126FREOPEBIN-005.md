# 126FREOPEBIN-005: Defer unresolved legalChoices free-operation template bindings

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel free-operation probe deferral on legalChoices
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`

## Problem

The current live prerequisite failure for the remaining Spec 126 series is no longer `agentStuck`. On production FITL seed `1021`, the game crashes before agent fallback is reached with `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` on the `legalChoices` surface while probing an incomplete free-operation template for `march`. The missing binding is `$targetSpaces`, not a per-zone interpolated binding, so the current deferral policy does not treat it as inconclusive.

This blocks ticket `126FREOPEBIN-003` from reaching its intended agent-robustness boundary and violates Foundation 10 (bounded, non-crashing discovery-time probing).

## Assumption Reassessment (2026-04-11)

1. `packages/engine/src/kernel/missing-binding-policy.ts` currently defers `MISSING_BINDING` on `legalChoices` and defers `MISSING_VAR` only for per-zone interpolated bindings matched by `isPerZoneInterpolatedBindingMissingVar(...)` — confirmed.
2. `packages/engine/src/kernel/eval-query.ts` still wraps zone-filter probe failures as `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` on the `legalChoices` surface — confirmed from the live seed-1021 crash.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` already had coverage for one deferred incomplete-template shape, but it did not cover the live binding-query `$targetSpaces` crash shape from seed `1021`; focused policy/probe tests also still encoded non-per-zone binding-query `MISSING_VAR` as non-deferrable everywhere — confirmed.
4. Archived ticket `126FREOPEBIN-001` fixed the `turnFlowEligibility` / per-zone interpolated `MISSING_VAR` path but did not cover unresolved top-level legalChoices template bindings like `$targetSpaces` on incomplete moves — confirmed by live runtime evidence.

## Architecture Check

1. The fix belongs in generic kernel discovery-time deferral policy, not in FITL data or agent code. The crash occurs while probing incomplete template bindings on `legalChoices`, which is a game-agnostic runtime concern.
2. Deferring unresolved template-only bindings as `inconclusive` is cleaner than letting `eval-query.ts` escalate them to a hard turn-flow runtime error during discovery. This preserves the existing apply-time contract while keeping speculative legalChoices/template probing safe.
3. No backwards-compatibility shims are needed. This is a correction to discovery-time error classification and the associated tests.

## What to Change

### 1. Reproduce and classify the missing-binding shape

Use the live seed-1021 reproducer and targeted unit coverage to confirm the exact unresolved-binding shapes that should be deferred on `legalChoices`. The intended boundary is incomplete template bindings that are unavailable during discovery-time probing, not arbitrary runtime `MISSING_VAR` suppression.

### 2. Extend legalChoices deferral for unresolved template bindings

Update the free-operation probe deferral path so unresolved legalChoices bindings like `$targetSpaces` on incomplete template moves are treated as `inconclusive` instead of `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`. Keep the policy narrow and discovery-specific:
- preserve hard failures for true runtime-invalid bindings
- preserve the stricter apply-time path
- avoid broad “defer all MISSING_VAR” behavior

### 3. Replace the outdated crash expectation with regression coverage

Update the existing unit coverage that currently enshrines the crash, and add or extend a focused regression proving unresolved non-`$zone` legalChoices bindings are deferred during template generation.

## Files to Touch

- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` and/or `packages/engine/src/kernel/free-operation-zone-filter-probe.ts` (modify if required by the live boundary)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Agent fallback behavior (ticket `126FREOPEBIN-003`)
- Additional seed-scan/canary work (ticket `126FREOPEBIN-004`)
- FITL data-only zone-filter restructuring
- Broad suppression of all `MISSING_VAR` discovery failures

## Acceptance Criteria

### Tests That Must Pass

1. Unit: unresolved non-`$zone` legalChoices template bindings are deferred during free-operation probe/template generation instead of crashing
2. Unit: true non-deferrable free-operation zone-filter failures still surface as runtime errors
3. Existing focused checks: `pnpm -F @ludoforge/engine build` and direct `node --test` runs pass

### Invariants

1. Discovery-time free-operation probing on incomplete templates does not crash on unresolved template-only bindings
2. Apply-time/runtime-invalid bindings are still not silently suppressed
3. The fix remains engine-agnostic and discovery-surface-specific

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — replace the outdated crash expectation for unresolved legalChoices template bindings with deferral coverage

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/legal-moves.test.js`

## Outcome

- Completed: 2026-04-11
- What changed:
  - added `isUnresolvedTemplateBindingMissingVar(...)` in `packages/engine/src/kernel/missing-binding-policy.ts` to recognize unresolved binding-query templates that are still absent from the current probe bindings
  - threaded the probe surface through `packages/engine/src/kernel/free-operation-zone-filter-probe.ts`, `packages/engine/src/kernel/eval-query.ts`, and `packages/engine/src/kernel/free-operation-grant-authorization.ts`
  - deferred unresolved binding-query template `MISSING_VAR` only on the `legalChoices` discovery surface, while preserving strict failure on `turnFlowEligibility`
  - extended unit coverage in `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` and `packages/engine/test/unit/kernel/free-operation-zone-filter-probe.test.ts`
  - added a `legalMoves` regression in `packages/engine/test/unit/kernel/legal-moves.test.ts` for the live `$targetSpaces` binding-query shape
- Deviations from original plan:
  - the existing `legalMoves` crash expectation described in reassessment was stale; the true remaining gap was the exact `$targetSpaces` binding-query shape, so the regression set was extended rather than simply flipped
  - the narrowest safe implementation point was the shared zone-filter probe, but only after explicitly threading the evaluation surface so `turnFlowEligibility` behavior from ticket `001` stayed unchanged
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/missing-binding-policy.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-zone-filter-probe.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/legal-moves.test.js`

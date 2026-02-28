# ENGINEARCH-122: Free-Operation Zone-Filter Deferral Generic Binding Classifier

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — turn-flow eligibility zone-filter evaluation policy
**Deps**: archive/tickets/ENGINEARCH-106-free-operation-denial-cause-mapping-exhaustiveness.md

## Problem

Free-operation zone-filter probing currently has two hardcoded `'$zone'` coupling points:
1) discovery-time deferral in turn-flow eligibility, and
2) per-zone option filtering in query evaluation.
These naming assumptions leak into kernel policy and can reject otherwise valid GameSpecDocs that use different zone binding identifiers.

## Assumption Reassessment (2026-02-27)

1. `evaluateZoneFilterForMove` currently defers `MISSING_BINDING` only when `binding === '$zone'` on `legalChoices` surface.
2. Game-authored zone-filter expressions can reference arbitrary binding names and should not require engine-reserved naming.
3. Existing codebase already has `packages/engine/src/kernel/missing-binding-policy.ts` as the centralized classifier for discovery-time binding deferral in other kernel flows.
4. `packages/engine/src/kernel/eval-query.ts` also applies `freeOperationZoneFilter` with a fixed `'$zone'` binding during zone-query filtering.
5. Mismatch: current zone-filter probing path is not binding-name agnostic end-to-end; corrected scope is to (a) extend centralized missing-binding policy for discovery deferral and (b) make per-zone free-operation filter evaluation binding-name agnostic.

## Architecture Check

1. A typed deferral classifier is cleaner and more robust than string-literal binding checks in the evaluator.
2. Reusing the existing missing-binding policy module is more robust than adding a second classifier module because it keeps all deferral semantics in one canonical location.
3. This preserves agnostic boundaries: GameSpecDoc controls rule data, while kernel stays generic across naming choices.
4. No backwards-compatibility aliasing/shims; one canonical deferral policy path.

## What to Change

### 1. Extend canonical missing-binding policy for zone-filter discovery deferral

Add a new context in `missing-binding-policy.ts` for free-operation zone-filter probing on `legalChoices`, and classify deferrable unresolved binding errors there.

### 2. Replace hardcoded `$zone` check with centralized policy

Refactor free-operation zone-filter evaluation catch handling to call `shouldDeferMissingBinding` with the new context instead of checking `cause.context?.binding === '$zone'`.

### 3. Remove hardcoded `$zone` coupling in free-operation zone-query filtering

When applying `freeOperationZoneFilter` to candidate zones in `eval-query`, evaluate using canonical `'$zone'` and support unresolved binding-name fallback for discovery probing so non-`$zone` binding identifiers are handled generically.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/` (modify/add targeted tests)

## Out of Scope

- Changing denial-cause taxonomy.
- Reworking GameSpecDoc schema.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery deferral works for unresolved zone bindings regardless of binding identifier string.
2. Non-deferrable zone-filter errors remain hard failures with typed diagnostics.
3. Existing missing-binding policy behavior for prior contexts remains unchanged.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel behavior remains game-agnostic with no binding-name conventions encoded in policy.
2. Free-operation denial projection semantics remain deterministic across surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — add unresolved non-`$zone` binding scenario to ensure discovery deferral remains generic.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — assert legal/illegal projection still behaves correctly after centralized-policy refactor.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — cover the new zone-filter probe policy context.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Extended `missing-binding-policy` with `legalChoices.freeOperationZoneFilterProbe`.
  - Replaced hardcoded `'$zone'` deferral check in `turn-flow-eligibility` with centralized `shouldDeferMissingBinding`.
  - Removed the second hardcoded coupling in `eval-query` by adding a guarded unresolved-binding fallback when evaluating `freeOperationZoneFilter` against candidate zones.
  - Added regression coverage for non-`$zone` free-operation zone-filter probing in `move-decision-sequence` and `legal-choices`, plus policy-context coverage in `missing-binding-policy.test.ts`.
- **Deviations From Original Plan**:
  - Scope expanded to include `eval-query` because ticket assumptions missed an additional `'$zone'` hardcoding path that still rejected non-`$zone` bindings.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅

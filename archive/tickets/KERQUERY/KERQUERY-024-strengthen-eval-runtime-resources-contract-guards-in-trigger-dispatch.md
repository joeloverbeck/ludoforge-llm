# KERQUERY-024: Strengthen EvalRuntimeResources contract guards in trigger dispatch

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime-resource contract validation hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, archive/tickets/KERQUERY/KERQUERY-023-harden-dispatchtriggers-request-runtime-contract-validation.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/query-runtime-cache.ts, packages/engine/src/kernel/execution-collector.ts, packages/engine/test/unit/trigger-dispatch.test.ts

## Problem

Current `evalRuntimeResources` validation in trigger dispatch checks only object presence for `collector` and `queryRuntimeCache`. It does not validate the minimal callable/shape contract used by downstream logic (`collector.warnings`, `collector.trace`, and query-cache accessor methods), so malformed doubles/inputs can pass the boundary and fail later with less actionable errors.

## Assumption Reassessment (2026-03-05)

1. `EvalRuntimeResources` canonical shape is `{ collector, queryRuntimeCache }`, where:
   - `collector.warnings` is an array,
   - `collector.trace` is `null` or an array,
   - `queryRuntimeCache` provides `getTokenZoneByTokenIdIndex` and `setTokenZoneByTokenIdIndex` methods.
2. `dispatchTriggers` currently performs only object-presence checks for `collector` and `queryRuntimeCache`, without validating method-level/runtime shape.
3. KERQUERY-023 already hardened required request-field validation; this ticket is specifically about optional `evalRuntimeResources` structural validation depth.
4. Existing tests cover missing ownership fields but do not cover malformed nested field/method shapes for `evalRuntimeResources`.

## Architecture Check

1. Strengthened boundary validation yields earlier, clearer failures and reduces runtime ambiguity.
2. This remains architecture-policy hardening with no game-specific logic in GameDef/runtime paths.
3. No backwards-compatibility aliases/shims: invalid resource objects should fail immediately.

## What to Change

### 1. Strengthen runtime-resource guard precision

1. Validate minimal callable/surface contract used by trigger-dispatch descendants:
   - `collector.warnings` array,
   - `collector.trace` array-or-null,
   - `queryRuntimeCache.getTokenZoneByTokenIdIndex` function,
   - `queryRuntimeCache.setTokenZoneByTokenIdIndex` function.
2. Keep checks minimal and behavior-focused to avoid overfitting implementation details.

### 2. Add malformed-resource regression coverage

1. Add tests where ownership fields exist but nested runtime shape is invalid (non-array collector fields, missing/non-callable query-cache methods).
2. Ensure failures remain `RUNTIME_CONTRACT_INVALID` with actionable messages.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)

## Out of Scope

- Query cache public-surface narrowing (`archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Context-constructor guard ticket (`archive/tickets/KERQUERY/KERQUERY-018-enforce-runtime-resource-constructor-contract-guards.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Structurally malformed `evalRuntimeResources` (including malformed nested collector/query-cache shapes) fail at trigger-dispatch boundary with explicit contract errors.
2. Valid resources continue to execute unchanged behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime resource ownership boundary remains explicit and deterministic.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trigger-dispatch.test.ts` — extend malformed-resource contract tests beyond field presence into nested collector/query-cache shape checks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Hardened `dispatchTriggers` runtime validation for `request.evalRuntimeResources` in `packages/engine/src/kernel/trigger-dispatch.ts` from shallow ownership-field presence checks to minimal nested contract checks:
    - `collector` object, `collector.warnings` array, `collector.trace` array-or-null
    - `queryRuntimeCache` object with callable `getTokenZoneByTokenIdIndex` and `setTokenZoneByTokenIdIndex`
  - Added regression coverage in `packages/engine/test/unit/trigger-dispatch.test.ts` for malformed nested runtime-resource shapes and updated the existing missing-ownership-fields assertion to match the stronger field-level diagnostics.
- **Deviations from Original Plan**:
  - None on scope; implementation remained boundary-focused and did not introduce compatibility aliases or game-specific logic.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅

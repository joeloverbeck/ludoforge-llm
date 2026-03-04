# KERQUERY-010: Eliminate dual resource inputs in trigger dispatch

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel trigger dispatch API and call-site contract hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/phase-lifecycle.ts

## Problem

`dispatchTriggers` currently accepts both `collector` and `evalRuntimeResources`. When both are passed, `evalRuntimeResources` silently wins. This creates an ambiguous ownership surface that can hide caller mistakes and violates explicit operation-resource boundaries.

## Assumption Reassessment (2026-03-04)

1. Trigger/eval/effect paths now support operation-scoped resources; this remains the intended ownership model.
2. `dispatchTriggers` still exposes a dual-input resource API (`collector` + `evalRuntimeResources`) and recursive cascade invocations currently pass both paths.
3. Kernel call sites in `apply-move` and `phase-lifecycle` currently thread both arguments, so ambiguity is active in production paths.
4. Existing `trigger-dispatch` tests cover firing order/depth semantics but do not explicitly lock the single-input ownership contract.

## Architecture Check

1. A single canonical resource input is cleaner than split optional knobs and removes precedence ambiguity.
2. This is runtime infrastructure only; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims: migrate call sites directly to the canonical signature.

## What to Change

### 1. Collapse trigger-dispatch inputs to one ownership model

1. Remove `collector` argument from `dispatchTriggers`.
2. Keep runtime collector derivation exclusively through `EvalRuntimeResources` (either supplied or created once per dispatch operation).
3. Ensure recursive cascade calls pass through the same resources object identity.

### 2. Migrate all trigger-dispatch call sites

1. Update apply/lifecycle call sites to provide canonical resources only.
2. Remove now-dead fallback/precedence logic from trigger-dispatch implementation.

### 3. Add explicit API-contract regression coverage

1. Add/adjust tests to assert trigger dispatch has one resource ownership path only.
2. Ensure no behavior regression in trigger firing order/depth handling.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)

## Out of Scope

- Query runtime cache API encapsulation (`KERQUERY-009`)
- Lifecycle-wide resource threading redesign beyond trigger dispatch API contract (`KERQUERY-011`)
- Any game-specific behavior/rules/visual-config concerns

## Acceptance Criteria

### Tests That Must Pass

1. `dispatchTriggers` has a single canonical resource input path (no dual-input precedence ambiguity).
2. Trigger recursion still preserves deterministic firing/truncation behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Operation resource ownership remains explicit and unambiguous.
2. Runtime remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trigger-dispatch.test.ts` — lock single-input resource contract and preserve existing trigger semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js packages/engine/dist/test/unit/apply-move.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-04
- **What Changed**:
  - Removed `collector` from the `dispatchTriggers` API; trigger dispatch now has one canonical resource input path via `EvalRuntimeResources`.
  - Removed collector/precedence fallback logic in `packages/engine/src/kernel/trigger-dispatch.ts`; default resource creation now uses `createEvalRuntimeResources()` when no resources are supplied.
  - Updated all kernel call sites (`apply-move`, `phase-lifecycle`, and trigger recursion) to pass only canonical resources.
  - Added a unit regression test that validates dispatch uses provided runtime resources as the single ownership path by asserting trace collection through an injected collector-backed resources object.
- **Deviations From Original Plan**:
  - None for architecture or scope; reassessment only clarified that contract coverage needed to be explicit.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js packages/engine/dist/test/unit/apply-move.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.

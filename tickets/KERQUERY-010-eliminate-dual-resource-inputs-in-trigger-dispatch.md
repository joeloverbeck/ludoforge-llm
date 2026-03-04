# KERQUERY-010: Eliminate dual resource inputs in trigger dispatch

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel trigger dispatch API and call-site contract hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/phase-lifecycle.ts

## Problem

`dispatchTriggers` currently accepts both `collector` and `evalRuntimeResources`. When both are passed, `evalRuntimeResources` silently wins. This creates an ambiguous ownership surface that can hide caller mistakes and violates explicit operation-resource boundaries.

## Assumption Reassessment (2026-03-04)

1. Trigger/eval/effect paths now support operation-scoped resources; this is the intended ownership model.
2. `dispatchTriggers` still keeps a parallel `collector` argument alongside `evalRuntimeResources`.
3. No active ticket currently removes this dual-input API ambiguity.

## Architecture Check

1. A single canonical resource input is cleaner than split optional knobs and prevents precedence ambiguity.
2. This is runtime infrastructure only; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims: migrate call sites directly to the canonical signature.

## What to Change

### 1. Collapse trigger-dispatch inputs to one ownership model

1. Remove `collector` argument from `dispatchTriggers`.
2. Require/derive runtime collector only from `EvalRuntimeResources`.
3. Ensure recursive cascade calls pass through the same resources object.

### 2. Migrate all trigger-dispatch call sites

1. Update apply/lifecycle/event call sites to provide canonical resources.
2. Remove any now-dead fallback/precedence logic.

### 3. Add explicit API-contract regression coverage

1. Add/adjust tests to ensure trigger dispatch uses one resource ownership path only.
2. Ensure no behavior regression in trigger firing order/depth handling.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)

## Out of Scope

- Query runtime cache API encapsulation (`KERQUERY-009`)
- Lifecycle-wide resource threading redesign beyond trigger dispatch API contract
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

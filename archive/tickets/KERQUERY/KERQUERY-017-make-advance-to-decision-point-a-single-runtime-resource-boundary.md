# KERQUERY-017: Make advanceToDecisionPoint a single runtime-resource boundary

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — lifecycle/phase-advance runtime resource ownership and regression coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-011-thread-single-operation-resources-through-initial-state-lifecycle.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/test/unit/phase-advance.test.ts

## Problem

`advanceToDecisionPoint` now accepts `EvalRuntimeResources`, but when callers omit this argument, each internal `advancePhase` iteration currently creates fresh runtime resources. That weakens operation boundaries and can prevent same-operation query-cache reuse across auto-advance loops.

## Assumption Reassessment (2026-03-05)

1. Lifecycle dispatch and phase advancement were recently moved toward canonical `EvalRuntimeResources` ownership.
2. `advancePhase` currently creates a default resources object when one is not provided.
3. `advanceToDecisionPoint` currently forwards `evalRuntimeResources` to `advancePhase` but does not create one local default for the full loop when omitted.
4. Existing tests validate lifecycle behavior and operation-scoped seat-resolution threading, but do not lock the omitted-resource runtime-resource boundary contract for `advanceToDecisionPoint`.
5. Related tickets `KERQUERY-012` to `KERQUERY-016` are archived and do not cover this exact phase-advance omitted-resource default-boundary gap.

## Architecture Check

1. `advanceToDecisionPoint` should be an explicit operation boundary: if no resources are supplied, it should create exactly one local resources object and reuse it for the entire decision-point loop.
2. This is pure runtime infrastructure and remains game-agnostic; no game-specific behavior leaks into GameDef/simulation kernel logic.
3. No backwards-compatibility aliasing/shims: move directly to canonical runtime-resources ownership.

## What to Change

### 1. Enforce one default resources object per advanceToDecisionPoint operation

1. In `advanceToDecisionPoint`, create `operationResources = evalRuntimeResources ?? createEvalRuntimeResources()` once at function entry.
2. Thread `operationResources` through every internal `advancePhase` call.
3. Keep `advancePhase` signature/resource handling canonical and deterministic.

### 2. Add regression coverage for omitted-resource boundary behavior

1. Add a unit test where `advanceToDecisionPoint` is called without resources.
2. Add a source-contract guard that asserts `advanceToDecisionPoint` creates one operation-scoped default resources object (`evalRuntimeResources ?? createEvalRuntimeResources()`) and threads that same identifier through internal `advancePhase` calls.
3. Preserve existing lifecycle semantics and trigger ordering assertions.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)

## Out of Scope

- Trigger-dispatch API hardening (`archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Legal-choices discovery resource identity (`archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md`)
- Query-runtime-cache key/accessor centralization and ownership boundary policy (`archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`, `archive/tickets/KERQUERY/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md`)

## Acceptance Criteria

### Tests That Must Pass

1. `advanceToDecisionPoint` without provided resources reuses one operation-scoped resources object across its internal auto-advance loop.
2. Existing phase/lifecycle semantics remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime resource ownership boundaries are explicit and deterministic.
2. GameDef/runtime/simulation remain game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — add omitted-resource boundary regression asserting operation-scoped default resource allocation/threading within `advanceToDecisionPoint`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - `advanceToDecisionPoint` now creates one operation-scoped default runtime-resources object (`operationResources`) when `evalRuntimeResources` is omitted.
  - `advanceToDecisionPoint` now threads `operationResources` through internal `advancePhase` calls, removing per-iteration default resource allocation.
  - Added source-contract regression coverage in `phase-advance.test.ts` to lock:
    - operation-scoped default resource construction via `evalRuntimeResources ?? createEvalRuntimeResources()`
    - forwarding of `operationResources` (and not raw `evalRuntimeResources`) into `advancePhase`
  - Updated ticket assumptions to reflect archived status of `KERQUERY-012..016` and align omitted-resource coverage strategy with observable architecture contracts.
- **Deviations From Original Plan**:
  - Replaced the proposed runtime-instrumented omitted-resource cache assertion with a source-contract guard. This avoids introducing test-only indirection while still enforcing the intended operation-boundary architecture.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/phase-advance.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (380/380).
  - `pnpm -F @ludoforge/engine lint` passed.

# KERQUERY-017: Make advanceToDecisionPoint a single runtime-resource boundary

**Status**: PENDING
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
4. Existing tests validate provided-resource threading and lifecycle behavior, but do not lock the omitted-resource operation-boundary contract for `advanceToDecisionPoint`.
5. Active tickets `KERQUERY-012` to `KERQUERY-016` do not cover this exact phase-advance default-boundary gap.

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
2. Use an instrumented query cache to assert cache index build/write occurs once across multiple internal lifecycle advances in a single call.
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

1. `packages/engine/test/unit/phase-advance.test.ts` — add omitted-resource boundary regression asserting single-operation cache reuse.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

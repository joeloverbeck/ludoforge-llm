# KERQUERY-028: Enforce operation-scoped resource reuse in phase-advance tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test architecture and regression-strengthening for phase-advance resource ownership
**Deps**: archive/tickets/KERQUERY/KERQUERY-017-make-advance-to-decision-point-a-single-runtime-resource-boundary.md, archive/tickets/KERQUERY/KERQUERY-019-centralize-eval-resource-test-fixture-builders.md, packages/engine/test/unit/phase-advance.test.ts, packages/engine/test/helpers/replay-harness.ts

## Problem

Recent call-site migration made `advancePhase` explicit about resources, but several multi-step tests still allocate fresh `createEvalRuntimeResources()` per phase step. This preserves behavior checks but weakens test coverage of operation-scoped resource identity reuse.

## Assumption Reassessment (2026-03-05)

1. `advanceToDecisionPoint` now enforces one operation-scoped resources object when omitted.
2. Multiple phase-chain tests currently pass new resources object per `advancePhase` call.
3. Active tickets do not specifically lock phase-chain tests to reuse one operation-scoped resources object for multi-step phase advancement.
4. Ticket `KERQUERY-019` addresses fixture deduplication broadly, but not this phase-advance operation-boundary regression target.

## Architecture Check

1. Reusing one resources object per test operation more accurately models production ownership boundaries and catches identity regressions earlier.
2. This is test-infrastructure hardening only and preserves game-agnostic runtime boundaries.
3. No backwards-compatibility shims: tests should directly enforce canonical ownership behavior.

## What to Change

### 1. Tighten phase-chain tests to use operation-scoped resources

1. Update phase-chain tests to allocate one `operationResources` per scenario and thread it through all intra-scenario `advancePhase` calls.
2. Keep behavior assertions unchanged.

### 2. Add explicit regression coverage for resource reuse in multi-step phase loops

1. Add/extend tests asserting phase chains keep one resource identity across multiple `advancePhase` calls in one operation.
2. Reuse shared helper builders if available from `KERQUERY-019`.

## Files to Touch

- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/helpers/replay-harness.ts` (modify if needed)
- `packages/engine/test/integration/**` and `packages/engine/test/e2e/**` phase-chain call sites (modify as needed)

## Out of Scope

- Runtime behavior changes in kernel phase logic
- `advancePhase` API-shape migration (`tickets/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md`)
- Query runtime cache policy/public-surface tickets (`archive/tickets/KERQUERY/KERQUERY-021-enforce-query-cache-key-literal-ownership-policy.md`, `archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Multi-step phase-chain tests reuse one operation-scoped resources object per scenario.
2. Existing behavior assertions remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Test architecture enforces explicit operation-boundary resource ownership.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — convert phase-chain scenarios to operation-scoped resources reuse.
2. Selected integration/e2e phase-chain tests — ensure one resources object is threaded through each scenario chain.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

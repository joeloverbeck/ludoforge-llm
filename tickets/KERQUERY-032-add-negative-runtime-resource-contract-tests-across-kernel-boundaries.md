# KERQUERY-032: Add negative runtime-resource contract tests across kernel boundaries

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel boundary contract regression coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-024-strengthen-eval-runtime-resources-contract-guards-in-trigger-dispatch.md, packages/engine/src/kernel/eval-runtime-resources-contract.ts, packages/engine/src/kernel/action-actor.ts, packages/engine/src/kernel/action-executor.ts, packages/engine/src/kernel/action-applicability-preflight.ts, packages/engine/src/kernel/phase-lifecycle.ts, packages/engine/src/kernel/boundary-expiry.ts

## Problem

Runtime-resource contract guards were expanded to several kernel entry boundaries, but regression tests currently lock negative malformed-resource behavior primarily for `dispatchTriggers` and the shared validator in isolation. Boundary-level fail-fast behavior for other changed APIs is not explicitly locked.

## Assumption Reassessment (2026-03-05)

1. `assertEvalRuntimeResourcesContract` is now used in multiple public runtime boundaries (`resolveActionActor`, `resolveActionExecutor`, `resolveActionApplicabilityPreflight`, `dispatchLifecycleEvent`, `applyBoundaryExpiry`).
2. Existing tests for those boundaries are mostly positive-path behavior checks and do not uniformly assert malformed `evalRuntimeResources` failures with `RUNTIME_CONTRACT_INVALID`.
3. Existing active tickets (`KERQUERY-025`..`KERQUERY-031`) do not explicitly cover this cross-boundary negative-contract regression gap.

## Architecture Check

1. Boundary-level negative tests are cleaner than relying on shared-helper unit tests alone; they lock public API contract behavior where callers interact.
2. This remains game-agnostic kernel contract hardening and does not introduce game-specific behavior into `GameDef`/runtime/simulator.
3. No backwards-compatibility aliases/shims: malformed resources should fail immediately.

## What to Change

### 1. Add malformed-resource negative tests for each updated boundary

1. Add one fail-fast malformed-resource test for each boundary API that now validates `evalRuntimeResources`.
2. Assert `RUNTIME_CONTRACT_INVALID` and actionable error messages that include the boundary-specific resource path.

### 2. Keep tests minimal and non-duplicative

1. Reuse shared malformed fixtures/builders where possible to avoid repeated setup.
2. Keep each boundary test focused on contract-failure behavior, not unrelated domain logic.

## Files to Touch

- `packages/engine/test/unit/kernel/action-actor.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-executor.test.ts` (modify)
- `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` (modify)
- `packages/engine/test/unit/phase-lifecycle-resources.test.ts` (modify)
- `packages/engine/test/unit/boundary-expiry.test.ts` (modify)
- `packages/engine/test/helpers/eval-runtime-resources-fixtures.ts` (new, if shared malformed fixture helpers are needed)

## Out of Scope

- Additional runtime behavior refactors in action/phase execution logic
- API shape migration tickets (`archive/tickets/KERQUERY/KERQUERY-025-lock-dispatchtriggers-single-request-api-shape-with-source-guards.md`, `archive/tickets/KERQUERY/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md`)
- Query cache public-surface or ownership-policy tickets (`archive/tickets/KERQUERY/KERQUERY-029-derive-query-cache-key-literal-policy-from-canonical-owner.md`, `archive/tickets/KERQUERY/KERQUERY-030-harden-query-runtime-cache-ownership-policy-with-ast-signature-checks.md`, `archive/tickets/KERQUERY/KERQUERY-031-enforce-query-runtime-cache-index-immutability-at-write-boundary.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Each updated boundary API fails fast with `RUNTIME_CONTRACT_INVALID` for malformed `evalRuntimeResources`.
2. Existing positive behavior tests remain unchanged and passing.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime-resource boundary contracts are explicit and regression-protected across all covered entrypoints.
2. `GameDef`/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/action-actor.test.ts` — add malformed `evalRuntimeResources` boundary-failure test.
2. `packages/engine/test/unit/kernel/action-executor.test.ts` — add malformed `evalRuntimeResources` boundary-failure test.
3. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — add malformed `evalRuntimeResources` boundary-failure test.
4. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — add malformed `evalRuntimeResources` boundary-failure test.
5. `packages/engine/test/unit/boundary-expiry.test.ts` — add malformed `evalRuntimeResources` boundary-failure test.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/action-actor.test.js packages/engine/dist/test/unit/kernel/action-executor.test.js packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js packages/engine/dist/test/unit/phase-lifecycle-resources.test.js packages/engine/dist/test/unit/boundary-expiry.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

**Completion date**: 2026-03-05

### What changed

Added one negative `RUNTIME_CONTRACT_INVALID` boundary-failure test to each of the five target test files:

1. `packages/engine/test/unit/kernel/action-actor.test.ts` — malformed `evalRuntimeResources` → `RUNTIME_CONTRACT_INVALID` with `resolveActionActor` resource path.
2. `packages/engine/test/unit/kernel/action-executor.test.ts` — malformed `evalRuntimeResources` → `RUNTIME_CONTRACT_INVALID` with `resolveActionExecutor` resource path.
3. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — malformed `evalRuntimeResources` → `RUNTIME_CONTRACT_INVALID` with `resolveActionApplicabilityPreflight` resource path.
4. `packages/engine/test/unit/phase-lifecycle-resources.test.ts` — malformed `evalRuntimeResources` → `RUNTIME_CONTRACT_INVALID` with `dispatchLifecycleEvent` resource path.
5. `packages/engine/test/unit/boundary-expiry.test.ts` — malformed `evalRuntimeResources` → `RUNTIME_CONTRACT_INVALID` with `applyBoundaryExpiry` resource path.

### Deviations from original plan

- **Shared fixture helper file not created**: The ticket proposed `packages/engine/test/helpers/eval-runtime-resources-fixtures.ts`. The inline malformed-object pattern (`{ collector: 'not-an-object', queryRuntimeCache: {} } as unknown as EvalRuntimeResources`) is minimal and consistent with the existing `phase-advance.test.ts` convention. A shared helper would be over-engineering for a one-liner cast.
- **Import approach**: Used direct `EvalRuntimeResources` type import instead of `Parameters<typeof fn>[0]['...']` to avoid `exactOptionalPropertyTypes` conflicts.

### Verification results

- Engine build: clean (tsc, no errors)
- Targeted tests: 31/31 passing (5 new + 26 existing across the 5 files)
- Full engine suite: 3653/3653 passing (up from 3648 baseline)
- Lint: clean

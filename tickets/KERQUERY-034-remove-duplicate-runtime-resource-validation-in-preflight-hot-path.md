# KERQUERY-034: Remove duplicate runtime-resource validation in preflight hot path

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel performance/clarity refinement for resource-contract validation flow
**Deps**: archive/tickets/KERQUERY/KERQUERY-032-add-negative-runtime-resource-contract-tests-across-kernel-boundaries.md, packages/engine/src/kernel/action-applicability-preflight.ts, packages/engine/src/kernel/action-actor.ts, packages/engine/src/kernel/action-executor.ts

## Problem

`resolveActionApplicabilityPreflight` validates `evalRuntimeResources` and then calls `resolveActionActor`/`resolveActionExecutor`, which each validate again when resources are passed. This duplicates contract checks in a hot path without adding architectural value.

## Assumption Reassessment (2026-03-05)

1. `resolveActionApplicabilityPreflight` executes in frequently-invoked legal-move/applicability paths.
2. Current flow can perform redundant runtime-resource contract validation for the same resource object within one preflight operation.
3. Existing active tickets do not explicitly address duplicate validation removal in this path.

## Architecture Check

1. Validating exactly once at the ownership boundary is cleaner and easier to reason about than repeated checks at nested calls.
2. This keeps robust fail-fast behavior while reducing overhead and preserving explicit contract semantics.
3. This change is runtime-infrastructure only; it keeps `GameDef` and simulation game-agnostic and introduces no compatibility shims.

## What to Change

### 1. Define a single-validation flow for preflight

1. Keep one explicit validation at preflight boundary when `evalRuntimeResources` is provided.
2. Route nested actor/executor resolution through internal validated paths that do not revalidate the same object.

### 2. Preserve safety for direct external resolver calls

1. Retain contract validation when `resolveActionActor`/`resolveActionExecutor` are called directly by other boundaries.
2. Avoid hidden alias APIs; use clear internal helper naming to separate boundary vs internal validated call paths.

## Files to Touch

- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify)
- `packages/engine/src/kernel/action-actor.ts` (modify)
- `packages/engine/src/kernel/action-executor.ts` (modify)
- `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/action-actor.test.ts` (modify only if direct boundary behavior assertions need adjustment)
- `packages/engine/test/unit/kernel/action-executor.test.ts` (modify only if direct boundary behavior assertions need adjustment)

## Out of Scope

- Broader legal-moves enumeration algorithm changes
- AdvancePhase API-shape/runtime boundary tickets (`archive/tickets/KERQUERY/KERQUERY-026-harden-advancephase-runtime-resource-contract-boundary.md`, `archive/tickets/KERQUERY/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md`)
- Query-runtime-cache API/policy tickets (`archive/tickets/KERQUERY/KERQUERY-029-derive-query-cache-key-literal-policy-from-canonical-owner.md`, `archive/tickets/KERQUERY/KERQUERY-030-harden-query-runtime-cache-ownership-policy-with-ast-signature-checks.md`, `archive/tickets/KERQUERY/KERQUERY-031-enforce-query-runtime-cache-index-immutability-at-write-boundary.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Preflight path performs one runtime-resource validation per call when resources are caller-provided.
2. Direct calls to `resolveActionActor`/`resolveActionExecutor` still fail fast on malformed resources.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime-resource contract enforcement remains explicit and deterministic at boundaries.
2. Preflight internal flow avoids redundant guard work while preserving correctness.
3. `GameDef`/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/action-applicability-preflight.test.ts` — add regression ensuring malformed resources still fail and ensure no duplicate boundary validation path regressions.
2. `packages/engine/test/unit/kernel/action-actor.test.ts` — retain direct boundary malformed-resource failure coverage.
3. `packages/engine/test/unit/kernel/action-executor.test.ts` — retain direct boundary malformed-resource failure coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/action-applicability-preflight.test.js packages/engine/dist/test/unit/kernel/action-actor.test.js packages/engine/dist/test/unit/kernel/action-executor.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

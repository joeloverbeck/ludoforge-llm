# KERQUERY-033: Enforce eval-runtime-resource boundary guard policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — source-policy enforcement for runtime-resource guard coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-024-strengthen-eval-runtime-resources-contract-guards-in-trigger-dispatch.md, packages/engine/src/kernel/eval-runtime-resources-contract.ts, packages/engine/test/helpers/kernel-source-guard.ts

## Problem

A shared runtime-resource validator now exists, but there is no source-policy test ensuring boundary functions that accept optional/provided `evalRuntimeResources` invoke the validator. Future refactors could accidentally remove a guard from one boundary while tests still pass elsewhere.

## Assumption Reassessment (2026-03-05)

1. `assertEvalRuntimeResourcesContract` is the canonical runtime-resource boundary validator.
2. Guard invocation currently relies on manual discipline in each boundary module.
3. Existing active tickets do not define a source-policy invariant that prevents silent guard omission on boundary signatures that accept `evalRuntimeResources`.

## Architecture Check

1. A single source-policy guard for boundary coverage is cleaner and more extensible than ad hoc per-file vigilance.
2. This is architecture-policy enforcement only and preserves game-agnostic `GameDef`/runtime/simulator layers.
3. No backwards-compatibility aliases/shims: policy enforces canonical contract guard usage directly.

## What to Change

### 1. Add source-policy test for boundary guard coverage

1. Define the set of boundary files/functions that accept `evalRuntimeResources` from caller input.
2. Assert each declared boundary includes exactly one explicit call to `assertEvalRuntimeResourcesContract` near function entry.

### 2. Keep policy robust and maintainable

1. Use AST-based checks or hardened source-guard helpers instead of brittle exact-string matching.
2. Keep failure diagnostics explicit so remediation is straightforward when boundaries change.

## Files to Touch

- `packages/engine/test/unit/lint/eval-runtime-resources-boundary-guard-policy.test.ts` (new)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify only if helper extensions are needed)

## Out of Scope

- Runtime behavior changes in kernel execution paths
- API signature redesign work (`tickets/KERQUERY-025-lock-dispatchtriggers-single-request-api-shape-with-source-guards.md`, `tickets/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md`)
- Query-cache ownership/public-surface tickets (`tickets/KERQUERY-029-derive-query-cache-key-literal-policy-from-canonical-owner.md`, `tickets/KERQUERY-030-harden-query-runtime-cache-ownership-policy-with-ast-signature-checks.md`, `tickets/KERQUERY-031-enforce-query-runtime-cache-index-immutability-at-write-boundary.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails if a boundary accepting caller-provided `evalRuntimeResources` omits the contract guard.
2. Policy test fails if a boundary introduces duplicate guard calls.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime-resource boundary guard usage remains explicit, deterministic, and centralized around one canonical validator.
2. `GameDef`/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/eval-runtime-resources-boundary-guard-policy.test.ts` — enforce boundary-guard coverage and no duplicate guard invocation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/eval-runtime-resources-boundary-guard-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

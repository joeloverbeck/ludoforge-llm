# KERQUERY-036: Generalize request-API shape policy guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — lint policy architecture for request-object API contracts
**Deps**: archive/tickets/KERQUERY/KERQUERY-025-lock-dispatchtriggers-single-request-api-shape-with-source-guards.md, archive/tickets/KERQUERY/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md, packages/engine/test/unit/lint/dispatch-triggers-api-shape-policy.test.ts, packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts, packages/engine/test/helpers/kernel-source-ast-guard.ts

## Problem

The codebase now has multiple request-object API shape guards (`dispatchTriggers`, `advancePhase`), but each policy test is implemented ad hoc. This duplicates AST inspection logic and can cause policy drift as more request-object boundaries are introduced.

## Assumption Reassessment (2026-03-05)

1. Request-object API shape policy exists for at least two kernel entrypoints (`dispatchTriggers`, `advancePhase`).
2. Current policy tests independently reimplement similar AST checks (single export, one required request parameter, explicit request type).
3. Existing active tickets do not currently target consolidation of request-API shape policy enforcement into shared lint infrastructure.

## Architecture Check

1. A shared policy helper for request-object API shape contracts is cleaner and more extensible than duplicating nearly identical AST logic per endpoint.
2. This is static policy/testing infrastructure only and does not alter game data boundaries; `GameSpecDoc` remains game-specific while `GameDef`/kernel/simulator remain game-agnostic.
3. No backwards-compatibility aliasing/shims: this work strengthens enforcement of canonical APIs.

## What to Change

### 1. Add shared request-API policy helper(s)

1. Create reusable lint helper utilities for asserting canonical request-object function export shape.
2. Parameterize by file path, function identifier, and request type name.

### 2. Migrate existing request-shape policy tests

1. Refactor `dispatch-triggers-api-shape-policy.test.ts` and `phase-advance-api-shape-policy.test.ts` to use shared helper utilities.
2. Preserve strict failure diagnostics and prohibit overload/positional regressions.

### 3. Define onboarding pattern for future request APIs

1. Add a small policy declaration table or helper invocation pattern that makes adding new request-object API guards straightforward.
2. Keep this strictly lint/test-level; no runtime behavior changes.

## Files to Touch

- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify)
- `packages/engine/test/unit/lint/dispatch-triggers-api-shape-policy.test.ts` (modify)
- `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` (modify)
- `packages/engine/test/unit/lint/request-api-shape-policy-helpers.test.ts` (new, if helper-level behavioral coverage is needed)

## Out of Scope

- Runtime kernel behavior refactors
- Runtime-resource guard policy work in `tickets/KERQUERY-033-enforce-eval-runtime-resource-boundary-guard-policy.md`
- Query-runtime-cache ownership/index policy tickets (`archive/tickets/KERQUERY/KERQUERY-029-derive-query-cache-key-literal-policy-from-canonical-owner.md`, `tickets/KERQUERY-030-harden-query-runtime-cache-ownership-policy-with-ast-signature-checks.md`, `tickets/KERQUERY-031-enforce-query-runtime-cache-index-immutability-at-write-boundary.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Shared policy helper enforces single canonical request-object function API shape with no overload/positional variants.
2. Existing `dispatchTriggers` and `advancePhase` policy tests pass through shared helper with equivalent strictness.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Request-object API policy remains explicit, deterministic, and easy to extend to additional kernel boundaries.
2. Game-agnostic runtime/kernel architecture remains unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/dispatch-triggers-api-shape-policy.test.ts` — migrate to shared helper while preserving current constraints.
2. `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` — migrate to shared helper while preserving current constraints.
3. `packages/engine/test/unit/lint/request-api-shape-policy-helpers.test.ts` — verify helper behavior and diagnostics for representative pass/fail fixtures (if helper complexity justifies direct tests).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/dispatch-triggers-api-shape-policy.test.js packages/engine/dist/test/unit/lint/phase-advance-api-shape-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

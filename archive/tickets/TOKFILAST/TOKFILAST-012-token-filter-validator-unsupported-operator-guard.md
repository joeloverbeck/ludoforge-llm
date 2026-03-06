# TOKFILAST-012: Harden Unsupported TokenFilterExpr Operator Coverage in Validator Tests

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No production logic changes expected — unit coverage hardening only
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-009-token-filter-runtime-operator-fail-closed.md, archive/tickets/TOKFILAST/TOKFILAST-011-token-filter-empty-args-surface-coverage-hardening.md

## Problem

Current validator logic already rejects unsupported token-filter operators, but coverage is thin: the existing regression assertion only verifies one malformed operator case on an effect surface. Query-surface coverage and nested-path unsupported-operator path fidelity are not explicitly asserted.

## Assumption Reassessment (2026-03-06)

1. `validateTokenFilterExpr` already explicitly rejects unsupported non-`and|or|not` operators with `DOMAIN_QUERY_INVALID` at `${entryPath}.op` (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
2. `packages/engine/test/unit/validate-gamedef.test.ts` already has one unsupported-operator regression (`reveal.filter.op`), so the prior "no coverage" assumption is stale.
3. The practical remaining gap is breadth and path-fidelity coverage: query-surface malformed operator assertions and nested malformed-node path assertions for unsupported operators.

## Architecture Check

1. The current architecture is already correct: operator-contract enforcement lives in generic validator traversal and runtime traversal utilities.
2. Re-implementing validator guards would be redundant and increase drift risk; the durable improvement is broader regression coverage.
3. Coverage additions remain game-agnostic and preserve strict fail-closed behavior without compatibility aliases.

## What to Change

### 1. Extend unsupported-operator coverage to query surfaces

Add a malformed `op` assertion for a query filter surface (for example `tokensInZone.filter`) to guarantee unsupported operators are rejected outside effect-only paths.

### 2. Assert deterministic nested diagnostic paths for unsupported operators

Add a nested malformed operator case and assert the exact nested path (`.arg`, `.args[n]`) for `DOMAIN_QUERY_INVALID`.

### 3. Keep production code unchanged unless tests expose a real divergence

Do not modify validator/runtime code unless new tests demonstrate a behavioral mismatch against intended fail-closed contracts.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Runtime evaluator fail-closed behavior (`TOKFILAST-009`).
- Token-filter canonicalization changes at compile/lowering boundary (`TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. Unsupported token-filter operators on both query and effect surfaces produce `DOMAIN_QUERY_INVALID`.
2. Nested malformed operators report stable fully-qualified paths ending in `.op`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator continues to reject malformed token-filter operators before runtime execution.
2. Validation remains game-agnostic and independent from GameSpecDoc game-specific content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add unsupported-operator rejection assertions for query and nested-path cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Reassessed ticket assumptions and corrected scope from "restore missing validator guard" to "coverage hardening only".
  - Added query-surface unsupported-operator regression coverage in `validate-gamedef` tests.
  - Added nested unsupported-operator path-fidelity coverage to lock deterministic `.arg/.args[n].op` diagnostics.
- What changed vs originally planned:
  - No production validator/runtime code changes were needed because unsupported-operator guarding was already implemented.
  - Work was intentionally narrowed to robust regression coverage to avoid redundant architecture churn.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.

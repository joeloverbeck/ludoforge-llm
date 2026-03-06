# TOKFILAST-013: Harden Shared Token-Filter Traversal Utility to Fail Closed

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared kernel traversal walk contract + focused tests
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-004-token-filter-expression-traversal-unification.md, archive/tickets/TOKFILAST/TOKFILAST-012-token-filter-validator-unsupported-operator-guard.md

## Problem

`foldTokenFilterExpr` is already fail-closed for unsupported operators, but `walkTokenFilterExpr` still accepts malformed nodes silently (it visits the current node, then skips traversal without throwing). For utility consumers outside validator diagnostics, this is a silent-failure hazard.

## Assumption Reassessment (2026-03-06)

1. `foldTokenFilterExpr` in `packages/engine/src/kernel/token-filter-expr-utils.ts` already throws deterministic `TYPE_MISMATCH` for unsupported operators; the old fallback-to-`or` assumption is stale.
2. `walkTokenFilterExpr` currently does not throw on malformed operators/non-conforming nodes; it simply stops descending.
3. Unsupported-operator regression tests already exist in:
   - `packages/engine/test/unit/token-filter.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
4. Dedicated utility-level contract tests for `token-filter-expr-utils` are still missing.

## Architecture Check

1. Hardening `walkTokenFilterExpr` to fail closed is more robust than silent skip semantics in shared traversal infrastructure.
2. Centralizing malformed-node rejection in the utility reduces drift across call sites and keeps behavior generic/agnostic.
3. No backwards-compatibility aliasing/shims should be introduced; malformed operators/non-conforming nodes must fail deterministically.

## Updated Scope

### 1. Make `walkTokenFilterExpr` fail closed for malformed nodes

Refactor traversal dispatch to explicitly accept only `predicate|not|and|or` node shapes and throw deterministic errors on unsupported operators/non-conforming node shapes.

### 2. Keep validator diagnostics deterministic

If walk fail-closed behavior changes validator control flow, ensure `validate-gamedef-behavior.ts` preserves deterministic `DOMAIN_QUERY_INVALID` diagnostics (including path fidelity) for malformed token-filter operators.

### 3. Add dedicated utility contract tests

Introduce focused unit tests for traversal utility behavior:
- path suffix generation for nested nodes
- fold/walk traversal order on valid expressions
- fail-closed behavior for malformed operators/non-conforming nodes

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify, if validator error mapping needs adjustment)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (new)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify, only if validator-path assertions need adjustment)

## Out of Scope

- Re-hardening `foldTokenFilterExpr` runtime semantics already covered by archived TOKFILAST tickets.
- Game-specific token-filter rules or any GameSpecDoc semantics redesign.
- CNL token-filter canonicalization/normalization work (`archive/tickets/TOKFILAST-007-token-filter-canonicalization-at-lowering-boundary.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Utility traversal throws deterministically for unsupported token-filter operators/non-conforming nodes.
2. Existing valid-expression behavior remains unchanged at current call sites.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared token-filter traversal infrastructure never silently accepts malformed operators.
2. Kernel/runtime remains game-agnostic; no game-specific branches or data contracts introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — utility-level fold/walk/path/fail-closed contract assertions.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — validator diagnostic-path assertions only if walk fail-closed error mapping changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Reassessed stale assumptions and narrowed scope to the real remaining gap: fail-closed behavior for `walkTokenFilterExpr` plus utility contract coverage.
  - Hardened `packages/engine/src/kernel/token-filter-expr-utils.ts` to fail closed on both unsupported operators and non-conforming boolean node shapes (`and/or` nodes without valid `args`, malformed `not` nodes), with deterministic structured error context.
  - Added `isUnsupportedTokenFilterExprError` to map traversal failures at call sites without duplicating operator/shape logic.
  - Updated `packages/engine/src/kernel/validate-gamedef-behavior.ts` to catch utility traversal failures and emit deterministic `DOMAIN_QUERY_INVALID` diagnostics with stable path fidelity.
  - Added utility contract tests in `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts`.
  - Added validator regression coverage for malformed boolean token-filter node shape in `packages/engine/test/unit/validate-gamedef.test.ts`.
- Deviations from original plan:
  - No runtime evaluator call-site changes were required in `token-filter.ts` because `foldTokenFilterExpr` was already fail-closed and behavior remained correct for valid expressions.
  - The completed implementation also hardened non-conforming-node handling (not just unsupported operators) to enforce traversal invariants centrally.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.

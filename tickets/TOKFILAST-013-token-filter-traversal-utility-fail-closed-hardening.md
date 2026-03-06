# TOKFILAST-013: Harden Shared Token-Filter Traversal Utility to Fail Closed

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared kernel traversal utility contract + focused tests
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-004-token-filter-expression-traversal-unification.md, tickets/TOKFILAST-012-token-filter-validator-unsupported-operator-guard.md

## Problem

The shared `token-filter-expr-utils` currently defaults unknown operators to the `or` branch in fold/walk dispatch. This creates a central silent-fallback hazard for any caller that traverses malformed runtime input.

## Assumption Reassessment (2026-03-06)

1. `foldTokenFilterExpr` in `packages/engine/src/kernel/token-filter-expr-utils.ts` currently dispatches `expr.op === 'and' ? ... : handlers.or(...)`, which implicitly routes unknown operators to `or`.
2. `walkTokenFilterExpr` similarly assumes non-leaf/non-`not` nodes are args-bearing boolean nodes and traverses `entry.args` without explicit operator allow-list checks.
3. No active ticket currently hardens the traversal utility contract itself; existing operator-hardening ticket (`TOKFILAST-009`) targets runtime evaluator behavior only.

## Architecture Check

1. A fail-closed shared utility is safer and more extensible than implicit fallback semantics in central traversal infrastructure.
2. The utility remains generic kernel infrastructure and keeps all game-specific behavior in GameSpecDoc assets, not in GameDef/runtime logic.
3. No backwards-compatibility aliases/shims are introduced; malformed operators become explicit failures.

## What to Change

### 1. Make traversal dispatch explicit and fail-closed

Refactor `foldTokenFilterExpr` and `walkTokenFilterExpr` to explicitly branch on `and|or|not|predicate` and throw deterministic errors on unsupported operators/non-conforming shapes.

### 2. Keep call-site semantics deterministic

Review all current utility call sites (`token-filter.ts`, `validate-gamedef-behavior.ts`, `hidden-info-grants.ts`, `zone-selector-aliases.ts`, `eval-query.ts`) and ensure behavior remains unchanged for valid expressions.

### 3. Add dedicated utility contract tests

Introduce focused unit tests for traversal utility behavior:
- path suffix generation for nested nodes
- fold/walk traversal order on valid expressions
- fail-closed behavior for malformed operators

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify, if error plumbing changes)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify, if guard/plumbing changes)
- `packages/engine/test/unit/token-filter.test.ts` (modify, if runtime surface assertions update)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify, if validator surface assertions update)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (new)

## Out of Scope

- Game-specific token-filter rules or any GameSpecDoc semantics redesign.
- CNL token-filter canonicalization/normalization work (`TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. Utility traversal throws deterministically for unsupported token-filter operators.
2. Existing valid-expression behavior remains unchanged at all current call sites.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Shared token-filter traversal infrastructure never silently aliases unknown operators to valid semantics.
2. Kernel/runtime remains game-agnostic; no game-specific branches or data contracts introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — utility-level fold/walk/path/fail-closed contract assertions.
2. `packages/engine/test/unit/token-filter.test.ts` — runtime behavior sanity for malformed operators if utility error shape changes.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — validator-path sanity if traversal error handling affects diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

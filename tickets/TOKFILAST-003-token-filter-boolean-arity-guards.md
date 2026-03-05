# TOKFILAST-003: Enforce Non-Empty Boolean Token Filter Expressions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel token-filter schema + behavior validation
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md, tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

Canonical `TokenFilterExpr` currently accepts boolean nodes with empty arrays (`{ op: "and", args: [] }`, `{ op: "or", args: [] }`). Runtime semantics then collapse to vacuous truth/falsehood (`and[] => true`, `or[] => false`), which can silently create always-match or never-match filters. This is brittle authoring behavior and weakens contract strictness.

## Assumption Reassessment (2026-03-05)

1. `TokenFilterExprSchema` currently uses `z.array(TokenFilterExprSchema)` for `and`/`or` without a minimum length (`packages/engine/src/kernel/schemas-ast.ts`), so empty arrays parse.
2. Runtime evaluation in `matchesTokenFilterExpr` uses `.every` and `.some` over `args` (`packages/engine/src/kernel/token-filter.ts`), making empty `and` evaluate true and empty `or` evaluate false.
3. Behavior validation in `validateTokenFilterExpr` checks `Array.isArray(filter.args)` but does not currently reject empty arrays (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).

## Architecture Check

1. Enforcing non-empty `and`/`or` is a cleaner, safer expression contract than permitting vacuous operators.
2. This is a generic AST/runtime invariant; no game-specific logic is introduced into GameDef/kernel.
3. No backwards-compatibility aliases or shims are introduced; invalid shapes become explicit errors.

## What to Change

### 1. Tighten token-filter schema arity

Update `TokenFilterExprSchema` so `and`/`or` require at least one arg.

### 2. Add behavior-level guardrails

Update `validateTokenFilterExpr` to emit deterministic diagnostics when `and`/`or` args are empty, preserving clear error paths in validation even if malformed data bypasses schema checks.

### 3. Add focused tests for arity invariants

Add/adjust schema and validation tests to ensure empty boolean token filters are rejected.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- CNL authoring-surface migration away from array filter syntax (tracked by `TOKFILAST-002`).
- Any game-specific card/data edits.

## Acceptance Criteria

### Tests That Must Pass

1. `{ op: "and", args: [] }` and `{ op: "or", args: [] }` fail schema validation.
2. Behavior validation emits deterministic diagnostics for empty boolean token-filter args.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token filter boolean composition never allows zero-arity `and`/`or`.
2. GameDef/runtime contract remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — reject empty boolean token-filter nodes.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — verify diagnostics path/message for zero-arity boolean token filters.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

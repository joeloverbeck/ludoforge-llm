# TOKFILAST-010: Unify Boolean Arity Policy Across ConditionAST and TokenFilterExpr

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — AST schema + runtime/validation arity invariants
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md

## Problem

Boolean arity policy is currently inconsistent: token filters reject zero-arity `and`/`or`, while `ConditionAST` still allows vacuous `and[]` and `or[]` semantics. This creates cognitive and contract drift across expression systems.

## Assumption Reassessment (2026-03-06)

1. `TokenFilterExpr` schema and runtime now reject zero-arity `and`/`or` (`packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/token-filter.ts`).
2. `ConditionAST` schema still permits empty `and`/`or` arrays (`packages/engine/src/kernel/schemas-ast.ts`), and runtime evaluates vacuous truth/falsehood (`packages/engine/src/kernel/eval-condition.ts`).
3. Existing unit tests lock vacuous `ConditionAST` behavior (`packages/engine/test/unit/eval-condition.test.ts`).

## Architecture Check

1. A single boolean-arity invariant across expression AST families is cleaner and more maintainable than mixed semantics.
2. The change is generic to expression contracts and remains game-agnostic.
3. No backwards compatibility or alias behavior is introduced; invalid zero-arity boolean nodes become explicit errors.

## What to Change

### 1. Tighten `ConditionAST` boolean schema arity

Require `args.min(1)` for `ConditionAST` `and`/`or` nodes.

### 2. Add behavior/runtime guardrails for `ConditionAST` zero-arity booleans

Ensure malformed zero-arity nodes fail deterministically if they bypass schema parsing.

### 3. Update tests to enforce non-vacuous boolean policy

Replace vacuous truth/falsehood expectations with explicit rejection behavior.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify, if condition-validator path requires explicit guard)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify, if adding direct condition-schema arity assertions)
- `packages/engine/schemas/GameDef.schema.json` (modify; regenerated)
- `packages/engine/schemas/Trace.schema.json` (modify; regenerated as needed)
- `packages/engine/schemas/EvalReport.schema.json` (modify; regenerated as needed)

## Out of Scope

- Token-filter traversal utility refactor (`TOKFILAST-004`).
- CNL token-filter normalization pass (`TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. `ConditionAST` `and[]` / `or[]` fail schema validation.
2. Runtime condition evaluation rejects malformed zero-arity boolean nodes deterministically.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Boolean composition arity policy is consistent between `ConditionAST` and `TokenFilterExpr`.
2. Expression contracts remain game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-condition.test.ts` — replace vacuous behavior assertions with deterministic rejection checks.
2. `packages/engine/test/unit/schemas-ast.test.ts` — add condition-arity schema rejection checks (if absent).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

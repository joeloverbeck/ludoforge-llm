# TOKFILAST-010: Unify Boolean Arity Policy Across ConditionAST and TokenFilterExpr

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — AST schema + runtime/validation arity invariants
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md

## Problem

Boolean arity policy is currently inconsistent: token filters reject zero-arity `and`/`or`, while `ConditionAST` still allows vacuous `and[]` and `or[]` semantics. This creates cognitive and contract drift across expression systems.

## Assumption Reassessment (Verified 2026-03-06)

1. `TokenFilterExpr` schema and runtime reject zero-arity `and`/`or` (`packages/engine/src/kernel/schemas-ast.ts`, `packages/engine/src/kernel/token-filter.ts`).
2. `ConditionAST` schema currently permits empty `and`/`or` arrays (`packages/engine/src/kernel/schemas-ast.ts`), and runtime currently evaluates vacuous truth/falsehood (`packages/engine/src/kernel/eval-condition.ts`).
3. `validateConditionAst` currently traverses `and/or` args but does not enforce non-empty boolean arity (`packages/engine/src/kernel/validate-gamedef-behavior.ts`).
4. Existing unit tests lock vacuous runtime behavior (`packages/engine/test/unit/eval-condition.test.ts`) and do not yet assert explicit `ConditionAST` schema rejection for empty boolean args (`packages/engine/test/unit/schemas-ast.test.ts`).

## Architecture Decision

1. A single boolean-arity invariant across expression AST families is cleaner and more maintainable than mixed semantics.
2. Enforcing this at schema, validator, and runtime layers provides deterministic behavior for both typed and malformed/untyped entry paths.
3. This remains game-agnostic and data-driven; no game-specific logic is introduced.
4. No backwards compatibility or alias behavior is introduced; invalid zero-arity boolean nodes become explicit errors.

## What to Change

### 1. Tighten `ConditionAST` boolean schema arity

Require `args.min(1)` for `ConditionAST` `and`/`or` nodes.

### 2. Add deterministic runtime guardrails for malformed zero-arity booleans

Ensure malformed zero-arity nodes fail deterministically if they bypass schema parsing.

### 3. Add validation-layer guardrails for `ConditionAST` zero-arity booleans

Emit deterministic diagnostics in `validateConditionAst` when malformed `and/or` nodes have empty args.

### 4. Update tests to enforce non-vacuous boolean policy

Replace vacuous truth/falsehood expectations with explicit rejection behavior and add schema/validator assertions.

## Files to Touch

- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/eval-condition.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (regenerate/update)
- `packages/engine/schemas/Trace.schema.json` (regenerate/update if changed)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate/update if changed)

## Out of Scope

- Token-filter traversal utility refactor (`TOKFILAST-004`).
- CNL token-filter normalization pass (`TOKFILAST-007`).

## Acceptance Criteria

### Tests That Must Pass

1. `ConditionAST` `and[]` / `or[]` fail schema validation.
2. Runtime condition evaluation rejects malformed zero-arity boolean nodes deterministically.
3. `validateGameDef` emits deterministic diagnostics for malformed zero-arity `ConditionAST` booleans.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Boolean composition arity policy is consistent between `ConditionAST` and `TokenFilterExpr`.
2. Expression contracts remain game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-condition.test.ts` — replace vacuous behavior assertions with deterministic rejection checks.
2. `packages/engine/test/unit/schemas-ast.test.ts` — add condition-arity schema rejection checks.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — add validation diagnostic checks for empty `ConditionAST` boolean args.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine schema:artifacts`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Implemented schema enforcement for `ConditionAST` boolean arity (`and/or` now require `args.min(1)`), matching token-filter policy.
- Added runtime guardrails in `evalCondition` to reject malformed zero-arity `and/or` with deterministic `TYPE_MISMATCH`.
- Added validation guardrails in `validateConditionAst` with explicit `CONDITION_BOOLEAN_ARITY_INVALID` diagnostics for malformed/untyped paths.
- Strengthened tests beyond the original draft by adding explicit validator coverage (`validate-gamedef.test.ts`) in addition to runtime/schema tests.
- Enforced non-empty boolean `args` at type level in AST contracts (`ConditionAST` and `TokenFilterExpr`) and patched lowering/canonicalization call sites to preserve that invariant.
- Regenerated JSON schema artifacts (`GameDef`, `Trace`, `EvalReport`) and validated with build + unit + lint.

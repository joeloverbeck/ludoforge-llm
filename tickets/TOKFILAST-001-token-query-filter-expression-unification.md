# TOKFILAST-001: Unify Token Query Filters As Expression AST

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `kernel/types-ast`, query evaluation, schema validation, compiler condition/filter lowering
**Deps**: specs/29-fitl-event-card-encoding.md, specs/00-implementation-roadmap.md

## Problem

Token query filters in GameSpecDoc currently rely on conjunction-only predicate arrays (`filter: [{ prop, ... }, ...]`). This blocks direct expression of disjunction/negation at token level, forces verbose `concat` workarounds, and duplicates filtering semantics between zone filters (ConditionAST) and token filters (custom mini-language).

## Assumption Reassessment (2026-03-05)

1. `tokensInMapSpaces` accepts `spaceFilter` as `ConditionAST` but `filter` only as `TokenFilterPredicate[]`, creating an expressiveness mismatch.
2. Runtime evaluation also enforces conjunction-only token predicates (`filterTokensByPredicates(...every...)`).
3. Current FITL data already uses verbose `concat` patterns to emulate `or`, confirming the DSL gap is material and not hypothetical.

## Architecture Check

1. A single expression model for filtering (ConditionAST-style boolean composition) is cleaner than maintaining parallel ad-hoc predicate syntaxes.
2. This keeps game-specific logic in GameSpecDoc while GameDef/runtime stay game-agnostic: no FITL branches are added.
3. No backwards-compatibility aliases/shims in final state: canonical token filtering surface becomes one expression form.

## What to Change

### 1. Replace token-filter predicate arrays with token filter expressions

Introduce a canonical token filter expression AST (boolean composition + leaf predicate) and wire it into all token-domain query surfaces (`tokensInZone`, `tokensInAdjacentZones`, `tokensInMapSpaces`) and effect filter surfaces that consume token predicates.

### 2. Evaluate token filter expressions with bound token context

At runtime, evaluate token filter expressions by binding each candidate token and executing condition evaluation generically, instead of bespoke per-predicate conjunction logic.

### 3. Remove legacy predicate-array-only contract from AST/schema

Update TypeScript types + Zod schema + JSON schema artifacts to remove the old array-only token-filter contract.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (delete or simplify)
- `packages/engine/schemas/GameDef.schema.json` (modify; regenerated)
- `packages/engine/test/unit/schemas-ast.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify)

## Out of Scope

- FITL data migration itself (handled in follow-up migration ticket).
- New game-specific helper macros for Phoenix or any specific event.

## Acceptance Criteria

### Tests That Must Pass

1. Token query filters support boolean `or`/`and`/`not` composition in unit tests.
2. Existing token filter semantics (`eq/neq/in/notIn`) remain expressible and validated via the new expression form.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. GameDef/runtime remain game-agnostic; no FITL-specific branches or enums are introduced.
2. A single canonical token-filter contract exists in AST/schema (no dual legacy syntax in final state).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — token filter expression schema coverage.
2. `packages/engine/test/unit/eval-query.test.ts` — runtime filter-expression evaluation, including disjunction.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — validator diagnostics for malformed token filter expressions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`

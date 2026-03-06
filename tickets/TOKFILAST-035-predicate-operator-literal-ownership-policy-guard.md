# TOKFILAST-035: Enforce Predicate-Operator Literal Ownership Policy Across Kernel + CNL

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guardrail coverage
**Deps**: tickets/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md

## Problem

Even after centralizing predicate-op contracts, there is no explicit policy test preventing future reintroduction of duplicate inline predicate-operator literal ownership in kernel/CNL modules.

## Assumption Reassessment (2026-03-06)

1. Canonical predicate-op ownership now exists in `packages/engine/src/kernel/predicate-op-contract.ts`.
2. Current tests cover behavior/parity, but there is no dedicated ownership-lint test that fails on duplicated operator tuple declarations in implementation modules.
3. Existing active TOKFILAST tickets (`027`-`034`) do not define a global guardrail for duplicate predicate-op literal ownership.

## Architecture Check

1. A policy test that enforces canonical ownership is cleaner and more robust than relying on reviewer memory.
2. This preserves engine agnosticism by guarding shared contract structure only; it does not introduce game-specific behavior.
3. No aliases/shims are introduced; this ticket only hardens contract governance.

## What to Change

### 1. Add predicate-op ownership lint policy test

Add a unit lint/policy test that scans kernel/CNL source files and fails if predicate-op tuples are re-declared outside canonical contract modules.

### 2. Enforce canonical import source and no aliasing for predicate-op symbols

Assert imports of `PredicateOp`, `PREDICATE_OPERATORS`, and `isPredicateOp` come from canonical contract module paths and not local re-declarations/re-export aliases.

## Files to Touch

- `packages/engine/test/unit/lint/predicate-op-contract-ownership-policy.test.ts` (new)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify, if helper utilities are needed)

## Out of Scope

- Runtime predicate semantics changes.
- CNL diagnostic taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Policy fails when predicate-op literal tuples are duplicated outside canonical ownership modules.
2. Policy fails when canonical predicate-op symbols are imported via non-canonical module paths.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Predicate-op contract ownership remains centralized and explicit.
2. Game-agnostic kernel/CNL architecture remains free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/predicate-op-contract-ownership-policy.test.ts` — enforce canonical ownership/import boundaries for predicate-op contract symbols.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

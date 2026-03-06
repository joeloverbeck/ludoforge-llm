# TOKFILAST-017: Harden Empty-Args ConditionAST Coverage Across Condition-Bearing Surfaces

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validation/runtime test coverage hardening
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md

## Problem

`ConditionAST` empty-args rejection is implemented, but current test coverage primarily targets action preconditions. Other condition-bearing surfaces are not comprehensively asserted, increasing risk of undetected regressions in diagnostics and path fidelity.

## Assumption Reassessment (2026-03-06)

1. Schema/runtime/validator now reject zero-arity `ConditionAST` booleans.
2. Current validator test coverage added one explicit case on `actions[].pre`.
3. Mismatch: additional major condition-bearing surfaces (for example triggers, terminal conditions, query condition filters, `connected.via`) are not explicitly covered for empty-args rejection and path determinism.

## Architecture Check

1. Table-driven cross-surface tests provide stronger architecture-contract guarantees than isolated one-surface assertions.
2. This is game-agnostic validation/runtime hardening with no game-specific branching.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Add cross-surface validator diagnostics tests for empty `ConditionAST` args

Cover representative condition-bearing surfaces and assert deterministic `code + path` diagnostics.

### 2. Add runtime sanity checks for direct condition-evaluation entry points

Where malformed nodes can be forced through direct calls in tests, assert deterministic fail-closed behavior.

### 3. Ensure path fidelity for nested condition booleans

Add nested malformed cases to lock `.arg` / `.args[n]` path shaping consistency.

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/unit/eval-condition.test.ts` (modify, if additional nested malformed assertions needed)
- `packages/engine/test/unit/eval-query.test.ts` (modify, if condition-bearing query paths are directly asserted)

## Out of Scope

- Token-filter surface hardening (`TOKFILAST-011`).
- Unsupported token-filter operator validator hardening (`TOKFILAST-012`).

## Acceptance Criteria

### Tests That Must Pass

1. Empty-args `ConditionAST` diagnostics are asserted on multiple condition-bearing surfaces.
2. Nested malformed condition path diagnostics are deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition boolean arity enforcement is consistently covered across condition-bearing surfaces.
2. Validation/runtime behavior remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add table-driven empty-args condition cases across surfaces.
2. `packages/engine/test/unit/eval-condition.test.ts` — add nested malformed runtime-path assertions (casted malformed nodes) if needed.
3. `packages/engine/test/unit/eval-query.test.ts` — add direct condition-bearing query-path malformed assertions where relevant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

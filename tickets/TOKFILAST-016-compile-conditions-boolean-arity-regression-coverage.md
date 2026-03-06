# TOKFILAST-016: Add Compile-Boundary Regression Coverage for Boolean Arity Invariants

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL compile tests coverage hardening
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md

## Problem

Boolean arity hardening now applies in CNL lowering paths, but focused compile-boundary tests for these invariants are sparse. Without direct compile tests, regressions can bypass intended diagnostics and only be caught indirectly at runtime.

## Assumption Reassessment (2026-03-06)

1. `lowerConditionNode` now rejects empty `and/or` arrays at lowering time.
2. Token-filter lowering/normalization enforces non-empty boolean args via non-empty tuple construction.
3. Mismatch: `compile-conditions.test.ts` does not yet provide targeted regression cases specifically for these arity contracts.

## Architecture Check

1. Compile-boundary contract tests are cleaner than relying on downstream runtime tests for compiler invariants.
2. This is test-only hardening around agnostic compiler behavior; no game-specific rules are introduced.
3. No compatibility aliases/shims are introduced.

## What to Change

### 1. Add targeted lowering tests for `ConditionAST` boolean arity

Assert compiler diagnostics for empty `and/or` condition payloads.

### 2. Add targeted lowering tests for token-filter boolean arity

Assert compiler diagnostics for empty `and/or` token-filter payloads across query/effect lowering paths.

### 3. Lock canonicalization/normalization invariant behavior

Add assertions that valid single/multi-arg boolean filters normalize without violating non-empty contracts.

## Files to Touch

- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Runtime evaluator behavior changes.
- Validator surface coverage broadening (tracked separately).

## Acceptance Criteria

### Tests That Must Pass

1. Compile/lowering tests explicitly fail on empty condition/token-filter boolean args.
2. Compile/lowering tests explicitly pass on valid non-empty boolean args and normalization cases.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Compile-boundary diagnostics for boolean arity are deterministic.
2. Compiler behavior remains game-agnostic and data-driven.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add dedicated empty-args rejection + valid normalization regression cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

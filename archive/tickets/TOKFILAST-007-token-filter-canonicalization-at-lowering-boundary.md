# TOKFILAST-007: Canonicalize Trivial TokenFilterExpr Boolean Wrappers at Lowering Boundary

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering normalization for token filter expressions
**Deps**: archive/tickets/TOKFILAST-003-token-filter-boolean-arity-guards.md, archive/tickets/TOKFILAST/TOKFILAST-004-token-filter-expression-traversal-unification.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

After no-shim migration, GameSpecDoc authors often encode single-clause filters as `{ op: and, args: [predicate] }`. This is valid but noisy and causes unnecessary AST nesting, making authored data and compiled snapshots harder to read.

## Assumption Reassessment (2026-03-06)

1. Token filter lowering now accepts canonical `TokenFilterExpr` and rejects legacy arrays.
2. Single-argument boolean wrappers are common in authored data/tests (for example many `filter: { op: and, args: [ ... ] }` forms under `data/games/*` and unit/integration fixtures), so compiler output currently preserves avoidable wrapper noise.
3. Related active work exists: `tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md` changes boolean arity policy. This ticket remains scoped to canonicalization of valid token-filter expression shape and must not change arity acceptance/rejection policy.

## Architecture Check

1. Compiler-side canonicalization yields cleaner, smaller ASTs and simpler downstream diffs while preserving semantics.
2. This is a generic CNL lowering normalization and does not introduce game-specific behavior into GameDef/runtime.
3. No compatibility aliases/shims are introduced; accepted syntax remains canonical expression-only, and boolean arity policy remains governed by existing tickets/contracts.

## What to Change

### 1. Add token-filter AST normalization pass in CNL lowering

Normalize token-filter expressions after lowering:
- collapse `{ op: and, args: [x] }` to `x`
- collapse nested same-op trees where safe (for example `and` inside `and`, `or` inside `or`)
- preserve `not` semantics and ordering guarantees
- do not alter zero-arity validation policy (handled by arity-policy tickets)

### 2. Apply normalization consistently on all token-filter surfaces

Ensure query/effect surfaces that call token-filter lowerers emit normalized AST.

### 3. Strengthen tests for normalized shape parity

Add shape assertions proving equivalent inputs lower to identical normalized output.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify, if needed)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if needed)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify, if needed)

## Out of Scope

- Reintroducing legacy array filter syntax.
- Runtime/evaluator semantic changes for token filters.
- Changing boolean arity policy (`and/or` empty args acceptance or rejection behavior).

## Acceptance Criteria

### Tests That Must Pass

1. Single-arg boolean wrappers normalize to direct predicate nodes in lowered AST.
2. Nested same-op token filter trees flatten deterministically where semantics are unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Filter semantics are preserved exactly under normalization.
2. GameDef/runtime remains game-agnostic with no game-specific branches.
3. Existing boolean arity policy behavior is unchanged by this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — canonicalization shape assertions.
2. `packages/engine/test/unit/compile-effects.test.ts` — reveal/conceal canonicalization assertions (if applicable).
3. `packages/engine/test/integration/compile-pipeline.test.ts` — optional integration shape sanity check.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Added compiler-boundary token-filter AST normalization in `packages/engine/src/cnl/compile-conditions.ts`:
    - collapses single-arg `and/or` wrappers to the child expression
    - flattens nested same-op `and/or` trees while preserving order
    - preserves `not` semantics and recursively normalizes inside `not.arg`
  - Added/updated canonicalization tests in:
    - `packages/engine/test/unit/compile-conditions.test.ts`
    - `packages/engine/test/unit/compile-effects.test.ts`
  - Updated affected integration expectations to canonical lowered shape in:
    - `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`
    - `packages/engine/test/integration/fitl-events-1965-nva.test.ts`
    - `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`
    - `packages/engine/test/integration/fitl-events-tutorial-simple.test.ts`
    - `packages/engine/test/integration/fitl-pivotal-single-use.test.ts`
- Deviations from original plan:
  - `compile-effects.ts` did not need code changes because all relevant surfaces already route through `lowerTokenFilterExpr`.
  - Integration test files outside the initial “Files to Touch” list required expectation updates because canonicalized lowering changed compiled AST snapshots used by those tests.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `pnpm -F @ludoforge/engine test:unit` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed

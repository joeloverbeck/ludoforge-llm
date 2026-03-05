# TOKFILAST-005: Add Focused Unit Coverage for Victory Lowering

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler test coverage only
**Deps**: archive/tickets/TOKFILAST-001-token-query-filter-expression-unification.md

## Problem

`lowerVictory` now performs non-trivial lowering of terminal checkpoint `when` and margin `value` expressions, but current regression safety is mostly integration-level. This slows feedback and increases the risk of subtle compiler regressions slipping through until large FITL suites run.

## Assumption Reassessment (2026-03-05)

1. `lowerVictory` now lowers checkpoint conditions and margin values via condition/value lowering context (`packages/engine/src/cnl/compile-victory.ts`).
2. Compiler integration tests cover terminal behavior, but there is no narrow unit test that directly validates this lowering pathway in isolation.
3. Existing `compile-top-level` and FITL integration tests assert broad outcomes, but not targeted diagnostics/shape guarantees for malformed checkpoint/margin internals.

## Architecture Check

1. Focused unit coverage strengthens compiler-layer contracts and reduces reliance on expensive integration runs.
2. This is compiler-test-only and keeps GameDef/runtime architecture agnostic.
3. No compatibility aliases/shims are added; tests codify the canonical current behavior.

## What to Change

### 1. Add direct unit coverage for lowered victory checkpoints

Add tests that verify `terminal.checkpoints[].when` is lowered to canonical AST shape and that invalid nested expressions produce deterministic diagnostics.

### 2. Add direct unit coverage for lowered victory margins

Add tests that verify `terminal.margins[].value` lowering handles valid value expressions and reports deterministic diagnostics for invalid forms.

### 3. Guard compiler wiring

Add assertions that `compiler-core` threads complete lowering context into `lowerVictory` (ownership/type/token-filter/named-set context) to prevent future accidental regression.

## Files to Touch

- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify, if helper assertions needed)
- `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` (modify only if a specific non-duplicative contract assertion is necessary)

## Out of Scope

- Any terminal/victory rules redesign.
- Any GameSpecDoc data migration work.

## Acceptance Criteria

### Tests That Must Pass

1. Unit tests explicitly assert lowered checkpoint/margin shapes and diagnostics.
2. Tests fail if `lowerVictory` reverts to raw passthrough for checkpoint `when` or margin `value`.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Terminal victory lowering remains deterministic and context-aware at compiler layer.
2. Coverage remains generic and game-agnostic (no FITL-specific kernel behavior).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — explicit assertions for lowered terminal checkpoint/margin internals.
2. `packages/engine/test/unit/compile-conditions.test.ts` — helper/shape assertions for nested query filters used in terminal conditions (if needed).
3. `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` — optional non-duplicative regression anchor for production terminal wiring.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration`

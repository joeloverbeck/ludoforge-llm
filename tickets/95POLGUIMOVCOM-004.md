# 95POLGUIMOVCOM-004: Extend `zoneTokenAgg.zone` to accept dynamic expression

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel types-core, agents policy-expr, agents policy-eval (or runtime evaluator)
**Deps**: tickets/95POLGUIMOVCOM-002.md

## Problem

`zoneTokenAgg.zone` currently accepts only a static `string` zone ID. Completion guidance needs to score "the zone being chosen" — which is only known at scoring time as `{ ref: option.value }`. Without dynamic zone support, `completionScoreTerms` cannot express "count tokens in the chosen zone" or "check population of the target zone."

## Assumption Reassessment (2026-03-30)

1. `AgentPolicyExpr` in `types-core.ts` defines `zoneTokenAgg` as `{ kind: 'zoneTokenAgg'; zone: string; owner: string; prop: string; aggOp: AgentPolicyZoneTokenAggOp }`. Zone is a plain `string`. Confirmed.
2. In `policy-expr.ts`, the compile-time analyzer for `zoneTokenAgg` expects `zone` to be a static string. Confirmed.
3. In `policy-eval.ts` (or wherever `zoneTokenAgg` is evaluated at runtime), `zone` is used directly as a zone ID for lookups. Confirmed.
4. The `owner` and `prop` fields remain static strings — no dynamic extension needed for v1. Confirmed by spec.

## Architecture Check

1. Cleanest approach: widen `zone` to `string | AgentPolicyExpr`. At evaluation time, check if `zone` is an object (expression) — if so, evaluate it to produce a string zone ID. If it's already a string, use directly (no behavior change).
2. Engine agnosticism: the expression evaluator is generic. `{ ref: option.value }` resolves to whatever the current option's value is — could be a zone ID in any game.
3. No backwards-compatibility shims: existing `zoneTokenAgg` usage with string `zone` continues to work unchanged.

## What to Change

### 1. `types-core.ts` — widen `zone` field type

```typescript
// Before:
{ kind: 'zoneTokenAgg'; zone: string; ... }

// After:
{ kind: 'zoneTokenAgg'; zone: string | AgentPolicyExpr; ... }
```

### 2. `policy-expr.ts` — compile `zoneTokenAgg.zone` as string or expression

When compiling a `zoneTokenAgg` node:
- If `zone` is a string → produce `{ zone: string }` as before
- If `zone` is an object → compile it as a nested `AgentPolicyExpr` and embed the compiled expression

### 3. Runtime evaluator — evaluate dynamic zone at scoring time

In the function that evaluates `zoneTokenAgg` (in `policy-eval.ts` or the expression evaluator):
- If `zone` is a string → use directly as zone ID (current behavior)
- If `zone` is an object (expression) → evaluate it using the active runtime providers. If the result is not a string, return `undefined` (unknown). If the result is a string but not a valid zone ID, return `undefined`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — widen `zone` type)
- `packages/engine/src/agents/policy-expr.ts` (modify — compile dynamic zone)
- `packages/engine/src/agents/policy-eval.ts` (modify — evaluate dynamic zone)

## Out of Scope

- Widening `owner` or `prop` fields to accept expressions (not needed for v1)
- New aggregation operations beyond existing `sum`/`count`/`min`/`max`
- Validation of zone ID existence at compile time (zone IDs are runtime-dependent)
- Other expression types receiving dynamic arguments

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `zoneTokenAgg` with static string `zone` evaluates identically to current behavior
2. New unit test: `zoneTokenAgg` with `{ ref: option.value }` as `zone` evaluates using the option's value as zone ID
3. New unit test: `zoneTokenAgg` with expression `zone` that evaluates to non-string returns `undefined`
4. New unit test: `zoneTokenAgg` with expression `zone` that evaluates to invalid zone ID returns `undefined` (not error)
5. New compile-time test: `analyzePolicyExpr` handles `zoneTokenAgg` with expression zone
6. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. All existing `zoneTokenAgg` usage with string `zone` produces identical compiled output and runtime behavior.
2. Expression evaluation for `zone` uses the same evaluator as all other expression nodes — no special-casing.
3. Foundation #6 (Bounded Computation): expression evaluation for `zone` is a single expression eval — bounded.
4. Foundation #1 (Engine Agnosticism): no game-specific zone IDs in the evaluator logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr-zone-agg-dynamic.test.ts` — compile-time tests for dynamic zone
2. `packages/engine/test/unit/agents/policy-eval-zone-agg-dynamic.test.ts` — runtime evaluation tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "zoneTokenAgg"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck` (full suite)

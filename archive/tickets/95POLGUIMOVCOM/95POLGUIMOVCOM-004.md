# 95POLGUIMOVCOM-004: Extend `zoneTokenAgg.zone` to accept dynamic expression

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel types-core, agents policy-expr, agents policy-eval (or runtime evaluator)
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

`zoneTokenAgg.zone` currently accepts only a static `string` zone ID. Completion guidance needs to score "the zone being chosen" — which is only known at scoring time as `{ ref: option.value }`. Without dynamic zone support, `completionScoreTerms` cannot express "count tokens in the chosen zone" or "check population of the target zone."

## Assumption Reassessment (2026-03-30)

1. `AgentPolicyExpr` in `packages/engine/src/kernel/types-core.ts` defines `zoneTokenAgg` as `{ kind: 'zoneTokenAgg'; zone: string; owner: string; prop: string; aggOp: AgentPolicyZoneTokenAggOp }`. `zone` is currently a plain string. Confirmed.
2. `packages/engine/src/agents/policy-expr.ts` currently rejects any non-string `zoneTokenAgg.zone` and returns a compiled node with `zone` as a string literal only. Confirmed.
3. `packages/engine/src/agents/policy-eval.ts` currently evaluates `zoneTokenAgg` by interpolating `expr.zone` into the runtime zone lookup key `${expr.zone}:${ownerSuffix}`. That means dynamic zone support must preserve the existing owner-suffixed lookup model instead of assuming raw `state.zones` keys are directly authored. Confirmed.
4. `packages/engine/src/kernel/schemas-core.ts` also hard-codes compiled `zoneTokenAgg.zone` as a string. The original ticket omitted this, but the schema must change in lockstep with the compiled type or the architecture remains inconsistent.
5. The repo already has canonical policy expression/evaluation unit tests in `packages/engine/test/unit/agents/policy-expr.test.ts` and `packages/engine/test/unit/agents/policy-eval.test.ts`. New coverage should extend those files unless there is a strong reason to split them.
6. `owner` and `prop` remain static strings for this slice. Widening them now would increase surface area without a demonstrated need.

## Architecture Check

1. Cleanest approach: widen compiled `zoneTokenAgg.zone` to `string | AgentPolicyExpr`, and treat the dynamic branch as a normal nested policy expression. This is materially better than adding a dedicated `dynamicZoneRef` helper because it keeps the expression language orthogonal and extensible.
2. `policy-expr.ts` must analyze the nested zone expression with the normal analyzer, enforce that it resolves to an `id`-compatible value, and merge its dependencies/cost class into the aggregate expression. A one-off parser branch that skips analysis would be weaker architecture.
3. `policy-eval.ts` should evaluate the zone expression through the existing evaluator, then validate the result as a string before constructing the runtime zone lookup key. Non-string results and unknown values should return `undefined`, not throw.
4. Engine agnosticism holds: `{ ref: option.value }` is generic policy data, not FITL-specific logic.
5. No aliasing or compatibility shims: the canonical `zoneTokenAgg` node changes once, and all compiler/runtime/schema consumers are updated together.

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
- Require the nested expression to resolve to an `id`-compatible value type
- Merge nested expression dependencies/cost class into the enclosing `zoneTokenAgg` analysis

### 3. Runtime evaluator — evaluate dynamic zone at scoring time

In the function that evaluates `zoneTokenAgg` (in `policy-eval.ts` or the expression evaluator):
- If `zone` is a string → use directly as zone ID (current behavior)
- If `zone` is an object (expression) → evaluate it using the active runtime providers. If the result is not a string, return `undefined` (unknown).
- Preserve the existing runtime lookup model by constructing the final key as `${resolvedZone}:${ownerSuffix}` after the zone expression resolves.

### 4. `schemas-core.ts` — keep compiled schema aligned with the type surface

- Update the compiled `AgentPolicyExprSchema` branch for `zoneTokenAgg` so `zone` accepts either a string or a nested `AgentPolicyExpr`
- Do not leave `types-core.ts` and `schemas-core.ts` out of sync

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — widen `zone` type)
- `packages/engine/src/agents/policy-expr.ts` (modify — compile dynamic zone)
- `packages/engine/src/agents/policy-eval.ts` (modify — evaluate dynamic zone)
- `packages/engine/src/kernel/schemas-core.ts` (modify — align compiled schema)

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
4. New compile-time test: `analyzePolicyExpr` handles `zoneTokenAgg` with expression `zone`, preserving merged dependencies/cost class
5. Updated schema/type validation coverage proves compiled `zoneTokenAgg` still validates once `zone` is an embedded expression
6. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. All existing `zoneTokenAgg` usage with string `zone` produces identical compiled output and runtime behavior.
2. Expression evaluation for `zone` uses the same analyzer/evaluator pipeline as all other expression nodes — no parallel mini-language.
3. Foundation #6 (Bounded Computation): expression evaluation for `zone` is a single expression eval — bounded.
4. Foundation #1 (Engine Agnosticism): no game-specific zone IDs in the evaluator logic.
5. `types-core.ts` and `schemas-core.ts` remain synchronized for the `zoneTokenAgg` surface.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — extend analyzer coverage for dynamic `zoneTokenAgg.zone`
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — extend runtime evaluation coverage for dynamic `zoneTokenAgg.zone`
3. Add or extend schema-focused coverage only if needed to prove the compiled schema accepts the widened recursive shape

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completed: 2026-03-30
- What actually changed:
  - Widened compiled `zoneTokenAgg.zone` from `string` to `string | AgentPolicyExpr` in the canonical policy expression type surface.
  - Extended `policy-expr.ts` so `zoneTokenAgg.zone` can be analyzed as a normal nested expression, with id-type validation plus merged cost-class and dependency metadata.
  - Extended `policy-eval.ts` so dynamic zone expressions are evaluated through the existing expression runtime before resolving the owner-suffixed zone lookup key.
  - Updated the compiled policy schema and regenerated schema artifacts so `GameDef.schema.json` reflects the widened recursive expression shape.
  - Added regression and edge-case coverage in the existing policy expression and policy evaluation unit suites.
- Deviations from original plan:
  - `packages/engine/src/kernel/schemas-core.ts` and regenerated schema artifacts also had to change; the original ticket underestimated the schema surface affected by the compiled type change.
  - Runtime coverage proves dynamic-zone evaluation through existing runtime refs today; completion-specific `option.value` resolution is covered at analyzer level here and remains part of the broader completion-guidance runtime work.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`

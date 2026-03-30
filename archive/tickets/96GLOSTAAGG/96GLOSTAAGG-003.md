# 96GLOSTAAGG-003: Implement `globalTokenAgg` expression compilation and evaluation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (compilation + evaluation)
**Deps**: 96GLOSTAAGG-001, 96GLOSTAAGG-002, `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`

## Problem

The current engine exposes `globalTokenAgg` in the compiled agent-policy AST/schema layer, but the compiler analysis and runtime evaluator do not actually implement it yet. This creates an architectural mismatch: the schema accepts compiled catalogs containing `globalTokenAgg`, while YAML policy expressions still cannot compile into that node and runtime evaluation throws for the expression kind.

The existing `zoneTokenAgg` only operates on a single named zone. `globalTokenAgg` must be compilable from YAML and evaluable at runtime to count/sum/min/max tokens matching a filter across all (or filtered) zones in scope.

## Assumption Reassessment (2026-03-30)

1. `analyzePolicyExpr` in `policy-expr.ts` dispatches on a `KnownOperator` set and a switch statement — new expression kinds must be added to both.
2. The existing `analyzeZoneTokenAggOperator` pattern (validate fields, resolve zone source, return typed `AgentPolicyExpr` node) serves as the template for the new analyzer.
3. `PolicyEvaluationContext.evaluateExpr` dispatches on `expr.kind` — new cases must be added.
4. The helpers from 96GLOSTAAGG-002 (`matchesTokenFilter`, `matchesZoneFilter`, `matchesZoneScope`, `resolveTokenFilter`) are available.
5. `GameDef.zones` is the array of `ZoneDef` used for iteration — confirmed in `types-core.ts`.
6. `state.zones[zoneId]` returns the token array for a zone — confirmed in kernel types.
7. `globalTokenAgg` is already part of the compiled `AgentPolicyExpr` union and `GameDefSchema`; this ticket must not re-add or rename those contracts unless implementation forces a coordinated cleanup.
8. Current aggregate semantics are not "always numeric zero on empty": `count` and `sum` collapse empty input to `0`, while `min` and `max` collapse empty input to `undefined`. `globalTokenAgg` should align with the existing aggregate architecture unless a broader cross-cutting refactor is explicitly approved.

## Architecture Check

1. `globalTokenAgg` fits the current architecture better than inventing new aliases or fallback paths because the AST/schema/contracts already anticipate it. The cleanest implementation is to complete that existing architecture rather than introduce a separate helper or compatibility layer.
2. The expression is a pure read-only aggregation over finite collections (Foundation #5 determinism, #6 bounded computation, #7 immutability).
3. Cost class is `'state'` — evaluated once per policy evaluation, cached. No candidate-level dependency.
4. No game-specific logic: token filter uses generic `type`/`props`, zone filter uses generic `category`/`attribute`/`variable`. Foundation #1 preserved.
5. The implementation should stay surgical. This ticket is not the place to redesign `zoneTokenAgg`, merge all aggregate evaluators into a generic framework, or widen semantics beyond the already-declared compiled contract. If later tickets reveal enough duplication to justify a shared aggregate primitive, that should be a separate architectural pass.

## What to Change

### 1. Add `analyzeGlobalTokenAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
globalTokenAgg:
  tokenFilter: { type: "base", props: { seat: { eq: self } } }
  aggOp: count
  prop: strength         # required for sum/min/max, ignored for count
  zoneFilter: { category: province }
  zoneScope: board       # optional, defaults to 'board'
```

Validation:
- `aggOp` must be one of `count | sum | min | max`.
- `prop` is required when `aggOp` is `sum | min | max`; optional for `count`.
- `tokenFilter` is optional (undefined = match all tokens).
- `zoneFilter` is optional (undefined = all zones in scope).
- `zoneScope` is optional (defaults to `'board'`).
- `tokenFilter.props` values must have `{ eq: <literal> }` shape.

Returns `PolicyExprAnalysis` with `valueType: 'number'`, `costClass: 'state'`, and empty dependencies.

### 2. Wire into `analyzePolicyExpr` dispatcher

Add `'globalTokenAgg'` to the `KnownOperator` set and the switch statement.

### 3. Add `evaluateGlobalTokenAggregate` to `policy-evaluation-core.ts`

Iterates `this.input.def.zones`, applies zone scope + zone filter, then iterates tokens in matching zones, applies token filter, and accumulates via aggOp.

Returns:
- `0` for empty `count` / `sum`
- `undefined` for empty `min` / `max`
- `undefined` when `expr.prop` is absent for `sum` / `min` / `max` despite compile-time validation

This keeps runtime behavior aligned with existing aggregate/evaluator semantics instead of introducing a one-off empty-extrema convention.

### 4. Wire into `evaluateExpr` dispatcher

Add `case 'globalTokenAgg'` to the switch in `PolicyEvaluationContext.evaluateExpr`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator, wire into dispatcher
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalZoneAgg` expression (ticket 96GLOSTAAGG-004).
- `adjacentTokenAgg` expression (ticket 96GLOSTAAGG-005).
- Integration tests with FITL data (ticket 96GLOSTAAGG-006).
- Golden file updates (ticket 96GLOSTAAGG-006).
- Refactoring existing `zoneTokenAgg` to use new helpers.
- Reworking compiled schema/types for `globalTokenAgg` unless implementation exposes a concrete defect in the already-landed contracts.
- Unifying all zone/token aggregate evaluators behind a new generic abstraction.
- Any runner package changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `globalTokenAgg` YAML compiles to correct `AgentPolicyExpr` node with all fields.
2. Compilation: missing `aggOp` produces diagnostic error.
3. Compilation: `aggOp: sum` without `prop` produces diagnostic error.
4. Compilation: `aggOp: count` without `prop` compiles successfully.
5. Compilation: invalid `tokenFilter.props` shape produces diagnostic error.
6. Compilation: `zoneScope` defaults to `'board'` when omitted.
7. Evaluation: count tokens matching type filter across 3 zones returns correct count.
8. Evaluation: sum token prop values across zones with zone filter returns correct sum.
9. Evaluation: min/max token prop across zones returns correct extrema.
10. Evaluation: empty `count` / `sum` returns `0`, while empty `min` / `max` returns `undefined`.
11. Evaluation: `zoneScope: 'board'` excludes aux zones; `zoneScope: 'all'` includes them.
12. Evaluation: `'self'` in token filter props resolves to evaluating player's ID.
13. Existing suite: relevant engine tests plus repo-required broad validation pass cleanly.

### Invariants

1. Aggregation is a pure function of game state — deterministic (Foundation #5).
2. Iteration is bounded by `def.zones.length * maxTokensPerZone` (Foundation #6).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. Existing expression kinds (`literal`, `param`, `ref`, `op`, `zoneProp`, `zoneTokenAgg`) are unmodified.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — `describe('globalTokenAgg compilation')`:
   - Valid count expression, valid sum expression, missing aggOp, missing prop for sum, invalid tokenFilter, default zoneScope, explicit zoneScope
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — `describe('globalTokenAgg evaluation')`:
   - Count across 3 board zones with type filter, sum with prop and zone filter, min/max, empty-state semantics split by op family, zone scope board vs all, self resolution in token filter

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test --test-name-pattern "globalTokenAgg" packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Corrected the ticket assumptions first to reflect the real codebase state: `globalTokenAgg` already existed in compiled AST/schema contracts, but compiler analysis and runtime evaluation were still missing.
  - Implemented `globalTokenAgg` compilation in `packages/engine/src/agents/policy-expr.ts`, including validation for `aggOp`, `prop`, `tokenFilter`, `zoneFilter`, and default `zoneScope`.
  - Implemented `globalTokenAgg` runtime evaluation in `packages/engine/src/agents/policy-evaluation-core.ts` using the existing generic token/zone filter helpers.
  - Added unit coverage for compilation and runtime evaluation semantics, including self-resolution, zone scoping, zone filtering, extrema, and empty-result behavior.
  - Repaired one unrelated runner test race in `packages/runner/test/map-editor/MapEditorScreen.test.tsx` so the repo-wide `pnpm turbo test` requirement could pass cleanly.
- Deviations from original plan:
  - Empty-result semantics were aligned with the existing aggregate architecture instead of the ticket's original blanket "returns 0" wording: `count`/`sum` return `0`, while empty `min`/`max` return `undefined`.
  - No schema/type contract work was needed because those contracts were already present and correct.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test --test-name-pattern "globalTokenAgg" packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`

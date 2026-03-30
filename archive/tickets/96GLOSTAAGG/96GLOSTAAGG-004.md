# 96GLOSTAAGG-004: Implement `globalZoneAgg` expression compilation and evaluation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (compilation + evaluation)
**Deps**: [96GLOSTAAGG-001](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/96GLOSTAAGG/96GLOSTAAGG-001.md), [96GLOSTAAGG-002](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/96GLOSTAAGG/96GLOSTAAGG-002.md), `packages/engine/src/agents/policy-expr.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`

## Problem

`globalZoneAgg` already exists in the compiled agent-policy contract layer (`types-core.ts`, `schemas-core.ts`, schema artifacts), but YAML policy expressions still cannot compile into that node and runtime evaluation still throws for it. That is the real gap.

The current engine therefore already advertises a zone-level global aggregation architecture, but only `globalTokenAgg` is actually wired through compiler analysis and runtime evaluation. `globalZoneAgg` must complete that existing architecture so PolicyAgent features can aggregate runtime zone variables (for example support/opposition) and static zone attributes (for example population) across filtered board space.

## Assumption Reassessment (2026-03-30)

1. `globalZoneAgg` is already part of the compiled `AgentPolicyExpr` union and runtime schema surface. This ticket must not duplicate or redesign those contracts unless implementation exposes a concrete contract defect.
2. `analyzePolicyExpr` in `packages/engine/src/agents/policy-expr.ts` currently supports `globalTokenAgg` but not `globalZoneAgg`. The dispatcher must be widened in both the `KnownOperator` set and switch.
3. `PolicyEvaluationContext.evaluateExpr` in `packages/engine/src/agents/policy-evaluation-core.ts` already has a fail-fast branch for `globalZoneAgg`; runtime support is the missing piece.
4. Shared helpers from 96GLOSTAAGG-002 already exist: `matchesZoneFilter` and `matchesZoneScope`. This ticket should reuse them rather than reimplement filter semantics.
5. `AttributeValue` is `string | number | boolean | readonly string[]`, not just scalar primitives. `globalZoneAgg` must therefore ignore non-scalar / non-numeric attribute values for numeric aggregation instead of pretending every attribute is numeric.
6. Spec 96 defines `source: 'variable'` as the YAML default. The compiled node should still store an explicit `source`, but the analyzer should default omitted YAML `source` to `'variable'` instead of raising a missing-source diagnostic.
7. Existing aggregate semantics in this subsystem are not "always zero on empty input": `count` and `sum` collapse empty input to `0`, while empty `min` and `max` yield `undefined`. `globalZoneAgg` should align with that current architecture unless a broader aggregate-semantics refactor is explicitly approved.
8. When `aggOp` is `count`, the result is the number of matching zones. `field` remains required in the compiled shape for structural consistency, but runtime counting must ignore its value.

## Architecture Check

1. Implementing `globalZoneAgg` is more beneficial than the current architecture because the current architecture is incomplete: the compiled AST/schema already promises this expression kind, but the compiler and runtime do not honor that promise yet.
2. The beneficial change is to complete the existing generic aggregation architecture, not to introduce aliases, fallback paths, or a parallel expression shape. That keeps the surface coherent and avoids violating Foundation #9.
3. A small cleanup is justified while implementing this: the current analyzer helpers in `policy-expr.ts` are named as if they belong only to `globalTokenAgg`, but the zone-filter and zone-scope parsing they perform are actually shared aggregation concerns. Reusing or lightly generalizing those helpers is architecturally cleaner than duplicating them for `globalZoneAgg`.
4. A larger abstraction that unifies every aggregate evaluator behind a new generic framework is not justified in this ticket. `globalTokenAgg` and `globalZoneAgg` are close enough to share small utilities, but not so duplicated yet that a broad rewrite is warranted.
5. The feature remains generic and engine-agnostic: `source`, `field`, `zoneFilter`, and `zoneScope` are all data-driven, with no game-specific logic.

## What to Change

### 1. Add `analyzeGlobalZoneAggOperator` to `policy-expr.ts`

YAML input shape:
```yaml
globalZoneAgg:
  source: variable        # optional; defaults to 'variable'
  field: opposition
  aggOp: sum              # count | sum | min | max
  zoneFilter: { category: province }
  zoneScope: board        # optional, defaults to 'board'
```

Validation:
- `source`, when provided, must be `'variable'` or `'attribute'`; omitted source defaults to `'variable'`.
- `field` must be a non-empty string.
- `aggOp` must be one of `count | sum | min | max`.
- `field` is ignored when `aggOp` is `count`, but it is still required by the compiled node shape.
- `zoneFilter` is optional.
- `zoneScope` is optional and defaults to `'board'`.

Returns `PolicyExprAnalysis` with `valueType: 'number'`, `costClass: 'state'`, and empty dependencies.

### 2. Wire into `analyzePolicyExpr` dispatcher

Add `'globalZoneAgg'` to the known-operator set and the operator switch.

### 3. Reuse shared zone-filter / scope analyzer helpers instead of duplicating them

`globalTokenAgg` already parses `zoneFilter` and `zoneScope`. `globalZoneAgg` should share that parsing path so compiler semantics do not drift.

If the current helper names are too `globalTokenAgg`-specific, rename or wrap them into neutral aggregation helper names rather than copy-pasting the logic.

### 4. Add `evaluateGlobalZoneAggregate` to `policy-evaluation-core.ts`

Iterate `this.input.def.zones`, apply `matchesZoneScope` and `matchesZoneFilter`, then read one value per matching zone:

- `source: 'variable'`: `this.input.state.zoneVars[String(zoneDef.id)]?.[field]`
- `source: 'attribute'`: `zoneDef.attributes?.[field]`

Aggregation semantics:
- `count`: count matching zones, ignoring the field value
- `sum`: sum numeric values; return `0` when no numeric values matched
- `min` / `max`: evaluate only numeric values; return `undefined` when no numeric values matched

Do not coerce strings or booleans to numbers. Array-valued attributes must be ignored.

### 5. Wire into `evaluateExpr` dispatcher

Replace the fail-fast `globalZoneAgg` branch with a call to `evaluateGlobalZoneAggregate`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify) — add analyzer, wire into dispatcher, and share zone-filter / scope parsing cleanly
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add evaluator, wire into dispatcher
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify) — compilation tests
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify) — evaluation tests

## Out of Scope

- `globalTokenAgg` expression contracts or semantics beyond small local cleanup needed to keep shared helper paths tidy
- `adjacentTokenAgg` expression (ticket 96GLOSTAAGG-005)
- FITL integration/golden coverage (ticket 96GLOSTAAGG-006)
- Schema/type contract redesign; that landed in 001 unless a concrete defect is discovered
- A broad aggregate-framework rewrite spanning every policy evaluator
- Any runner package changes

## Acceptance Criteria

### Tests That Must Pass

1. Compilation: valid `globalZoneAgg` with explicit `source: variable` compiles correctly.
2. Compilation: valid `globalZoneAgg` with explicit `source: attribute` compiles correctly.
3. Compilation: omitted `source` defaults to compiled `source: 'variable'`.
4. Compilation: missing `field` produces a diagnostic error.
5. Compilation: invalid `aggOp` produces a diagnostic error.
6. Compilation: `zoneScope` defaults to `'board'` when omitted.
7. Evaluation: summing a zone variable across filtered board zones returns the correct total.
8. Evaluation: counting matching zones ignores `field` and counts filtered zones correctly.
9. Evaluation: min/max on zone attributes returns the correct extrema.
10. Evaluation: `source: 'attribute'` reads from `zoneDef.attributes`, not `state.zoneVars`.
11. Evaluation: `source: 'variable'` reads from `state.zoneVars`, not `zoneDef.attributes`.
12. Evaluation: empty `sum` returns `0`, while empty `min` / `max` return `undefined`.
13. Evaluation: non-numeric attribute values, including array-valued attributes, are ignored for numeric aggregation.
14. Existing relevant engine tests plus repo-required broad validation pass cleanly.

### Invariants

1. Aggregation is pure and deterministic (Foundation #5).
2. Iteration is bounded by `def.zones.length` (Foundation #6).
3. No state mutation (Foundation #7).
4. No game-specific logic (Foundation #1).
5. No compatibility aliases, shims, or duplicate aggregation shapes are introduced (Foundation #9).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts`
   Rationale: proves YAML `globalZoneAgg` compilation, defaulted `source`, required `field`, invalid `aggOp`, and default `zoneScope`.
2. `packages/engine/test/unit/agents/policy-eval.test.ts`
   Rationale: proves runtime aggregation semantics for variable/attribute sources, count semantics, empty-result behavior split by op family, and non-numeric attribute filtering.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test --test-name-pattern "globalZoneAgg" packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-30

What actually changed:
- Corrected the ticket first to match the real codebase: `globalZoneAgg` already existed in the compiled AST/schema layer, `source` defaults to `variable` at the YAML layer, and empty-result semantics had to align with the already-shipped aggregate architecture.
- Implemented `globalZoneAgg` analysis in `packages/engine/src/agents/policy-expr.ts`, including dispatcher wiring, `source` defaulting, required `field` validation, and shared zone-filter / zone-scope parsing reuse instead of duplicated compiler logic.
- Implemented `globalZoneAgg` evaluation in `packages/engine/src/agents/policy-evaluation-core.ts`, reusing the existing zone scope/filter helpers and correctly separating variable-source reads from attribute-source reads.
- Added unit coverage for compiler behavior and runtime behavior, including defaulted `source`, count semantics, source isolation, empty extrema semantics, and ignoring non-numeric / array-valued zone attributes for numeric aggregation.

Deviations from original plan:
- The original ticket treated `globalZoneAgg` as entirely absent and required a missing-source diagnostic. That was incorrect; the contract layer was already present, and the spec-defined YAML default for `source` is `variable`.
- Empty-result semantics were corrected from the ticket's blanket "returns 0" wording to the subsystem's existing aggregate semantics: `sum` / `count` return `0`, while empty `min` / `max` return `undefined`.
- A small compiler cleanup was folded in by generalizing zone-filter / zone-scope analyzer helpers instead of duplicating `globalTokenAgg` parsing logic under new names.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `node --test --test-name-pattern "globalZoneAgg" packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
- `pnpm turbo typecheck`
- `pnpm turbo lint`

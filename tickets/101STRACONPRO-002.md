# 101STRACONPRO-002: Compile strategic conditions in compile-agents.ts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — cnl compile-agents.ts
**Deps**: `archive/tickets/101STRACONPRO-001.md`

## Problem

Strategic conditions declared in GameSpecDoc YAML need to be compiled into the `AgentPolicyCatalog`. The compiler must validate type correctness (boolean target, numeric proximity.current, threshold > 0), detect cycles in cross-condition references, and track dependencies — following the established patterns for state features and candidate features.

## Assumption Reassessment (2026-03-31)

1. `AgentLibraryCompiler` at `compile-agents.ts:928` uses `stateFeatureStatus` (line 940) and `candidateFeatureStatus` (line 941) maps with `'compiling' | 'done' | 'failed'` states for cycle detection. Pattern confirmed — strategic conditions will follow the same approach.
2. `compileStateFeature` at line ~1017 shows the pattern: check status → set 'compiling' → analyze expression → set 'done'/'failed'. Confirmed.
3. `analyzePolicyExpr` is the core method for type-checking policy expressions. It returns typed analysis results. Confirmed — will be used for `target` (must be boolean) and `proximity.current` (must be number).
4. After ticket 001, `CompiledStrategicCondition` and the `strategicConditions` field on `CompiledAgentLibraryIndex` exist.

## Architecture Check

1. Follows the exact same compilation pattern as `compileStateFeature` — status map, cycle detection, `analyzePolicyExpr` for type checking. No new patterns introduced.
2. Strategic conditions compile from GameSpecDoc YAML (game-specific) to compiled catalog (agnostic). The compiler validates generic type constraints, not game-specific semantics.
3. No backwards-compatibility shims — new compilation pathway that produces output in the new `strategicConditions` field.

## What to Change

### 1. Status map for strategic conditions

Add to `AgentLibraryCompiler`:
```typescript
private readonly strategicConditionStatus = new Map<string, 'compiling' | 'done' | 'failed'>();
```

### 2. `compileStrategicCondition(id: string)` method

Following the `compileStateFeature` pattern:

1. Check `strategicConditionStatus` — return early if `'done'`, emit diagnostic if `'compiling'` (cycle detected), return early if `'failed'`
2. Set status to `'compiling'`
3. Analyze `target` via `analyzePolicyExpr` — must produce `boolean` type. Emit diagnostic if not boolean.
4. If `proximity` is present:
   - Analyze `proximity.current` via `analyzePolicyExpr` — must produce `number` type. Emit diagnostic if not numeric.
   - Validate `proximity.threshold > 0`. Emit diagnostic if <= 0.
5. Build `CompiledStrategicCondition` with compiled expressions
6. Set status to `'done'` (or `'failed'` on errors)
7. Store in the output catalog's `library.strategicConditions` record

### 3. Invoke compilation for all declared conditions

In the main library compilation flow (where `compileStateFeature` is called for each state feature), add a loop over `spec.agents.library.strategicConditions` entries, calling `compileStrategicCondition` for each.

### 4. Handle `condition.COND_ID.*` references during expression analysis

When `analyzePolicyExpr` encounters a ref path starting with `condition.`, it must:
- Extract the condition ID and field (`satisfied` or `proximity`)
- Ensure the referenced condition is compiled (call `compileStrategicCondition` if not yet done — enables forward references)
- Record the condition ID in the expression's dependency tracking (`CompiledAgentDependencyRefs.strategicConditions`)
- Return the correct type: `boolean` for `satisfied`, `number` for `proximity`

### 5. Dependency refs population

When building `CompiledAgentDependencyRefs` for any expression that references `condition.X.satisfied` or `condition.X.proximity`, add `X` to the `strategicConditions` array.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify) — status map, `compileStrategicCondition`, condition ref handling in expression analysis, dependency tracking

## Out of Scope

- Type definitions (ticket 001)
- Ref path parsing in `policy-surface.ts` (ticket 003)
- Runtime evaluation in `policy-evaluation-core.ts` (ticket 004)
- Integration/FITL tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. A strategic condition with a boolean `target` expression compiles successfully
2. A strategic condition with `proximity` (numeric `current`, positive `threshold`) compiles successfully
3. A condition with non-boolean `target` produces a compiler diagnostic
4. A condition with non-numeric `proximity.current` produces a compiler diagnostic
5. A condition with `threshold <= 0` produces a compiler diagnostic
6. A cross-condition reference (`condition.A` referencing `condition.B.satisfied`) compiles correctly
7. A cyclic cross-condition reference (`A → B → A`) produces a compiler diagnostic
8. Compiled output includes correct `strategicConditions` in the library index
9. Dependency refs correctly list referenced strategic conditions
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cycle detection follows the same status-map pattern as `compileStateFeature`
2. Type checking uses `analyzePolicyExpr` — no ad-hoc type inference
3. No game-specific identifiers in compilation logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-strategic-condition.test.ts` — new file covering: successful compilation, type validation diagnostics, cycle detection, cross-condition references, dependency tracking, threshold validation

### Commands

1. `node --test packages/engine/test/unit/compile-agents-strategic-condition.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
